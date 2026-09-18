# -*- coding: utf-8 -*-
"""Telegram-бот запису в студію ROSA. Ті самі слоти, що на сайті."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

import app as store

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

SERVICE, MASTER, DATE, TIME, NAME, PHONE = range(6)

SERVICES = list(store.catalog_services())
MASTERS = list(store.catalog_masters())
TIMES = store.TIMES


def kb(items: list[str]) -> ReplyKeyboardMarkup:
    rows = [[x] for x in items]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, one_time_keyboard=True)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    payload = (context.args[0] if context.args else "").strip()
    if payload.startswith("rosa_"):
        booking_id = payload[5:]
        chat = str(update.effective_chat.id if update.effective_chat else "")
        try:
            row = store.link_telegram(booking_id, chat)
        except ValueError as exc:
            await update.message.reply_text(f"Не знайшла заявку: {exc}")
            return ConversationHandler.END
        status = row.get("status")
        if status == "confirmed":
            await update.message.reply_text(store.client_decision_text(row, True))
            return ConversationHandler.END
        if status == "cancelled":
            await update.message.reply_text(store.client_decision_text(row, False))
            return ConversationHandler.END
        await update.message.reply_text(
            f"Заявку #{row.get('id')} прив’язала до цього чату.\n"
            f"{row.get('date')} {row.get('time')}, {row.get('master')}.\n"
            f"Сюди напишемо, щойно студія підтвердить або відмовить."
        )
        return ConversationHandler.END
    await update.message.reply_text(
        "ROSA · запис у студію.\nОберіть послугу:",
        reply_markup=kb(list(store.catalog_services())),
    )
    return SERVICE


async def service_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if text not in store.catalog_services():
        await update.message.reply_text("Оберіть послугу з кнопок.")
        return SERVICE
    context.user_data["service"] = text
    await update.message.reply_text("Майстер:", reply_markup=kb(list(store.catalog_masters())))
    return MASTER


async def master_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if text not in store.catalog_masters():
        await update.message.reply_text("Оберіть майстра з кнопок.")
        return MASTER
    context.user_data["master"] = text
    await update.message.reply_text(
        "Дата у форматі РРРР-ММ-ДД, наприклад 2026-09-10.\nПонеділок — вихідний.",
        reply_markup=ReplyKeyboardRemove(),
    )
    return DATE


async def date_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    date = (update.message.text or "").strip()
    master = str(context.user_data.get("master") or "")
    service = str(context.user_data.get("service") or "")
    free = store.free_times(master, date, service)
    if not free:
        await update.message.reply_text(
            "На цю дату немає вільного часу (сайт або Google Календар). "
            "Напишіть іншу дату РРРР-ММ-ДД."
        )
        return DATE
    context.user_data["date"] = date
    best = set(store.tight_times(master, date, service))
    labels = [("● " + time if time in best else time) for time in free]
    note = "Вільний час."
    if best:
        note += "\n● — зручніше поруч з іншими записами."
    await update.message.reply_text(note, reply_markup=kb(labels))
    return TIME


async def time_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip().lstrip("●").strip()
    master = str(context.user_data.get("master") or "")
    date = str(context.user_data.get("date") or "")
    service = str(context.user_data.get("service") or "")
    if text not in store.free_times(master, date, service):
        await update.message.reply_text("Оберіть час з кнопок.")
        return TIME
    context.user_data["time"] = text
    await update.message.reply_text("Ваше ім’я:", reply_markup=ReplyKeyboardRemove())
    return NAME


async def name_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["name"] = (update.message.text or "").strip()
    await update.message.reply_text("Телефон:")
    return PHONE


async def phone_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["phone"] = (update.message.text or "").strip()
    payload = {
        **context.user_data,
        "source": "telegram",
        "telegram_id": str(update.effective_chat.id if update.effective_chat else ""),
    }
    try:
        row = store.add_booking(payload)
    except ValueError as exc:
        await update.message.reply_text(f"Не записала: {exc}\n/start — спробувати ще раз.")
        return ConversationHandler.END
    if not store.notify_admin(row):
        try:
            store.confirm_booking(row["id"])
        except ValueError:
            pass
        await update.message.reply_text(
            f"Записала. {row['date']} {row['time']}, майстер {row['master']}."
        )
        return ConversationHandler.END
    await update.message.reply_text(
        f"Заявку надіслано. {row['date']} {row['time']}, {row['master']}.\n"
        f"Студія підтвердить у Telegram — тоді з’явиться в календарі."
    )
    return ConversationHandler.END


def _admin_chat() -> str:
    return str(os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or "").strip()


def _markup(keyboard):
    if not keyboard:
        return None
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton(btn.get("text") or "", callback_data=btn.get("callback_data") or "") for btn in row]
            for row in keyboard
        ]
    )


async def decide_booking(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query or not query.data:
        return
    chat_id = str(query.message.chat_id if query.message else "")
    parts = str(query.data).split(":")
    action = parts[0] if parts else ""
    booking_id = parts[1] if len(parts) > 1 else ""
    extra = parts[2] if len(parts) > 2 else ""
    text = None
    keyboard = None
    toast = ""
    try:
        text, keyboard, toast = store.apply_admin_callback(action, booking_id, extra, chat_id)
    except ValueError as exc:
        text = f"Не вийшло: {exc}"
        keyboard = []
        toast = str(exc)
    except Exception as exc:
        text = f"Не вийшло: {exc}"
        keyboard = []
        toast = str(exc)
    try:
        if toast:
            await query.answer(toast[:180])
        else:
            await query.answer()
    except Exception:
        pass
    if text is None:
        return
    try:
        await query.edit_message_text(
            text,
            parse_mode="HTML",
            reply_markup=_markup(keyboard),
        )
    except Exception:
        print(f"кнопка запису не спрацювала: {text}")


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Скасовано.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END


def _single_instance() -> None:
    import socket

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 5053))
    except OSError as exc:
        raise SystemExit("бот ROSA вже запущено") from exc
    globals()["_BOT_LOCK"] = sock


def main() -> None:
    _single_instance()
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        raise SystemExit("немає TELEGRAM_BOT_TOKEN у файлі .env")
    app = Application.builder().token(token).build()
    conv = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            SERVICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, service_chosen)],
            MASTER: [MessageHandler(filters.TEXT & ~filters.COMMAND, master_chosen)],
            DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, date_chosen)],
            TIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, time_chosen)],
            NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, name_chosen)],
            PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, phone_chosen)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    app.add_handler(CallbackQueryHandler(decide_booking, pattern=r"^(ok|no|mv|dt|tm|go|xx|bk|ds):"))
    app.add_handler(conv)
    print("бот ROSA запущено", flush=True)
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
