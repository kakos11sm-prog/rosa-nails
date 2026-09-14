# ROSA — нігтьова студія

Лендінг + запис онлайн. Заявки в журнал, Telegram і Google Календар.

Локально: `python app.py` → http://127.0.0.1:5051

## Google Календар

Без ключів сайт працює як раніше. Після підключення:

- зайнятий час у календарі майстра не показується на сайті і в боті;
- новий запис одразу стає подією (ім’я, телефон, послуга).

1. Google Cloud → новий проєкт → увімкнути **Google Calendar API**.
2. Credentials → Service account → ключ JSON. Файл покласти в `secrets/google-service.json`.
3. У Google Календарі створити календар Алі і календар Єлизавети (або один спільний).
4. Налаштування календаря → Доступ → додати email сервісного акаунта (`...@...iam.gserviceaccount.com`) з правом **Вносити зміни в події**.
5. Скопіювати ID календаря (Налаштування → Інтеграція календаря) у `.env`:

```
GOOGLE_SERVICE_ACCOUNT_FILE=secrets/google-service.json
GOOGLE_CALENDAR_ALYA=xxxxx@group.calendar.google.com
GOOGLE_CALENDAR_ELIZAVETA=yyyyy@group.calendar.google.com
```

На Render зручніше вставити вміст JSON у `GOOGLE_SERVICE_ACCOUNT_JSON`.
