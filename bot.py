# -*- coding: utf-8 -*-
"""Telegram-бот запису в студію ROSA. Ті самі слоти, що на сайті."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from telegram import ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import (
    Application,
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

SERVICES = list(store.SERVICES)
MASTERS = list(store.MASTERS)
TIMES = store.TIMES


def kb(items: list[str]) -> ReplyKeyboardMarkup:
    rows = [[x] for x in items]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, one_time_keyboard=True)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text(
        "ROSA · запис у студію.\nОберіть послугу:",
        reply_markup=kb(SERVICES),
    )
    return SERVICE


async def service_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if text not in SERVICES:
        await update.message.reply_text("Оберіть послугу з кнопок.")
        return SERVICE
    context.user_data["service"] = text
    await update.message.reply_text("Майстер:", reply_markup=kb(MASTERS))
    return MASTER


async def master_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if text not in MASTERS:
        await update.message.reply_text("Оберіть майстра з кнопок.")
        return MASTER
    context.user_data["master"] = text
    await update.message.reply_text(
        "Дата у форматі РРРР-ММ-ДД, наприклад 2026-09-10.\nПонеділок — вихідний.",
        reply_markup=ReplyKeyboardRemove(),
    )
    return DATE


async def date_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["date"] = (update.message.text or "").strip()
    await update.message.reply_text("Час:", reply_markup=kb(TIMES))
    return TIME


async def time_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text or "").strip()
    if text not in TIMES:
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
    payload = {**context.user_data, "source": "telegram"}
    try:
        row = store.add_booking(payload)
    except ValueError as exc:
        await update.message.reply_text(f"Не записала: {exc}\n/start — спробувати ще раз.")
        return ConversationHandler.END
    store.notify_admin(row)
    await update.message.reply_text(
        f"Записала. {row['date']} {row['time']}, майстер {row['master']}.\n"
        f"Якщо треба перенести — напишіть сюди."
    )
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Скасовано.", reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END


def main() -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or ""
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
    app.add_handler(conv)
    print("бот ROSA запущено")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
