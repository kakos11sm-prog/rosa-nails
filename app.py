# -*- coding: utf-8 -*-
"""ROSA — нігтьова студія. Запис на сайті, заявки в журнал і в Telegram."""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

import gcal

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "bookings.json"
SITE = ROOT / "site"

load_dotenv(ROOT / ".env")

app = Flask(__name__, static_folder=str(SITE), static_url_path="/static")

CLOSED_WEEKDAY = 0  # понеділок
TZ = ZoneInfo("Europe/Kyiv")
TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"]
SERVICE_MINUTES = {
    "Манікюр + покриття": 90,
    "Манікюр + дизайн": 110,
    "Педикюр + покриття": 90,
    "Зняття / корекція": 45,
    "Комплекс руки + ноги": 180,
}
SERVICES = set(SERVICE_MINUTES)
MASTERS = {"Аля", "Єлизавета"}


def service_minutes(name: str) -> int:
    return SERVICE_MINUTES.get(name, 90)


def slot_bounds(date: str, time: str, minutes: int) -> tuple[datetime, datetime]:
    start = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
    return start, start + timedelta(minutes=minutes)


def _load() -> list[dict]:
    if not DATA.is_file():
        return []
    try:
        raw = json.loads(DATA.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return list(raw) if isinstance(raw, list) else []


def _save(rows: list[dict]) -> None:
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slot_taken(
    master: str,
    date: str,
    time: str,
    service: str = "",
    rows: list[dict] | None = None,
    busy: list[tuple[datetime, datetime]] | None = None,
) -> bool:
    rows = rows if rows is not None else _load()
    start, end = slot_bounds(date, time, service_minutes(service))
    for row in rows:
        if row.get("master") != master or row.get("date") != date:
            continue
        if row.get("status") == "cancelled":
            continue
        if row.get("google_event_id"):
            continue
        other_start, other_end = slot_bounds(
            row["date"], row["time"], service_minutes(str(row.get("service") or ""))
        )
        if start < other_end and other_start < end:
            return True
    ranges = busy if busy is not None else gcal.busy_ranges(master, date)
    return any(start < busy_end and busy_start < end for busy_start, busy_end in ranges)


def free_times(master: str, date: str, service: str = "") -> list[str]:
    try:
        day = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return []
    if day.weekday() == CLOSED_WEEKDAY:
        return []
    ok, events = gcal.list_day_events(date)
    rows = _load()
    if ok:
        rows = _drop_deleted_calendar_bookings(
            date, rows, {str(event.get("id") or "") for event in events if event.get("id")}
        )
        busy = gcal.busy_from_events(master, date, events)
    else:
        busy = []
    return [time for time in TIMES if not slot_taken(master, date, time, service, rows, busy)]


def first_bookable_date() -> datetime:
    day = datetime.now(TZ).date() + timedelta(days=1)
    while day.weekday() == CLOSED_WEEKDAY:
        day += timedelta(days=1)
    return datetime.combine(day, datetime.min.time())


def open_dates(master: str, service: str = "", horizon: int = 90) -> list[str]:
    start = first_bookable_date()
    end = start + timedelta(days=horizon)
    ok, events = gcal.list_range_events(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))
    rows = _load()
    out = []
    day = start
    while day <= end:
        if day.weekday() != CLOSED_WEEKDAY:
            date = day.strftime("%Y-%m-%d")
            busy = gcal.busy_from_events(master, date, events) if ok else []
            if any(not slot_taken(master, date, time, service, rows, busy) for time in TIMES):
                out.append(date)
        day += timedelta(days=1)
    return out


def _drop_deleted_calendar_bookings(date: str, rows: list[dict], event_ids: set[str]) -> list[dict]:
    changed = False
    for row in rows:
        event_id = str(row.get("google_event_id") or "")
        if not event_id or row.get("date") != date:
            continue
        if row.get("status") == "cancelled":
            continue
        if event_id not in event_ids:
            row["status"] = "cancelled"
            changed = True
    if changed:
        _save(rows)
    return rows


def add_booking(payload: dict) -> dict:
    name = str(payload.get("name") or "").strip()
    phone = str(payload.get("phone") or "").strip()
    service = str(payload.get("service") or "").strip()
    master = str(payload.get("master") or payload.get("barber") or "").strip()
    date = str(payload.get("date") or "").strip()
    time = str(payload.get("time") or "").strip()
    source = str(payload.get("source") or "site").strip() or "site"

    if not name or not phone:
        raise ValueError("вкажіть ім’я і телефон")
    if service not in SERVICES:
        raise ValueError("оберіть послугу зі списку")
    if master not in MASTERS:
        raise ValueError("оберіть майстра")
    if time not in TIMES:
        raise ValueError("цей час не в графіку")
    try:
        day = datetime.strptime(date, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("некоректна дата") from exc
    if day.weekday() == CLOSED_WEEKDAY:
        raise ValueError("понеділок — вихідний")

    rows = _load()
    if slot_taken(master, date, time, service, rows):
        raise ValueError("цей слот уже зайнятий")

    row = {
        "id": str(uuid.uuid4())[:8],
        "name": name,
        "phone": phone,
        "service": service,
        "master": master,
        "date": date,
        "time": time,
        "source": source,
        "status": "pending",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "telegram_id": str(payload.get("telegram_id") or "").strip(),
    }
    rows.append(row)
    _save(rows)
    return row


def _find_booking(booking_id: str, rows: list[dict] | None = None) -> dict | None:
    rows = rows if rows is not None else _load()
    return next((row for row in rows if row.get("id") == booking_id), None)


def confirm_booking(booking_id: str) -> dict:
    rows = _load()
    row = _find_booking(booking_id, rows)
    if not row:
        raise ValueError("заявку не знайдено")
    if row.get("status") == "cancelled":
        raise ValueError("заявку вже скасовано")
    if row.get("google_event_id") and row.get("status") == "confirmed":
        return row
    event_id = gcal.create_event(row, service_minutes(str(row.get("service") or "")))
    row["status"] = "confirmed"
    if event_id:
        row["google_event_id"] = event_id
    _save(rows)
    return row


def link_telegram(booking_id: str, chat_id: str) -> dict:
    rows = _load()
    row = _find_booking(booking_id, rows)
    if not row:
        raise ValueError("заявку не знайдено")
    row["telegram_id"] = str(chat_id).strip()
    _save(rows)
    return row


def notify_client(row: dict, text: str) -> bool:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat = str(row.get("telegram_id") or "").strip()
    if not token or not chat:
        return False
    try:
        import urllib.request

        payload = {"chat_id": chat, "text": text}
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=12)
        return True
    except OSError:
        return False


