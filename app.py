# -*- coding: utf-8 -*-
"""ROSA — нігтьова студія. Запис на сайті, заявки в журнал і в Telegram."""
from __future__ import annotations

import hmac
import json
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory, session

import gcal

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "bookings.json"
CONTENT_FILE = ROOT / "data" / "content.json"
SITE = ROOT / "site"
UPLOADS = SITE / "img" / "uploads"

load_dotenv(ROOT / ".env")

app = Flask(__name__, static_folder=str(SITE), static_url_path="/static")
app.secret_key = (os.environ.get("SECRET_KEY") or "rosa-local-dev").strip()
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = bool(os.environ.get("RENDER"))
app.permanent_session_lifetime = timedelta(days=30)

CLOSED_WEEKDAY = 0  # понеділок
TZ = ZoneInfo("Europe/Kyiv")
TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"]
SERVICE_MINUTES = {
    "Комплекс з покриттям": 90,
    "Комплекс з укріпленням": 110,
    "Гігієнічний манікюр без покриття": 60,
    "Зняття без подальшого покриття": 30,
    "Нарощення (довжина 1–2)": 150,
    "Нарощення на тіпсі": 150,
    "Нарощення 1 нігтя": 45,
    "Відновлення архітектури": 45,
    "Педикюр: комплекс гігієна": 90,
    "Педикюр: комплекс з покриттям": 90,
    "Педикюр: покриття тільки пальці": 75,
    "Педикюр без покриття": 60,
    "Педикюр: зняття покриття": 30,
    "Манікюр + покриття": 90,
    "Манікюр + дизайн": 110,
    "Педикюр + покриття": 90,
    "Зняття / корекція": 45,
    "Комплекс руки + ноги": 180,
}
def load_content() -> dict:
    if CONTENT_FILE.is_file():
        try:
            data = json.loads(CONTENT_FILE.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data:
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return {}


def save_content(data: dict) -> None:
    CONTENT_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONTENT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def catalog_services() -> dict[str, int]:
    names: dict[str, int] = {}
    for section in (load_content().get("price") or {}).get("sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("book") or item.get("name") or "").strip()
            if not name:
                continue
            try:
                mins = int(item.get("mins") or 90)
            except (TypeError, ValueError):
                mins = 90
            names[name] = mins
    return names or dict(SERVICE_MINUTES)


def catalog_look_names() -> set[str]:
    names: set[str] = set()
    for item in (load_content().get("looks") or {}).get("items") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if name:
            names.add(name)
    return names


def catalog_masters() -> set[str]:
    ids = []
    for master in load_content().get("masters") or []:
        if isinstance(master, dict):
            ident = str(master.get("id") or "").strip()
            if ident:
                ids.append(ident)
    return set(ids) or {"Аля", "Єлизавета"}


def service_minutes(name: str) -> int:
    return catalog_services().get(name, 90)


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
    skip_id: str = "",
) -> bool:
    rows = rows if rows is not None else _load()
    start, end = slot_bounds(date, time, service_minutes(service))
    for row in rows:
        if skip_id and row.get("id") == skip_id:
            continue
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


def free_times(master: str, date: str, service: str = "", skip_id: str = "") -> list[str]:
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
    return [
        time
        for time in TIMES
        if not slot_taken(master, date, time, service, rows, busy, skip_id)
    ]


def first_bookable_date() -> datetime:
    day = datetime.now(TZ).date() + timedelta(days=1)
    while day.weekday() == CLOSED_WEEKDAY:
        day += timedelta(days=1)
    return datetime.combine(day, datetime.min.time())


def open_dates(master: str, service: str = "", horizon: int = 90, skip_id: str = "") -> list[str]:
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
            if any(not slot_taken(master, date, time, service, rows, busy, skip_id) for time in TIMES):
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
    design = str(payload.get("design") or "").strip()
    master = str(payload.get("master") or payload.get("barber") or "").strip()
    date = str(payload.get("date") or "").strip()
    time = str(payload.get("time") or "").strip()
    source = str(payload.get("source") or "site").strip() or "site"
    looks = catalog_look_names()

    if not name or not phone:
        raise ValueError("вкажіть ім’я і телефон")
    if service not in catalog_services():
        raise ValueError("оберіть послугу зі списку")
    if design and looks and design not in looks:
        raise ValueError("оберіть дизайн зі списку")
    if master not in catalog_masters():
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
        "design": design,
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


UA_MONTHS = (
    "січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
)
UA_WEEKDAYS = ("понеділок", "вівторок", "середа", "четвер", "п’ятниця", "субота", "неділя")
UA_WEEKDAYS_SHORT = ("пн", "вт", "ср", "чт", "пт", "сб", "нд")


def pretty_date(date: str) -> str:
    day = datetime.strptime(date, "%Y-%m-%d")
    return f"{day.day} {UA_MONTHS[day.month - 1]}, {UA_WEEKDAYS[day.weekday()]}"


def site_base() -> str:
    return (
        os.environ.get("PUBLIC_SITE_URL")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or "https://lissanails.com.ua"
    ).rstrip("/")


def status_url(booking_id: str) -> str:
    return f"{site_base()}/status/{booking_id}"


def expand_date(raw: str) -> str:
    return datetime.strptime(raw, "%Y%m%d").strftime("%Y-%m-%d")


def expand_time(raw: str) -> str:
    if len(raw) == 4 and raw.isdigit():
        return f"{raw[:2]}:{raw[2:]}"
    return raw


def _patch_booking(booking_id: str, **fields) -> dict:
    rows = _load()
    row = _find_booking(booking_id, rows)
    if not row:
        raise ValueError("заявку не знайдено")
    row.update(fields)
    _save(rows)
    return row


def confirm_booking(booking_id: str) -> dict:
    rows = _load()
    row = _find_booking(booking_id, rows)
    if not row:
        raise ValueError("заявку не знайдено")
    if row.get("status") == "cancelled":
        raise ValueError("заявку вже скасовано")
    if row.get("status") == "offered":
        raise ValueError("чекаємо, поки клієнт обере з запропонованих годин")
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
            f"ROSA · запис підтверджено.\n{slot}\n{row.get('service')}"
            + (f" · {row.get('design')}" if row.get("design") else "")
            + ".\nЧекаємо вас у студії."
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
    row["offers"] = []
    row["reschedule"] = {}
    _save(rows)
    return row


def _admin_chat() -> str:
    return str(os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or "").strip()


def date_keyboard(booking_id: str, dates: list[str]) -> list[list[dict]]:
    rows: list[list[dict]] = []
    line: list[dict] = []
    for date in dates:
        day = datetime.strptime(date, "%Y-%m-%d")
        label = f"{UA_WEEKDAYS_SHORT[day.weekday()]} {day.strftime('%d.%m')}"
        line.append({"text": label, "callback_data": f"dt:{booking_id}:{date.replace('-', '')}"})
        if len(line) == 3:
            rows.append(line)
            line = []
    if line:
        rows.append(line)
    rows.append([{"text": "Ні, скасувати запис", "callback_data": f"no:{booking_id}"}])
    return rows


def time_keyboard(booking_id: str, date: str, master: str, service: str, picked: list[str]) -> list[list[dict]]:
    line: list[dict] = []
    rows: list[list[dict]] = []
    for time in TIMES:
        taken = slot_taken(master, date, time, service, skip_id=booking_id)
        compact = time.replace(":", "")
        if taken:
            btn = {"text": f"{time} · зайнято", "callback_data": f"xx:{booking_id}"}
        else:
            mark = "✓ " if time in picked else ""
            btn = {"text": f"{mark}{time}", "callback_data": f"tm:{booking_id}:{compact}"}
        line.append(btn)
        if len(line) == 2:
            rows.append(line)
            line = []
    if line:
        rows.append(line)
    rows.append([{"text": "Надіслати клієнту", "callback_data": f"go:{booking_id}"}])
    rows.append([{"text": "Інша дата", "callback_data": f"mv:{booking_id}"}])
    return rows


def times_text(row: dict, date: str, picked: list[str]) -> str:
    chosen = ", ".join(picked) if picked else "поки нічого"
    return (
        f"Інший час для #{row.get('id')}\n"
        f"{row.get('name')} · було {row.get('date')} {row.get('time')}\n"
        f"{pretty_date(date)}\n"
        f"Вільні години можна тиснути кілька разів. Зайняті — сірі.\n"
        f"Обрано: {chosen}"
    )


def start_reschedule(booking_id: str) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    if row.get("status") in {"cancelled", "confirmed"}:
        raise ValueError("цю заявку вже закрито")
    days = open_dates(str(row.get("master") or ""), str(row.get("service") or ""), skip_id=booking_id)[:15]
    if not days:
        return "Немає вільних днів у розкладі.", [], ""
    _patch_booking(booking_id, reschedule={"date": "", "picked": []})
    text = (
        f"Інший час для #{row.get('id')}\n"
        f"{row.get('name')} · зараз {row.get('date')} {row.get('time')}\n"
        f"Оберіть дату:"
    )
    return text, date_keyboard(booking_id, days), ""


def show_offer_times(booking_id: str, date: str) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    _patch_booking(booking_id, reschedule={"date": date, "picked": []})
    master = str(row.get("master") or "")
    service = str(row.get("service") or "")
    return times_text(row, date, []), time_keyboard(booking_id, date, master, service, []), ""


def toggle_offer_time(booking_id: str, time: str) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    state = dict(row.get("reschedule") or {})
    date = str(state.get("date") or "")
    picked = [str(item) for item in (state.get("picked") or [])]
    if not date:
        raise ValueError("спочатку оберіть дату")
    master = str(row.get("master") or "")
    service = str(row.get("service") or "")
    if time in picked:
        picked.remove(time)
    else:
        if slot_taken(master, date, time, service, skip_id=booking_id):
            return None, None, "Цей час уже зайнятий"
        picked.append(time)
        picked.sort()
    _patch_booking(booking_id, reschedule={"date": date, "picked": picked})
    return times_text(row, date, picked), time_keyboard(booking_id, date, master, service, picked), ""


def send_offers(booking_id: str) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    state = dict(row.get("reschedule") or {})
    date = str(state.get("date") or "")
    picked = [str(item) for item in (state.get("picked") or [])]
    if not date or not picked:
        return None, None, "Оберіть хоча б один вільний час"
    offers = [{"date": date, "time": item} for item in picked]
    row = _patch_booking(booking_id, status="offered", offers=offers)
    notify_client(row, client_offer_text(row))
    return (
        f"Надіслала клієнту інші години.\n"
        f"#{row.get('id')} · {pretty_date(date)}\n"
        f"{', '.join(picked)}\n"
        f"Чекаємо, поки обере на сайті.",
        [],
        "",
    )


def client_offer_text(row: dict) -> str:
    offers = row.get("offers") or []
    date = str((offers[0] or {}).get("date") or row.get("date") or "") if offers else str(row.get("date") or "")
    times = ", ".join(str(item.get("time") or "") for item in offers)
    return (
        f"ROSA · цей час не підходить, пропонуємо інший.\n"
        f"Було: {row.get('date')} {row.get('time')}, {row.get('master')}.\n"
        f"Нові варіанти {pretty_date(date) if date else ''}: {times}.\n"
        f"Оберіть зручний на сторінці запису:\n{status_url(str(row.get('id') or ''))}"
    )


def day_slot_view(row: dict) -> list[dict]:
    offers = row.get("offers") or []
    if not offers:
        return []
    date = str(offers[0].get("date") or "")
    wanted = {str(item.get("time") or "") for item in offers}
    master = str(row.get("master") or "")
    service = str(row.get("service") or "")
    free = set(free_times(master, date, service, skip_id=str(row.get("id") or "")))
    out = []
    for time in TIMES:
        if time in wanted:
            kind = "offer" if time in free else "busy"
        elif time not in free:
            kind = "busy"
        else:
            continue
        out.append({"date": date, "time": time, "kind": kind})
    return out


def accept_offer(booking_id: str, date: str, time: str) -> dict:
    rows = _load()
    row = _find_booking(booking_id, rows)
    if not row:
        raise ValueError("заявку не знайдено")
    if row.get("status") != "offered":
        raise ValueError("зараз немає пропозицій")
    offers = row.get("offers") or []
    if not any(str(item.get("date")) == date and str(item.get("time")) == time for item in offers):
        raise ValueError("ця година не серед запропонованих")
    if slot_taken(str(row.get("master") or ""), date, time, str(row.get("service") or ""), rows, skip_id=booking_id):
        raise ValueError("цей час уже зайняли, оберіть інший")
    row["date"] = date
    row["time"] = time
    row["status"] = "pending"
    row["offers"] = []
    row["reschedule"] = {}
    _save(rows)
    notify_admin_rescheduled(row)
    return row


def client_cancel_booking(booking_id: str) -> dict:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    if row.get("status") in {"confirmed", "cancelled"}:
        raise ValueError("цю заявку вже закрито")
    row = reject_booking(booking_id)
    chat = _admin_chat()
    if chat:
        _telegram_call(
            "sendMessage",
            {
                "chat_id": chat,
                "text": (
                    f"Клієнт скасував заявку #{row.get('id')}.\n"
                    f"{row.get('name')} · {row.get('date')} {row.get('time')} · {row.get('master')}"
                ),
            },
        )
    return row


def notify_admin_rescheduled(row: dict) -> bool:
    chat = _admin_chat()
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token or not chat:
        return False
    return _telegram_call(
        "sendMessage",
        {
            "chat_id": chat,
            "text": (
                f"ROSA · клієнт перезаписався\n"
                f"{row.get('date')} {row.get('time')} · {row.get('master')}\n"
                f"{row.get('service')}\n"
                + (f"Дизайн: {row.get('design')}\n" if row.get("design") else "")
                + f"{row.get('name')} · {row.get('phone')}\n"
                f"#{row.get('id')}\n\n"
                f"Додати цей час у календар?"
            ),
            "reply_markup": {
                "inline_keyboard": [[
                    {"text": "Так, записати", "callback_data": f"ok:{row['id']}"},
                    {"text": "Ні", "callback_data": f"no:{row['id']}"},
                ]]
            },
        },
    )


def _telegram_call(method: str, payload: dict) -> bool:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        return False
    try:
        import urllib.request

        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/{method}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=12)
        return True
    except OSError:
        return False


