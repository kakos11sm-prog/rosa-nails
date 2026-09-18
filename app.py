# -*- coding: utf-8 -*-
"""ROSA — нігтьова студія. Запис на сайті, заявки в журнал і в Telegram."""
from __future__ import annotations

import hmac
import json
import os
import re
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
WORK_START = "10:00"
WORK_END = "20:30"
SLOT_STEP = 30
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


DEFAULT_DESIGNS = [
    {"name": "Френч (ручки)", "price": 100},
    {"name": "Френч (ніжки)", "price": 50},
    {"name": "Наліпки, поталь (1 ніготь)", "price": 10},
    {"name": "Стемпінг, втирка (1 ніготь)", "price": 10},
    {"name": "Сухоцвіти (1 ніготь)", "price": 15},
    {"name": "Градієнт (1 ніготь)", "price": 15},
    {"name": "Малюнок від руки", "price": "від 20"},
    {"name": "Об'ємні фігурки (1 шт)", "price": 30},
    {"name": "Кошаче око", "price": 50},
    {"name": "Світловідбиваючий", "price": 50},
]


def catalog_designs() -> list[dict]:
    rows: list[dict] = []
    for item in load_content().get("designs") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        rows.append({"name": name, "price": item.get("price")})
    return rows or list(DEFAULT_DESIGNS)


def catalog_design_names() -> set[str]:
    return {str(item.get("name") or "").strip() for item in catalog_designs() if item.get("name")}


def _design_price_text(name: str) -> str:
    for item in catalog_designs():
        if str(item.get("name") or "").strip() != name:
            continue
        return _money_text(item.get("price"))
    return ""


def _money_text(value) -> str:
    if isinstance(value, (int, float)):
        return f"{int(value)} грн"
    text = str(value or "").strip()
    if not text:
        return ""
    if "грн" not in text.lower():
        return f"{text} грн"
    return text


def catalog_service_price(name: str, master: str):
    want = str(name or "").strip()
    who = str(master or "").strip()
    for section in (load_content().get("price") or {}).get("sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if not isinstance(item, dict):
                continue
            label = str(item.get("book") or item.get("name") or "").strip()
            if label != want:
                continue
            prices = item.get("prices") or {}
            if who in prices:
                return prices[who]
            if isinstance(prices, dict) and prices:
                return next(iter(prices.values()))
    return None


def service_price_text(row: dict) -> str:
    stored = str(row.get("service_price") or "").strip()
    if stored:
        return stored if "грн" in stored.lower() else f"{stored} грн"
    return _money_text(catalog_service_price(row.get("service"), row.get("master")))


def booking_service_lines(row: dict) -> list[str]:
    lines = []
    service = str(row.get("service") or "").strip()
    if service:
        price = service_price_text(row)
        lines.append(f"{service}" + (f" — {price}" if price else ""))
    design = str(row.get("design") or "").strip()
    if design:
        price = str(row.get("design_price") or "").strip() or _design_price_text(design)
        lines.append(f"{design}" + (f" — {price}" if price else ""))
    return lines


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


def work_hours() -> tuple[str, str]:
    pack = load_content()
    texts = [str((pack.get("studio") or {}).get("hours") or "")]
    for item in (pack.get("hero") or {}).get("facts") or []:
        if isinstance(item, dict):
            texts.append(str(item.get("value") or ""))
    pattern = re.compile(r"(\d{1,2})[:.](\d{2})\s*(?:[–—−-]|до)\s*(\d{1,2})[:.](\d{2})")
    for text in texts:
        match = pattern.search(text)
        if not match:
            continue
        start = f"{int(match.group(1)):02d}:{match.group(2)}"
        end = f"{int(match.group(3)):02d}:{match.group(4)}"
        try:
            if datetime.strptime(start, "%H:%M") < datetime.strptime(end, "%H:%M"):
                return start, end
        except ValueError:
            continue
    return WORK_START, WORK_END


def candidate_starts(service: str = "") -> list[str]:
    mins = max(SLOT_STEP, service_minutes(service) if service else 90)
    open_from, close_at = work_hours()
    start = datetime.strptime(open_from, "%H:%M")
    limit = datetime.strptime(close_at, "%H:%M")
    out = []
    cursor = start
    step = timedelta(minutes=SLOT_STEP)
    length = timedelta(minutes=mins)
    while cursor + length <= limit:
        out.append(cursor.strftime("%H:%M"))
        cursor += step
    return out or list(TIMES)


def occupied_ranges(
    master: str,
    date: str,
    rows: list[dict] | None = None,
    busy: list[tuple[datetime, datetime]] | None = None,
    skip_id: str = "",
) -> list[tuple[datetime, datetime]]:
    rows = rows if rows is not None else _load()
    ranges: list[tuple[datetime, datetime]] = []
    for row in rows:
        if skip_id and row.get("id") == skip_id:
            continue
        if row.get("master") != master or row.get("date") != date:
            continue
        if row.get("status") == "cancelled":
            continue
        if row.get("google_event_id"):
            continue
        ranges.append(
            slot_bounds(row["date"], row["time"], service_minutes(str(row.get("service") or "")))
        )
    ranges.extend(busy if busy is not None else gcal.busy_ranges(master, date))
    ranges.sort(key=lambda item: item[0])
    return ranges


def is_tight_slot(start: datetime, end: datetime, occupied: list[tuple[datetime, datetime]]) -> bool:
    if not occupied:
        return False
    pad = timedelta(minutes=SLOT_STEP)
    for busy_start, busy_end in occupied:
        if start >= busy_end and start - busy_end <= pad:
            return True
        if end <= busy_start and busy_start - end <= pad:
            return True
    return False


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
        for time in candidate_starts(service)
        if not slot_taken(master, date, time, service, rows, busy, skip_id)
    ]


