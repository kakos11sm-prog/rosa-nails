# -*- coding: utf-8 -*-
"""Двосторонній Google Календар: зайняті слоти + нові події з запису."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Kyiv")
# Google Calendar досі приймає стару назву зони
GCAL_TZ = "Europe/Kiev"
SCOPES = ["https://www.googleapis.com/auth/calendar"]
ROOT = Path(__file__).resolve().parent

CAL_KEYS = {
    "Аля": ("GOOGLE_CALENDAR_ALYA", "GOOGLE_CALENDAR_ID"),
    "Єлизавета": ("GOOGLE_CALENDAR_ELIZAVETA", "GOOGLE_CALENDAR_LISA", "GOOGLE_CALENDAR_ID"),
}
# Кольори подій Google: 4 рожевий, 9 синій
EVENT_COLOR = {"Аля": "4", "Єлизавета": "9"}

_SERVICE = None


def configured() -> bool:
    return bool(_creds_info() and (calendar_id("Аля") or calendar_id("Єлизавета")))


def calendar_id(master: str) -> str:
    for key in CAL_KEYS.get(master, ("GOOGLE_CALENDAR_ID",)):
        value = (os.environ.get(key) or "").strip()
        if value:
            return value
    return (os.environ.get("GOOGLE_CALENDAR_ID") or "").strip()


def _creds_info() -> dict | None:
    raw = (os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()
    if raw:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None
    path = (os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE") or "").strip()
    if not path:
        fallback = ROOT / "secrets" / "google-service.json"
        path = str(fallback) if fallback.is_file() else ""
    if not path:
        return None
    file = Path(path)
    if not file.is_file():
        file = ROOT / path
    if not file.is_file():
        return None
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _service():
    global _SERVICE
    if _SERVICE is not None:
        return _SERVICE
    info = _creds_info()
    if not info:
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        return None
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    _SERVICE = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return _SERVICE


def parse_dt(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def _event_master(event: dict) -> str:
    tagged = ((event.get("extendedProperties") or {}).get("private") or {}).get("master") or ""
    tagged = str(tagged).strip()
    if tagged:
        return tagged
    text = f"{event.get('summary') or ''} {event.get('description') or ''}"
    found = [name for name in CAL_KEYS if name in text]
    if len(found) == 1:
        return found[0]
    return ""


def _event_belongs(event: dict, master: str, shared_calendar: bool) -> bool:
    if event.get("status") == "cancelled":
        return False
    if event.get("transparency") == "transparent":
        return False
    if not shared_calendar:
        return True
    tagged = _event_master(event)
    return tagged == master if tagged else True


def _event_span(event: dict, day: datetime) -> tuple[datetime, datetime] | None:
    start_raw = event.get("start") or {}
    end_raw = event.get("end") or {}
    try:
        if start_raw.get("dateTime"):
            start = parse_dt(start_raw["dateTime"])
            end = parse_dt(end_raw.get("dateTime") or start_raw["dateTime"])
            return start, end
        if start_raw.get("date"):
            ev_start = datetime.strptime(start_raw["date"], "%Y-%m-%d").replace(tzinfo=TZ)
            ev_end = datetime.strptime((end_raw.get("date") or start_raw["date"]), "%Y-%m-%d").replace(tzinfo=TZ)
            return ev_start, ev_end
    except (TypeError, ValueError):
        return None
    return None


def list_events_between(start: datetime, end: datetime) -> tuple[bool, list[dict]]:
    cal = calendar_id("Аля") or calendar_id("Єлизавета")
    service = _service()
    if not cal or not service:
        return False, []
    items: list[dict] = []
    page = None
    try:
        while True:
            data = (
                service.events()
                .list(
                    calendarId=cal,
                    timeMin=start.isoformat(),
                    timeMax=end.isoformat(),
                    singleEvents=True,
                    orderBy="startTime",
                    showDeleted=False,
                    fields="nextPageToken,items(id,status,transparency,summary,description,start,end,extendedProperties)",
                    pageToken=page,
                )
                .execute()
            )
            items.extend(data.get("items") or [])
            page = data.get("nextPageToken")
            if not page:
                break
    except Exception:
        return False, []
    return True, items


def list_day_events(date: str) -> tuple[bool, list[dict]]:
    day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=TZ)
    return list_events_between(day, day + timedelta(days=1))


def list_range_events(start_date: str, end_date: str) -> tuple[bool, list[dict]]:
    start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=TZ)
    end = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=TZ) + timedelta(days=1)
    return list_events_between(start, end)


def busy_from_events(master: str, date: str, events: list[dict]) -> list[tuple[datetime, datetime]]:
    day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=TZ)
    shared = calendar_id("Аля") == calendar_id("Єлизавета")
    out: list[tuple[datetime, datetime]] = []
    for event in events:
        if not _event_belongs(event, master, shared):
            continue
        span = _event_span(event, day)
        if span:
            out.append(span)
    return out


def busy_ranges(master: str, date: str) -> list[tuple[datetime, datetime]]:
    ok, events = list_day_events(date)
    if not ok:
        return []
    return busy_from_events(master, date, events)


def overlaps_busy(master: str, start: datetime, end: datetime) -> bool:
    date = start.astimezone(TZ).date().isoformat()
    for busy_start, busy_end in busy_ranges(master, date):
        if start < busy_end and busy_start < end:
            return True
    return False


def create_event(row: dict, minutes: int) -> str:
    cal = calendar_id(str(row.get("master") or ""))
    service = _service()
    if not cal or not service:
        return ""
    ensure_calendar_timezone()
    start = datetime.strptime(f"{row['date']} {row['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
    end = start + timedelta(minutes=max(minutes, 30))
    master = str(row.get("master") or "")
    body = {
        "summary": f"{master} · {row.get('service')} · {row.get('name')}",
        "description": (
            f"Майстер: {master}\n"
            f"Телефон: {row.get('phone')}\n"
            + (f"Дизайн: {row.get('design')}\n" if row.get("design") else "")
            + f"Джерело: {row.get('source')}\n"
            f"#{row.get('id')}"
        ),
        "colorId": EVENT_COLOR.get(master, "11"),
        "extendedProperties": {"private": {"master": master, "booking": str(row.get("id") or "")}},
        "start": {
            "dateTime": start.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": GCAL_TZ,
        },
        "end": {
            "dateTime": end.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": GCAL_TZ,
        },
    }
    try:
        created = service.events().insert(calendarId=cal, body=body).execute()
    except Exception:
        return ""
    return str(created.get("id") or "")


def ensure_calendar_timezone() -> bool:
    """Календар у UTC показує київські слоти на 2–3 години раніше."""
    cal = calendar_id("Аля") or calendar_id("Єлизавета")
    service = _service()
    if not cal or not service:
        return False
    try:
        meta = service.calendars().get(calendarId=cal).execute()
        if meta.get("timeZone") in {GCAL_TZ, "Europe/Kyiv"}:
            return True
        service.calendars().patch(calendarId=cal, body={"timeZone": GCAL_TZ}).execute()
        return True
    except Exception:
        return False