def apply_admin_decision(action: str, booking_id: str, chat_id: str = "") -> str:
    if _admin_chat() and chat_id and chat_id != _admin_chat():
        return "Підтверджувати може лише адміністратор студії."
    if action == "ok":
        row = confirm_booking(booking_id)
        extra = " і в Google Календар" if row.get("google_event_id") else ""
        sent = notify_client(row, client_decision_text(row, True))
        return (
            f"Записала{extra}.\n"
            f"{row.get('date')} {row.get('time')} · {row.get('master')}\n"
            f"{row.get('name')} · {row.get('phone')}\n#{row.get('id')}\n"
            f"{'Клієнту написала в Telegram.' if sent else 'Клієнту в Telegram не написала — зателефонуйте.'}"
        )
    if action == "no":
        row = reject_booking(booking_id)
        sent = notify_client(row, client_decision_text(row, False))
        phone = str(row.get("phone") or "")
        return (
            f"Відхилила. Слот вільний.\n"
            f"{row.get('date')} {row.get('time')} · {row.get('master')}\n#{row.get('id')}\n"
            f"{'Клієнту написала, що запис не підтверджено.' if sent else 'Клієнту в Telegram не написала — зателефонуйте: ' + phone}"
        )
    raise ValueError("незрозуміла дія")