def client_decision_text(row: dict, accepted: bool) -> str:
    slot = f"{row.get('date')} {row.get('time')}, майстер {row.get('master')}"
    if accepted:
        return (
            f"ROSA · запис підтверджено.\n{slot}\n{row.get('service')}.\n"
            f"Чекаємо вас у студії."
        )
    return (
        f"ROSA · цей час не підтвердили.\n{slot}\n"
        f"Запис не створено. Оберіть інший слот на сайті або напишіть /start."
    )


def reject_booking(booking_id: str) -> dict:
    rows = _load()
    row = _find_booking(booking_id, rows)
    if not row:
        raise ValueError("заявку не знайдено")
    row["status"] = "cancelled"
    _save(rows)
    return row


def telegram_ready() -> bool:
    return bool(
        (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
        and (os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or "").strip()
    )


def booking_text(row: dict) -> str:
    return (
        f"ROSA · нова заявка · {row.get('source')}\n"
        f"{row.get('date')} {row.get('time')} · {row.get('master')}\n"
        f"{row.get('service')}\n"
        f"{row.get('name')} · {row.get('phone')}\n"
        f"#{row.get('id')}\n\n"
        f"Додати запис у календар?"
    )


def notify_admin(row: dict) -> bool:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat = (os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or "").strip()
    if not token or not chat:
        return False
    try:
        import urllib.request

        payload = {
            "chat_id": chat,
            "text": booking_text(row),
            "reply_markup": {
                "inline_keyboard": [[
                    {"text": "Так, записати", "callback_data": f"ok:{row['id']}"},
                    {"text": "Ні", "callback_data": f"no:{row['id']}"},
                ]]
            },
        }
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=12)
        return True
    except OSError:
        return False


def bot_username() -> str:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        return ""
    try:
        import json as json_lib
        import urllib.request

        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getMe", timeout=8) as resp:
            data = json_lib.loads(resp.read().decode("utf-8"))
        return str((data.get("result") or {}).get("username") or "")
    except OSError:
        return ""


@app.get("/")
def index():
    return send_from_directory(SITE, "index.html")


@app.get("/book")
def book_page():
    return send_from_directory(SITE, "book.html")


@app.get("/status/<booking_id>")
def status_page(booking_id):
    return send_from_directory(SITE, "status.html")


@app.get("/api/status/<booking_id>")
def booking_status(booking_id):
    row = _find_booking(str(booking_id or "").strip())
    if not row:
        return jsonify({"ok": False, "error": "заявку не знайдено"}), 404
    return jsonify({
        "ok": True,
        "id": row.get("id"),
        "status": row.get("status"),
        "date": row.get("date"),
        "time": row.get("time"),
        "master": row.get("master"),
        "service": row.get("service"),
    })


@app.get("/api/config")
def config():
    user = bot_username()
    return jsonify({
        "ok": True,
        "bot_url": f"https://t.me/{user}" if user else "",
        "calendar": gcal.configured(),
    })


@app.get("/api/slots")
def list_slots():
    master = str(request.args.get("master") or "").strip()
    date = str(request.args.get("date") or "").strip()
    service = str(request.args.get("service") or "").strip()
    if master and master not in MASTERS:
        return jsonify({"ok": False, "error": "оберіть майстра"}), 400
    times = free_times(master, date, service) if master and date else []
    resp = jsonify({"ok": True, "times": times, "calendar": gcal.configured()})
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/days")
def list_days():
    master = str(request.args.get("master") or "").strip()
    service = str(request.args.get("service") or "").strip()
    if master and master not in MASTERS:
        return jsonify({"ok": False, "error": "оберіть майстра"}), 400
    days = open_dates(master, service) if master else []
    resp = jsonify({"ok": True, "days": days})
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/bookings")
def list_bookings():
    return jsonify({"ok": True, "bookings": _load()})


@app.post("/api/book")
def create_booking():
    payload = request.get_json(silent=True) or {}
    try:
        row = add_booking(payload)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    if not notify_admin(row):
        try:
            row = confirm_booking(row["id"])
        except ValueError:
            pass
    user = bot_username()
    return jsonify({
        "ok": True,
        "booking": row,
        "pending": row.get("status") == "pending",
        "bot_url": f"https://t.me/{user}" if user else "",
    })


DATA.parent.mkdir(parents=True, exist_ok=True)
if not DATA.is_file():
    _save([])
gcal.ensure_calendar_timezone()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5051"))
    app.run(host="0.0.0.0", port=port, debug=False)
