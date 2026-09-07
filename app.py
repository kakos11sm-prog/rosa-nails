# -*- coding: utf-8 -*-
"""ROSA — нігтьова студія. Запис на сайті, заявки в журнал і в Telegram."""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "bookings.json"
SITE = ROOT / "site"

load_dotenv(ROOT / ".env")

app = Flask(__name__, static_folder=str(SITE), static_url_path="/static")

CLOSED_WEEKDAY = 0  # понеділок
TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"]
SERVICES = {
    "Манікюр + покриття",
    "Манікюр + дизайн",
    "Педикюр + покриття",
    "Зняття / корекція",
    "Комплекс руки + ноги",
}
MASTERS = {"Оля", "Катя"}


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


def slot_taken(master: str, date: str, time: str, rows: list[dict] | None = None) -> bool:
    rows = rows if rows is not None else _load()
    key = (master.strip(), date.strip(), time.strip())
    return any(
        (r.get("master"), r.get("date"), r.get("time")) == key and r.get("status") != "cancelled"
        for r in rows
    )


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
    if slot_taken(master, date, time, rows):
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
        "status": "new",
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    rows.append(row)
    _save(rows)
    return row


def booking_text(row: dict) -> str:
    return (
        f"ROSA · новий запис · {row.get('source')}\n"
        f"{row.get('date')} {row.get('time')} · {row.get('master')}\n"
        f"{row.get('service')}\n"
        f"{row.get('name')} · {row.get('phone')}\n"
        f"#{row.get('id')}"
    )


def notify_admin(row: dict) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
    chat = os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or ""
    if not token or not chat:
        return
    try:
        import urllib.parse
        import urllib.request

        text = urllib.parse.urlencode({"chat_id": chat, "text": booking_text(row)})
        urllib.request.urlopen(
            f"https://api.telegram.org/bot{token}/sendMessage?{text}",
            timeout=12,
        )
    except OSError:
        pass


def bot_username() -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
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


@app.get("/api/config")
def config():
    user = bot_username()
    return jsonify({"ok": True, "bot_url": f"https://t.me/{user}" if user else ""})


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
    notify_admin(row)
    return jsonify({"ok": True, "booking": row})


DATA.parent.mkdir(parents=True, exist_ok=True)
if not DATA.is_file():
    _save([])

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5051"))
    app.run(host="0.0.0.0", port=port, debug=False)
