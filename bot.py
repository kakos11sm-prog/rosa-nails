# -*- coding: utf-8 -*-
"""Telegram-бот запису в студію ROSA. Ті самі слоти, що на сайті."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes

import app as store

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


async def _html(message, text: str, keyboard=None) -> None:
    if not message:
        return
    await message.reply_text(
        text,
        parse_mode="HTML",
        disable_web_page_preview=True,
        reply_markup=_markup(keyboard) if keyboard else None,
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    payload = (context.args[0] if context.args else "").strip()
    chat = str(update.effective_chat.id if update.effective_chat else "")
    if payload.startswith("rosa_"):
        try:
            row = store.link_telegram(payload[5:], chat)
        except ValueError as exc:
            await _html(update.message, f"Не знайшла заявку: {store.html_esc(exc)}")
            return
        text, keyboard = store.client_linked_pack(row)
        await _html(update.message, text, keyboard)
        return
    first = (update.effective_user.first_name if update.effective_user else "") or ""
    text, keyboard = store.client_open_pack(chat, first)
    await _html(update.message, text, keyboard)


def _admin_chat() -> str:
    return str(os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or "").strip()


def _markup(keyboard):
    if keyboard is None:
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
    data = str(query.data)
    parts = data.split(":")
    action = parts[0] if parts else ""
    booking_id = parts[1] if len(parts) > 1 else ""
    extra = parts[2] if len(parts) > 2 else ""
    text = None
    keyboard = None
    toast = ""
    try:
        if data.startswith("c:"):
            text, keyboard, toast = store.handle_client_callback(data, chat_id)
        else:
            text, keyboard, toast = store.apply_admin_callback(action, booking_id, extra, chat_id)
    except ValueError as exc:
        text = f"Не вийшло: {store.html_esc(exc)}"
        keyboard = []
        toast = str(exc)
    except Exception as exc:
        text = f"Не вийшло: {store.html_esc(exc)}"
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


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = str(update.effective_chat.id if update.effective_chat else "")
    first = (update.effective_user.first_name if update.effective_user else "") or ""
    text, keyboard = store.client_open_pack(chat, first)
    await _html(update.message, text, keyboard)


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
    app.add_handler(CallbackQueryHandler(decide_booking, pattern=r"^c:"))
    app.add_handler(CallbackQueryHandler(decide_booking, pattern=r"^(ok|no|mv|dt|tm|go|xx|bk|ds):"))
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("cancel", cancel))
    print("бот ROSA запущено", flush=True)
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