def apply_admin_callback(action: str, booking_id: str, extra: str, chat_id: str) -> tuple[str | None, list | None, str]:
    if _admin_chat() and chat_id and chat_id != _admin_chat():
        return "Підтверджувати може лише адміністратор студії.", [], ""
    if action == "ok":
        return apply_admin_decision("ok", booking_id, chat_id), [], ""
    if action == "no":
        return apply_admin_decision("no", booking_id, chat_id), [], ""
    if action == "xx":
        return None, None, "Цей час уже зайнятий"
    if action == "mv":
        return start_reschedule(booking_id)
    if action == "dt":
        return show_offer_times(booking_id, expand_date(extra))
    if action == "tm":
        return toggle_offer_time(booking_id, expand_time(extra))
    if action == "go":
        return send_offers(booking_id)
    raise ValueError("незрозуміла дія")


def handle_telegram_update(update: dict) -> None:
    query = update.get("callback_query") or {}
    if query:
        data = str(query.get("data") or "")
        qid = query.get("id")
        message = query.get("message") or {}
        chat_id = str((message.get("chat") or {}).get("id") or "")
        mid = message.get("message_id")
        parts = data.split(":")
        action = parts[0] if parts else ""
        booking_id = parts[1] if len(parts) > 1 else ""
        extra = parts[2] if len(parts) > 2 else ""
        text: str | None = None
        keyboard: list | None = None
        toast = ""
        try:
            text, keyboard, toast = apply_admin_callback(action, booking_id, extra, chat_id)
        except ValueError as exc:
            text = f"Не вийшло: {exc}"
            keyboard = []
            toast = str(exc)
        if qid:
            payload = {"callback_query_id": qid}
            if toast:
                payload["text"] = toast[:180]
            _telegram_call("answerCallbackQuery", payload)
        if chat_id and mid and text is not None:
            body = {"chat_id": chat_id, "message_id": mid, "text": text}
            if keyboard is not None:
                body["reply_markup"] = {"inline_keyboard": keyboard}
            _telegram_call("editMessageText", body)
        return
    message = update.get("message") or {}
    text = str(message.get("text") or "").strip()
    chat_id = str((message.get("chat") or {}).get("id") or "")
    if not text.startswith("/start") or not chat_id:
        return
    parts = text.split(maxsplit=1)
    payload = parts[1].strip() if len(parts) > 1 else ""
    if not payload.startswith("rosa_"):
        return
    try:
        row = link_telegram(payload[5:], chat_id)
    except ValueError as exc:
        _telegram_call("sendMessage", {"chat_id": chat_id, "text": f"Не знайшла заявку: {exc}"})
        return
    status = row.get("status")
    if status == "confirmed":
        _telegram_call("sendMessage", {"chat_id": chat_id, "text": client_decision_text(row, True)})
        return
    if status == "cancelled":
        _telegram_call("sendMessage", {"chat_id": chat_id, "text": client_decision_text(row, False)})
        return
    if status == "offered":
        _telegram_call("sendMessage", {"chat_id": chat_id, "text": client_offer_text(row)})
        return
    _telegram_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": (
                f"Заявку #{row.get('id')} прив’язала до цього чату.\n"
                f"{row.get('date')} {row.get('time')}, {row.get('master')}.\n"
                f"Сюди напишемо, щойно студія підтвердить або відмовить."
            ),
        },
    )