def tight_times(master: str, date: str, service: str = "", skip_id: str = "") -> list[str]:
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return []
    rows = _load()
    busy = gcal.busy_ranges(master, date)
    occupied = occupied_ranges(master, date, rows, busy, skip_id)
    free = free_times(master, date, service, skip_id)
    best = []
    morning_first = next((time for time in free if time < "12:00"), "")
    for time in free:
        start, end = slot_bounds(date, time, service_minutes(service))
        near_booking = occupied and is_tight_slot(start, end, occupied)
        if near_booking or (morning_first and time == morning_first):
            best.append(time)
    return best


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
            if any(not slot_taken(master, date, time, service, rows, busy, skip_id) for time in candidate_starts(service)):
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
    extras = catalog_design_names()

    if source == "telegram" and str(payload.get("telegram_id") or "").strip():
        if not name:
            name = str(payload.get("tg_name") or "Telegram").strip() or "Telegram"
        if not phone:
            phone = "tg:" + str(payload.get("telegram_id")).strip()
    if not name or not phone:
        raise ValueError("вкажіть ім’я і телефон")
    if service not in catalog_services():
        raise ValueError("оберіть послугу зі списку")
    if design and extras and design not in extras:
        raise ValueError("оберіть дизайн зі списку")
    if master not in catalog_masters():
        raise ValueError("оберіть майстра")
    if time not in candidate_starts(service):
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
        "design_price": _design_price_text(design) if design else "",
        "service_price": _money_text(catalog_service_price(service, master)),
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


def html_esc(value) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def pretty_slot(date: str, time: str) -> str:
    try:
        return f"{pretty_date(str(date or ''))} · {time}"
    except ValueError:
        return f"{date} {time}".strip()


def _offer_picked(state: dict) -> list[dict]:
    raw = list(state.get("picked") or [])
    date = str(state.get("date") or "")
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for item in raw:
        if isinstance(item, dict):
            day = str(item.get("date") or date)
            time = str(item.get("time") or "")
        else:
            text = str(item or "")
            if " " in text and text[4:5] == "-":
                day, time = text.split(" ", 1)
            else:
                day, time = date, text
        key = (day, time)
        if not day or not time or key in seen:
            continue
        seen.add(key)
        out.append({"date": day, "time": time})
    return out


def _picked_lines(picked: list[dict]) -> str:
    if not picked:
        return "<i>ще нічого не обрано</i>"
    by_date: dict[str, list[str]] = {}
    for item in picked:
        by_date.setdefault(item["date"], []).append(item["time"])
    lines = []
    for day in sorted(by_date):
        times = ", ".join(sorted(by_date[day]))
        try:
            label = pretty_date(day)
        except ValueError:
            label = day
        lines.append(f"• {html_esc(label)} — <b>{html_esc(times)}</b>")
    return "\n".join(lines)


def pending_keyboard(booking_id: str) -> list[list[dict]]:
    return [
        [{"text": "✅ Підтвердити", "callback_data": f"ok:{booking_id}"}],
        [{"text": "🕒 Інший час", "callback_data": f"mv:{booking_id}"}],
        [{"text": "✕ Відмовити", "callback_data": f"no:{booking_id}"}],
    ]