def ensure_telegram_webhook() -> None:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    base = (
        os.environ.get("TELEGRAM_WEBHOOK_URL")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or ""
    ).strip()
    if not token or not base:
        return
    url = base.rstrip("/") + "/api/telegram"
    _telegram_call("setWebhook", {"url": url, "allowed_updates": ["callback_query", "message"]})


def telegram_ready() -> bool:
    return bool(
        (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
        and (os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or "").strip()
    )


def booking_text(row: dict) -> str:
    design = str(row.get("design") or "").strip()
    extra = f"Дизайн: {design}\n" if design else ""
    return (
        f"ROSA · нова заявка · {row.get('source')}\n"
        f"{row.get('date')} {row.get('time')} · {row.get('master')}\n"
        f"{row.get('service')}\n"
        f"{extra}"
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
                "inline_keyboard": [
                    [
                        {"text": "Так, записати", "callback_data": f"ok:{row['id']}"},
                        {"text": "Ні", "callback_data": f"no:{row['id']}"},
                    ],
                    [{"text": "Запропонувати інший час", "callback_data": f"mv:{row['id']}"}],
                ]
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


@app.get("/admin")
def admin_page():
    return send_from_directory(SITE, "admin.html")


@app.get("/api/content")
def public_content():
    resp = jsonify({"ok": True, "content": load_content()})
    resp.headers["Cache-Control"] = "no-store"
    return resp


def _admin_ok() -> bool:
    return bool(session.get("admin"))


def _admin_password() -> str:
    return (os.environ.get("ADMIN_PASSWORD") or "RosaKvitka26").strip()


@app.get("/api/admin/me")
def admin_me():
    if not _admin_password():
        return jsonify({"ok": False, "error": "адмінку ще не ввімкнено", "ready": False}), 503
    return jsonify({"ok": True, "ready": True, "in": _admin_ok()})


@app.post("/api/admin/login")
def admin_login():
    password = _admin_password()
    if not password:
        return jsonify({"ok": False, "error": "адмінку ще не ввімкнено"}), 503
    given = str((request.get_json(silent=True) or {}).get("password") or "")
    if not given or not hmac.compare_digest(given, password):
        return jsonify({"ok": False, "error": "не той пароль"}), 401
    session.clear()
    session["admin"] = True
    session.permanent = True
    return jsonify({"ok": True})


@app.post("/api/admin/logout")
def admin_logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/admin/content")
def admin_save_content():
    if not _admin_ok():
        return jsonify({"ok": False, "error": "увійдіть"}), 401
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict) or not payload:
        return jsonify({"ok": False, "error": "порожньо"}), 400
    save_content(payload)
    return jsonify({"ok": True})


@app.post("/api/admin/upload")
def admin_upload():
    if not _admin_ok():
        return jsonify({"ok": False, "error": "увійдіть"}), 401
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"ok": False, "error": "немає файлу"}), 400
    name = str(file.filename).lower()
    ext = ".jpg"
    if name.endswith(".png"):
        ext = ".png"
    elif name.endswith(".webp"):
        ext = ".webp"
    elif name.endswith(".jpeg") or name.endswith(".jpg"):
        ext = ".jpg"
    else:
        return jsonify({"ok": False, "error": "лише jpg, png або webp"}), 400
    UPLOADS.mkdir(parents=True, exist_ok=True)
    dest = UPLOADS / f"{uuid.uuid4().hex}{ext}"
    file.save(dest)
    return jsonify({"ok": True, "url": f"/static/img/uploads/{dest.name}"})


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
        "design": row.get("design") or "",
        "offers": row.get("offers") or [],
        "slots": day_slot_view(row) if row.get("status") == "offered" else [],
    })


@app.post("/api/status/<booking_id>/choose")
def choose_offer(booking_id):
    payload = request.get_json(silent=True) or {}
    date = str(payload.get("date") or "").strip()
    time = str(payload.get("time") or "").strip()
    try:
        row = accept_offer(str(booking_id or "").strip(), date, time)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({"ok": True, "booking": row, "status": row.get("status")})


@app.post("/api/status/<booking_id>/cancel")
def cancel_offer(booking_id):
    try:
        row = client_cancel_booking(str(booking_id or "").strip())
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    return jsonify({"ok": True, "booking": row, "status": row.get("status")})


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
    if master and master not in catalog_masters():
        return jsonify({"ok": False, "error": "оберіть майстра"}), 400
    times = free_times(master, date, service) if master and date else []
    resp = jsonify({"ok": True, "times": times, "calendar": gcal.configured()})
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/days")
def list_days():
    master = str(request.args.get("master") or "").strip()
    service = str(request.args.get("service") or "").strip()
    if master and master not in catalog_masters():
        return jsonify({"ok": False, "error": "оберіть майстра"}), 400
    days = open_dates(master, service) if master else []
    resp = jsonify({"ok": True, "days": days})
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/bookings")
def list_bookings():
    return jsonify({"ok": True, "bookings": _load()})


@app.post("/api/telegram")
def telegram_webhook():
    handle_telegram_update(request.get_json(silent=True) or {})
    return "ok"


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
ensure_telegram_webhook()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5051"))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