def admin_card_text(row: dict, note: str = "") -> str:
    status = str(row.get("status") or "pending")
    if status in {"pending", "new"}:
        head, badge = "Нова заявка", "очікує рішення"
    elif status == "confirmed":
        head = "Запис підтверджено"
        badge = "в календарі" if row.get("google_event_id") else "підтверджено"
    elif status == "cancelled":
        head, badge = "Заявку відхилено", "слот вільний"
    elif status == "offered":
        head, badge = "Запропоновано інший час", "чекаємо клієнта"
    else:
        head, badge = "Заявка", status

    lines = [
        f"<b>{html_esc(head)}</b>",
        f"<i>{html_esc(badge)}</i>",
        f"<code>#{html_esc(row.get('id'))}</code>",
        "",
        f"👤 <b>{html_esc(row.get('name'))}</b>",
        f"📞 {html_esc(row.get('phone'))}",
        "",
        f"🗓 {html_esc(pretty_slot(str(row.get('date') or ''), str(row.get('time') or '')))}",
        f"💅 {html_esc(row.get('master'))}",
    ]
    service_pay = service_price_text(row)
    lines.append(
        f"✂️ {html_esc(row.get('service'))}" + (f" · {html_esc(service_pay)}" if service_pay else "")
    )
    design = str(row.get("design") or "").strip()
    if design:
        price = str(row.get("design_price") or "").strip() or _design_price_text(design)
        lines.append(f"✨ {html_esc(design)}" + (f" · {html_esc(price)}" if price else ""))
    source = str(row.get("source") or "").strip()
    if source:
        where = "сайт" if source in {"site", "web"} else source
        lines.append(f"\n<i>звідки: {html_esc(where)}</i>")
    if status == "offered":
        offers = row.get("offers") or []
        lines.append("\n<b>Варіанти клієнту</b>")
        lines.append(_picked_lines([
            {"date": str(item.get("date") or ""), "time": str(item.get("time") or "")}
            for item in offers if isinstance(item, dict)
        ]))
    if note:
        lines.append("")
        lines.append(html_esc(note))
    return "\n".join(lines)


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

        payload = {
            "chat_id": chat,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
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


def client_bot_url(booking_id: str = "") -> str:
    user = bot_username() or "rosa_nails_zp_bot"
    if not user:
        return ""
    if booking_id:
        return f"https://t.me/{user}?start=rosa_{booking_id}"
    return f"https://t.me/{user}"


def client_remind_text(row: dict) -> str:
    slot = pretty_slot(str(row.get("date") or ""), str(row.get("time") or ""))
    addr = str((load_content().get("studio") or {}).get("address") or "вул. Дмитра Донцова, 6")
    return (
        f"<b>ROSA · нагадування</b>\n"
        f"<i>завтра ваш запис</i>\n\n"
        f"🗓 {html_esc(slot)}\n"
        f"💅 {html_esc(row.get('master'))}\n"
        f"✂️ {html_esc(row.get('service'))}\n\n"
        f"Чекаємо вас у студії, {html_esc(addr)}."
    )


_remind_checked = None


def send_due_reminders() -> int:
    today = datetime.now(TZ).date()
    tomorrow = today + timedelta(days=1)
    rows = _load()
    sent = 0
    changed = False
    for row in rows:
        if row.get("status") != "confirmed":
            continue
        if not str(row.get("telegram_id") or "").strip():
            continue
        if row.get("reminded_at"):
            continue
        try:
            day = datetime.strptime(str(row.get("date") or ""), "%Y-%m-%d").date()
        except ValueError:
            continue
        if day != tomorrow:
            continue
        if notify_client(row, client_remind_text(row)):
            row["reminded_at"] = datetime.now(TZ).isoformat(timespec="seconds")
            sent += 1
            changed = True
    if changed:
        _save(rows)
    return sent


def maybe_send_reminders() -> int:
    global _remind_checked
    now = datetime.now(TZ)
    if _remind_checked and now - _remind_checked < timedelta(minutes=10):
        return 0
    _remind_checked = now
    return send_due_reminders()


def client_decision_text(row: dict, accepted: bool) -> str:
    slot = pretty_slot(str(row.get("date") or ""), str(row.get("time") or ""))
    services = booking_service_lines(row)
    if accepted:
        body = "\n".join(f"• {html_esc(line)}" for line in services) or html_esc(row.get("service") or "")
        return (
            f"<b>ROSA · вас записано</b>\n"
            f"<i>чекаємо у студії</i>\n\n"
            f"🗓 {html_esc(slot)}\n"
            f"💅 {html_esc(row.get('master'))}\n\n"
            f"Послуги:\n{body}\n\n"
            f"Напередодні нагадаємо в цей чат."
        )
    return (
        f"<b>ROSA · цей час не підтвердили</b>\n"
        f"{html_esc(slot)}\n\n"
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


def date_keyboard(booking_id: str, dates: list[str], picked: list[dict]) -> list[list[dict]]:
    picked_days = {item["date"] for item in picked}
    rows: list[list[dict]] = []
    line: list[dict] = []
    for date in dates:
        day = datetime.strptime(date, "%Y-%m-%d")
        mark = "✓ " if date in picked_days else ""
        label = f"{mark}{UA_WEEKDAYS_SHORT[day.weekday()]} {day.strftime('%d.%m')}"
        line.append({"text": label, "callback_data": f"dt:{booking_id}:{date.replace('-', '')}"})
        if len(line) == 3:
            rows.append(line)
            line = []
    if line:
        rows.append(line)
    if picked:
        rows.append([{"text": "Надіслати клієнту", "callback_data": f"go:{booking_id}"}])
    rows.append([{"text": "← До заявки", "callback_data": f"bk:{booking_id}"}])
    rows.append([{"text": "✕ Відмовити", "callback_data": f"no:{booking_id}"}])
    return rows


def time_keyboard(booking_id: str, date: str, master: str, service: str, picked: list[dict]) -> list[list[dict]]:
    chosen = {item["time"] for item in picked if item["date"] == date}
    best = set(tight_times(master, date, service, skip_id=booking_id))
    line: list[dict] = []
    rows: list[list[dict]] = []
    for time in candidate_starts(service):
        taken = slot_taken(master, date, time, service, skip_id=booking_id)
        compact = time.replace(":", "")
        if taken:
            btn = {"text": f"{time} · зайнято", "callback_data": f"xx:{booking_id}"}
        else:
            mark = "✓ " if time in chosen else ("● " if time in best else "")
            btn = {"text": f"{mark}{time}", "callback_data": f"tm:{booking_id}:{compact}"}
        line.append(btn)
        if len(line) == 3:
            rows.append(line)
            line = []
    if line:
        rows.append(line)
    if picked:
        rows.append([{"text": "Надіслати клієнту", "callback_data": f"go:{booking_id}"}])
    rows.append([{"text": "← Ще дата", "callback_data": f"ds:{booking_id}"}])
    rows.append([{"text": "✕ Відмовити", "callback_data": f"no:{booking_id}"}])
    return rows


def reschedule_text(row: dict, hint: str) -> str:
    picked = _offer_picked(dict(row.get("reschedule") or {}))
    return (
        f"<b>Інший час</b>\n"
        f"<i>можна кілька дат і годин</i>\n"
        f"<code>#{html_esc(row.get('id'))}</code>\n\n"
        f"Клієнт: <b>{html_esc(row.get('name'))}</b>\n"
        f"Було: {html_esc(pretty_slot(str(row.get('date') or ''), str(row.get('time') or '')))}\n"
        f"💅 {html_esc(row.get('master'))}\n"
        f"✂️ {html_esc(row.get('service'))}\n\n"
        f"<b>Обрано</b>\n{_picked_lines(picked)}\n\n"
        f"{hint}"
    )


def times_text(row: dict, date: str) -> str:
    try:
        label = pretty_date(date)
    except ValueError:
        label = date
    return reschedule_text(
        row,
        f"Дата: <b>{html_esc(label)}</b>\nНатисніть години — можна кілька, потім ще дату.",
    )


def start_reschedule(booking_id: str, reset: bool = False) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    if row.get("status") in {"cancelled", "confirmed"}:
        raise ValueError("цю заявку вже закрито")
    days = open_dates(str(row.get("master") or ""), str(row.get("service") or ""), skip_id=booking_id)[:15]
    if not days:
        return "Немає вільних днів у розкладі.", [], ""
    state = dict(row.get("reschedule") or {})
    picked = [] if reset else _offer_picked(state)
    row = _patch_booking(booking_id, reschedule={"date": "", "picked": picked})
    return (
        reschedule_text(row, "Оберіть дату, потім години. Можна кілька днів підряд."),
        date_keyboard(booking_id, days, picked),
        "",
    )


def show_offer_times(booking_id: str, date: str) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    picked = _offer_picked(dict(row.get("reschedule") or {}))
    row = _patch_booking(booking_id, reschedule={"date": date, "picked": picked})
    master = str(row.get("master") or "")
    service = str(row.get("service") or "")
    return times_text(row, date), time_keyboard(booking_id, date, master, service, picked), ""


def toggle_offer_time(booking_id: str, time: str) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    state = dict(row.get("reschedule") or {})
    date = str(state.get("date") or "")
    picked = _offer_picked(state)
    if not date:
        raise ValueError("спочатку оберіть дату")
    master = str(row.get("master") or "")
    service = str(row.get("service") or "")
    if any(item["date"] == date and item["time"] == time for item in picked):
        picked = [item for item in picked if not (item["date"] == date and item["time"] == time)]
    else:
        if slot_taken(master, date, time, service, skip_id=booking_id):
            return None, None, "Цей час уже зайнятий"
        picked.append({"date": date, "time": time})
        picked.sort(key=lambda item: (item["date"], item["time"]))
    row = _patch_booking(booking_id, reschedule={"date": date, "picked": picked})
    return times_text(row, date), time_keyboard(booking_id, date, master, service, picked), ""


def send_offers(booking_id: str) -> tuple[str | None, list | None, str]:
    row = _find_booking(booking_id)
    if not row:
        raise ValueError("заявку не знайдено")
    picked = _offer_picked(dict(row.get("reschedule") or {}))
    if not picked:
        return None, None, "Оберіть хоча б один вільний час"
    row = _patch_booking(booking_id, status="offered", offers=picked, reschedule={"date": "", "picked": picked})
    notify_client(row, client_offer_text(row))
    note = "Надіслала клієнту варіанти нижче. Чекаємо, поки обере на сайті."
    return admin_card_text(row, note), [], ""


def client_offer_text(row: dict) -> str:
    offers = [item for item in (row.get("offers") or []) if isinstance(item, dict)]
    lines = []
    for item in offers:
        slot = pretty_slot(str(item.get("date") or ""), str(item.get("time") or ""))
        lines.append(f"• {html_esc(slot)}")
    body = "\n".join(lines) or "—"
    link = html_esc(status_url(str(row.get("id") or "")))
    return (
        f"<b>ROSA · інший час</b>\n"
        f"<i>цей слот не підійшов</i>\n\n"
        f"Було: {html_esc(pretty_slot(str(row.get('date') or ''), str(row.get('time') or '')))}\n"
        f"💅 {html_esc(row.get('master'))}\n\n"
        f"Пропонуємо:\n{body}\n\n"
        f'<a href="{link}">Обрати зручний час на сайті</a>'
    )


def day_slot_view(row: dict) -> list[dict]:
    offers = row.get("offers") or []
    master = str(row.get("master") or "")
    service = str(row.get("service") or "")
    skip = str(row.get("id") or "")
    out = []
    for item in offers:
        if not isinstance(item, dict):
            continue
        date = str(item.get("date") or "")
        time = str(item.get("time") or "")
        if not date or not time:
            continue
        taken = slot_taken(master, date, time, service, skip_id=skip)
        out.append({"date": date, "time": time, "kind": "busy" if taken else "offer"})
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
    mid = row.get("admin_tg_mid")
    if chat and mid:
        _telegram_call(
            "editMessageText",
            {
                "chat_id": chat,
                "message_id": mid,
                "text": admin_card_text(row, "Клієнт скасував заявку сам."),
                "parse_mode": "HTML",
                "reply_markup": {"inline_keyboard": []},
            },
        )
    elif chat:
        _telegram_call(
            "sendMessage",
            {
                "chat_id": chat,
                "text": admin_card_text(row, "Клієнт скасував заявку сам."),
                "parse_mode": "HTML",
            },
        )
    return row


def notify_admin_rescheduled(row: dict) -> bool:
    note = "Клієнт обрав новий час. Підтвердіть, якщо все ок."
    keyboard = pending_keyboard(str(row.get("id") or ""))
    chat = _admin_chat()
    mid = row.get("admin_tg_mid")
    payload = {
        "text": admin_card_text(row, note),
        "parse_mode": "HTML",
        "reply_markup": {"inline_keyboard": keyboard},
        "disable_web_page_preview": True,
    }
    if chat and mid:
        payload["chat_id"] = chat
        payload["message_id"] = mid
        if _telegram_call("editMessageText", payload):
            return True
    return bool(notify_admin(row, note=note, keyboard=keyboard))


def _telegram_call(method: str, payload: dict):
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        return None
    try:
        import urllib.error
        import urllib.request

        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/{method}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data if data.get("ok") else None
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        if "message is not modified" in body:
            return {"ok": True}
        return None
    except OSError:
        return None


def apply_admin_decision(action: str, booking_id: str, chat_id: str = "") -> str:
    if _admin_chat() and chat_id and chat_id != _admin_chat():
        return "Підтверджувати може лише адміністратор студії."
    if action == "ok":
        row = confirm_booking(booking_id)
        extra = " Календар оновлено." if row.get("google_event_id") else ""
        sent = notify_client(row, client_decision_text(row, True))
        client = "Клієнту написала в Telegram." if sent else "Клієнту в Telegram не дійшло — зателефонуйте."
        return (extra + " " + client).strip()
    if action == "no":
        row = reject_booking(booking_id)
        sent = notify_client(row, client_decision_text(row, False))
        phone = str(row.get("phone") or "")
        if sent:
            return "Клієнту написала, що запис не підтверджено."
        return f"Клієнту в Telegram не дійшло — зателефонуйте: {phone}"
    raise ValueError("незрозуміла дія")


def apply_admin_callback(action: str, booking_id: str, extra: str, chat_id: str) -> tuple[str | None, list | None, str]:
    if _admin_chat() and chat_id and chat_id != _admin_chat():
        return "Підтверджувати може лише адміністратор студії.", [], ""
    if action in {"ok", "no"}:
        note = apply_admin_decision(action, booking_id, chat_id)
        row = _find_booking(booking_id)
        if not row or note.startswith("Підтверджувати"):
            return html_esc(note), [], ""
        return admin_card_text(row, note), [], ""
    if action == "xx":
        return None, None, "Цей час уже зайнятий"
    if action == "mv":
        return start_reschedule(booking_id, reset=True)
    if action == "ds":
        return start_reschedule(booking_id, reset=False)
    if action == "bk":
        row = _find_booking(booking_id)
        if not row:
            raise ValueError("заявку не знайдено")
        return admin_card_text(row), pending_keyboard(str(row.get("id") or "")), ""
    if action == "dt":
        return show_offer_times(booking_id, expand_date(extra))
    if action == "tm":
        return toggle_offer_time(booking_id, expand_time(extra))
    if action == "go":
        return send_offers(booking_id)
    raise ValueError("незрозуміла дія")


DRAFTS_FILE = DATA.parent / "tg_drafts.json"


def _drafts() -> dict:
    if not DRAFTS_FILE.is_file():
        return {}
    try:
        raw = json.loads(DRAFTS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _save_drafts(data: dict) -> None:
    DRAFTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    DRAFTS_FILE.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")


def client_master_names() -> list[str]:
    names = []
    for master in load_content().get("masters") or []:
        if isinstance(master, dict) and master.get("id"):
            names.append(str(master.get("id")))
    return names or sorted(catalog_masters())


def client_service_names() -> list[str]:
    return list(catalog_services().keys())


def client_picked_lines(draft: dict) -> str:
    lines = []
    if draft.get("master"):
        lines.append(f"💅 {html_esc(draft.get('master'))}")
    if draft.get("service"):
        lines.append(f"✂️ {html_esc(draft.get('service'))}")
    if draft.get("design"):
        lines.append(f"✨ {html_esc(draft.get('design'))}")
    if draft.get("date") or draft.get("time"):
        lines.append(f"🗓 {html_esc(pretty_slot(str(draft.get('date') or ''), str(draft.get('time') or '')))}")
    return ("\n".join(lines) + "\n\n") if lines else ""


def client_card(title: str, hint: str, draft: dict | None = None) -> str:
    body = client_picked_lines(draft or {})
    return (
        f"<b>ROSA · запис</b>\n"
        f"<i>{html_esc(title)}</i>\n\n"
        f"{body}{hint}"
    )


def _chunk(items: list[dict], n: int) -> list[list[dict]]:
    rows: list[list[dict]] = []
    line: list[dict] = []
    for item in items:
        line.append(item)
        if len(line) == n:
            rows.append(line)
            line = []
    if line:
        rows.append(line)
    return rows


def client_master_kb() -> list[list[dict]]:
    btns = [{"text": name, "callback_data": f"c:m:{i}"} for i, name in enumerate(client_master_names())]
    return _chunk(btns, 2) + [[{"text": "✕ Скасувати", "callback_data": "c:q"}]]


def client_service_kb() -> list[list[dict]]:
    btns = [{"text": name[:40], "callback_data": f"c:s:{i}"} for i, name in enumerate(client_service_names())]
    return _chunk(btns, 1) + [[{"text": "← Майстер", "callback_data": "c:b:m"}, {"text": "✕", "callback_data": "c:q"}]]


def client_design_kb() -> list[list[dict]]:
    btns = []
    for i, item in enumerate(catalog_designs()):
        name = str(item.get("name") or "")
        price = _money_text(item.get("price"))
        label = f"{name[:28]}" + (f" · {price}" if price else "")
        btns.append({"text": label[:40], "callback_data": f"c:d:{i}"})
    rows = _chunk(btns, 1)
    rows.append([{"text": "Без дизайну", "callback_data": "c:d:x"}])
    rows.append([{"text": "← Послуга", "callback_data": "c:b:s"}, {"text": "✕", "callback_data": "c:q"}])
    return rows


def client_date_kb(master: str, service: str, page: int = 0) -> list[list[dict]]:
    days = open_dates(master, service, horizon=21)
    size = 9
    page = max(0, page)
    chunk = days[page * size : (page + 1) * size]
    btns = []
    for date in chunk:
        day = datetime.strptime(date, "%Y-%m-%d")
        label = f"{UA_WEEKDAYS_SHORT[day.weekday()]} {day.strftime('%d.%m')}"
        btns.append({"text": label, "callback_data": f"c:y:{date.replace('-', '')}"})
    rows = _chunk(btns, 3)
    nav = []
    if page > 0:
        nav.append({"text": "‹", "callback_data": f"c:w:{page - 1}"})
    if (page + 1) * size < len(days):
        nav.append({"text": "›", "callback_data": f"c:w:{page + 1}"})
    if nav:
        rows.append(nav)
    rows.append([{"text": "← Дизайн", "callback_data": "c:b:d"}, {"text": "✕", "callback_data": "c:q"}])
    return rows


def client_time_kb(master: str, date: str, service: str) -> list[list[dict]]:
    free = free_times(master, date, service)
    best = set(tight_times(master, date, service))
    btns = []
    for time in free:
        mark = "● " if time in best else ""
        btns.append({"text": f"{mark}{time}", "callback_data": f"c:t:{time.replace(':', '')}"})
    rows = _chunk(btns, 3)
    if not btns:
        rows = [[{"text": "Немає вільного часу", "callback_data": "c:b:y"}]]
    rows.append([{"text": "← Дата", "callback_data": "c:b:y"}, {"text": "✕", "callback_data": "c:q"}])
    return rows


def client_start_pack(chat_id: str, first_name: str = "") -> tuple[str, list[list[dict]]]:
    drafts = _drafts()
    drafts[chat_id] = {"step": "master", "name": (first_name or "").strip() or "Telegram"}
    _save_drafts(drafts)
    return client_card("оберіть майстра", "Без імені і телефону — ви вже в Telegram.", drafts[chat_id]), client_master_kb()


def handle_client_callback(data: str, chat_id: str) -> tuple[str, list[list[dict]], str]:
    parts = data.split(":")
    action = parts[1] if len(parts) > 1 else ""
    extra = parts[2] if len(parts) > 2 else ""
    drafts = _drafts()
    draft = dict(drafts.get(chat_id) or {})
    if action == "q":
        drafts.pop(chat_id, None)
        _save_drafts(drafts)
        return client_card("скасовано", "Напишіть /start, щоб записатись знову."), [], "Скасовано"

    masters = client_master_names()
    services = client_service_names()
    designs = catalog_designs()

    if action == "b":
        if extra == "m":
            draft["step"] = "master"
        elif extra == "s":
            draft["step"] = "service"
        elif extra == "d":
            draft["step"] = "design"
        elif extra == "y":
            draft["step"] = "date"
        drafts[chat_id] = draft
        _save_drafts(drafts)

    if action == "m":
        try:
            draft["master"] = masters[int(extra)]
        except (ValueError, IndexError) as exc:
            raise ValueError("оберіть майстра") from exc
        draft["step"] = "service"
        drafts[chat_id] = draft
        _save_drafts(drafts)
        return client_card("оберіть послугу", "Час порахується за тривалістю послуги.", draft), client_service_kb(), ""

    if action == "s":
        try:
            draft["service"] = services[int(extra)]
        except (ValueError, IndexError) as exc:
            raise ValueError("оберіть послугу") from exc
        draft["step"] = "design"
        drafts[chat_id] = draft
        _save_drafts(drafts)
        return client_card("додатковий дизайн", "Можна пропустити.", draft), client_design_kb(), ""

    if action == "d":
        if extra == "x":
            draft["design"] = ""
        else:
            try:
                draft["design"] = str(designs[int(extra)].get("name") or "")
            except (ValueError, IndexError) as exc:
                raise ValueError("оберіть дизайн") from exc
        draft["step"] = "date"
        draft["page"] = 0
        drafts[chat_id] = draft
        _save_drafts(drafts)
        master, service = str(draft.get("master") or ""), str(draft.get("service") or "")
        return client_card("оберіть дату", "Понеділок — вихідний.", draft), client_date_kb(master, service, 0), ""

    if action == "w":
        try:
            page = int(extra)
        except ValueError:
            page = 0
        draft["page"] = page
        draft["step"] = "date"
        drafts[chat_id] = draft
        _save_drafts(drafts)
        return (
            client_card("оберіть дату", "Понеділок — вихідний.", draft),
            client_date_kb(str(draft.get("master") or ""), str(draft.get("service") or ""), page),
            "",
        )

    if action == "y":
        date = expand_date(extra)
        draft["date"] = date
        draft["step"] = "time"
        drafts[chat_id] = draft
        _save_drafts(drafts)
        kb = client_time_kb(str(draft.get("master") or ""), date, str(draft.get("service") or ""))
        return client_card("оберіть час", "● — зручніше поруч з іншими записами.", draft), kb, ""

    if action == "t":
        time = expand_time(extra)
        draft["time"] = time
        drafts[chat_id] = draft
        _save_drafts(drafts)
        try:
            row = add_booking(
                {
                    "name": str(draft.get("name") or "Telegram"),
                    "service": draft.get("service"),
                    "design": draft.get("design") or "",
                    "master": draft.get("master"),
                    "date": draft.get("date"),
                    "time": time,
                    "source": "telegram",
                    "telegram_id": chat_id,
                }
            )
        except ValueError as exc:
            return client_card("цей час уже зайнятий", html_esc(str(exc)), draft), client_time_kb(
                str(draft.get("master") or ""), str(draft.get("date") or ""), str(draft.get("service") or "")
            ), str(exc)
        drafts.pop(chat_id, None)
        _save_drafts(drafts)
        if not notify_admin(row):
            try:
                row = confirm_booking(row["id"])
            except ValueError:
                pass
            return client_done_text(row, True), [], "Записано"
        return client_done_text(row, False), [], "Заявку надіслано"

    step = str(draft.get("step") or "master")
    if step == "service":
        return client_card("оберіть послугу", "Час порахується за тривалістю послуги.", draft), client_service_kb(), ""
    if step == "design":
        return client_card("додатковий дизайн", "Можна пропустити.", draft), client_design_kb(), ""
    if step == "date":
        page = int(draft.get("page") or 0)
        return (
            client_card("оберіть дату", "Понеділок — вихідний.", draft),
            client_date_kb(str(draft.get("master") or ""), str(draft.get("service") or ""), page),
            "",
        )
    if step == "time":
        return (
            client_card("оберіть час", "● — зручніше поруч з іншими записами.", draft),
            client_time_kb(str(draft.get("master") or ""), str(draft.get("date") or ""), str(draft.get("service") or "")),
            "",
        )
    return client_card("оберіть майстра", "Без імені і телефону — ви вже в Telegram.", draft), client_master_kb(), ""


def client_done_text(row: dict, instant: bool) -> str:
    services = "\n".join(f"• {html_esc(line)}" for line in booking_service_lines(row))
    if instant:
        head, note = "Вас записано", "студія вже підтвердила"
    else:
        head, note = "Заявку надіслано", "чекаємо підтвердження студії"
    return (
        f"<b>ROSA · {html_esc(head)}</b>\n"
        f"<i>{html_esc(note)}</i>\n"
        f"<code>#{html_esc(row.get('id'))}</code>\n\n"
        f"🗓 {html_esc(pretty_slot(str(row.get('date') or ''), str(row.get('time') or '')))}\n"
        f"💅 {html_esc(row.get('master'))}\n"
        f"{services}\n\n"
        f"Напишемо сюди, щойно студія відповість. Напередодні нагадаємо."
    )


def _send_html(chat_id: str, text: str, keyboard: list | None = None) -> None:
    body = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if keyboard:
        body["reply_markup"] = {"inline_keyboard": keyboard}
    _telegram_call("sendMessage", body)


def handle_telegram_update(update: dict) -> None:
    maybe_send_reminders()
    query = update.get("callback_query") or {}
    if query:
        data = str(query.get("data") or "")
        qid = query.get("id")
        message = query.get("message") or {}
        chat_id = str((message.get("chat") or {}).get("id") or query.get("from", {}).get("id") or "")
        mid = message.get("message_id")
        parts = data.split(":")
        action = parts[0] if parts else ""
        booking_id = parts[1] if len(parts) > 1 else ""
        extra = parts[2] if len(parts) > 2 else ""
        text: str | None = None
        keyboard: list | None = None
        toast = ""
        try:
            if data.startswith("c:"):
                text, keyboard, toast = handle_client_callback(data, chat_id)
            else:
                text, keyboard, toast = apply_admin_callback(action, booking_id, extra, chat_id)
        except ValueError as exc:
            text = f"Не вийшло: {html_esc(exc)}"
            keyboard = []
            toast = str(exc)
        if qid:
            payload = {"callback_query_id": qid}
            if toast:
                payload["text"] = toast[:180]
            _telegram_call("answerCallbackQuery", payload)
        if chat_id and mid and text is not None:
            body = {
                "chat_id": chat_id,
                "message_id": mid,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            }
            if keyboard is not None:
                body["reply_markup"] = {"inline_keyboard": keyboard}
            _telegram_call("editMessageText", body)
        return
    message = update.get("message") or {}
    text = str(message.get("text") or "").strip()
    chat_id = str((message.get("chat") or {}).get("id") or "")
    first = str((message.get("from") or {}).get("first_name") or "")
    if not text.startswith("/start") or not chat_id:
        return
    parts = text.split(maxsplit=1)
    payload = parts[1].strip() if len(parts) > 1 else ""
    if payload.startswith("@"):
        payload = ""
    if not payload.startswith("rosa_"):
        card, keyboard = client_start_pack(chat_id, first)
        _send_html(chat_id, card, keyboard)
        return
    try:
        row = link_telegram(payload[5:], chat_id)
    except ValueError as exc:
        _send_html(chat_id, f"Не знайшла заявку: {html_esc(exc)}")
        return
    status = row.get("status")
    if status == "confirmed":
        _send_html(chat_id, client_decision_text(row, True))
        return
    if status == "cancelled":
        _send_html(chat_id, client_decision_text(row, False))
        return
    if status == "offered":
        _send_html(chat_id, client_offer_text(row))
        return
    _send_html(
        chat_id,
        (
            f"<b>ROSA · заявку прив’язала</b>\n"
            f"<i>чекаємо відповіді студії</i>\n"
            f"<code>#{html_esc(row.get('id'))}</code>\n\n"
            f"🗓 {html_esc(pretty_slot(str(row.get('date') or ''), str(row.get('time') or '')))}\n"
            f"💅 {html_esc(row.get('master'))}\n\n"
            f"Сюди напишемо, щойно студія підтвердить. Напередодні нагадаємо."
        ),
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
    return admin_card_text(row)


def notify_admin(row: dict, note: str = "", keyboard: list | None = None) -> bool:
    chat = _admin_chat()
    if not chat:
        return False
    if keyboard is None:
        keyboard = pending_keyboard(str(row.get("id") or ""))
    payload = {
        "chat_id": chat,
        "text": admin_card_text(row, note),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": {"inline_keyboard": keyboard},
    }
    data = _telegram_call("sendMessage", payload)
    result = (data or {}).get("result") or {}
    mid = result.get("message_id")
    if mid:
        try:
            _patch_booking(str(row.get("id") or ""), admin_tg_mid=mid)
            row["admin_tg_mid"] = mid
        except ValueError:
            pass
    return bool(data)


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
    maybe_send_reminders()
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
        "service_price": service_price_text(row),
        "design": row.get("design") or "",
        "design_price": str(row.get("design_price") or "").strip() or _design_price_text(row.get("design") or ""),
        "offers": row.get("offers") or [],
        "slots": day_slot_view(row) if row.get("status") == "offered" else [],
        "telegram": bool(str(row.get("telegram_id") or "").strip()),
        "bot_start": client_bot_url(str(row.get("id") or "")),
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
    user = bot_username() or "rosa_nails_zp_bot"
    return jsonify({
        "ok": True,
        "bot_url": f"https://t.me/{user}",
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
    best = tight_times(master, date, service) if times else []
    resp = jsonify({
        "ok": True,
        "times": times,
        "best": best,
        "mins": service_minutes(service) if service else 90,
        "calendar": gcal.configured(),
    })
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


@app.get("/api/cron/remind")
def cron_remind():
    want = (os.environ.get("CRON_SECRET") or "").strip()
    got = str(request.args.get("secret") or request.headers.get("X-Cron-Secret") or "").strip()
    if want and got != want:
        return jsonify({"ok": False}), 403
    sent = send_due_reminders()
    return jsonify({"ok": True, "sent": sent})


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
    return jsonify({
        "ok": True,
        "booking": row,
        "pending": row.get("status") == "pending",
        "bot_url": client_bot_url(str(row.get("id") or "")),
    })


DATA.parent.mkdir(parents=True, exist_ok=True)
if not DATA.is_file():
    _save([])
gcal.ensure_calendar_timezone()
ensure_telegram_webhook()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5051"))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
