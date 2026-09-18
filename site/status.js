const LABELS = {
  pending: ["Очікує підтвердження", "Студія ще не відповіла. Сторінка оновиться сама — тут з’явиться так або ні."],
  offered: ["Студія пропонує інший час", "Цей слот не підходить. Оберіть одну з годин нижче — або скасуйте запис."],
  confirmed: ["Запис підтверджено", "Чекаємо вас у студії в обраний час."],
  cancelled: ["Запис скасовано", "Цей час вільний для інших. Оберіть інший слот на сайті."],
  new: ["Очікує підтвердження", "Студія ще не відповіла."],
};

const id = location.pathname.split("/").filter(Boolean).pop();
let last = "";
let busy = false;

function setScene(kind) {
  const scene = document.getElementById("statusScene");
  const band = document.getElementById("statusBand");
  const eye = document.getElementById("statusEye");
  if (!scene) return;
  scene.classList.remove("is-wait", "is-ok", "is-no", "is-offer", "is-reveal");
  scene.classList.add("is-" + kind);
  scene.dataset.state = kind;
  if (band) {
    band.classList.remove("is-ok", "is-no");
    if (kind === "ok" || kind === "no") band.classList.add("is-" + kind);
  }
  if (eye) {
    eye.textContent = kind === "ok" ? "Підтверджено" : kind === "no" ? "Відмова" : kind === "offer" ? "Інший час" : "Заявка";
  }
  const morph = document.getElementById("statusOfferMorph");
  if (morph && kind !== "offer") morph.hidden = true;
  void scene.offsetWidth;
  scene.classList.add("is-reveal");
}

function prettyDay(date) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
}

function showError(text) {
  const box = document.getElementById("statusError");
  if (!box) return;
  box.hidden = !text;
  box.textContent = text || "";
}

function paintOffers(data) {
  const box = document.getElementById("statusOffers");
  if (!box) return;
  const slots = data.slots || [];
  if (data.status !== "offered" || !slots.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const offers = data.offers || [];
  const hours = slots.filter((slot) => slot.kind === "offer");
  const morph = document.getElementById("statusOfferMorph");
  if (morph) {
    morph.hidden = false;
    morph.innerHTML = `
      <p>Пропонуємо інший час</p>
      <div class="status-offer-hours">${hours
        .map((slot) => {
          const many = new Set(hours.map((item) => item.date)).size > 1;
          const when = new Date(`${slot.date}T12:00:00`);
          const day = Number.isNaN(when.getTime())
            ? slot.date
            : when.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
          const label = many ? `${day} · ${slot.time}` : slot.time;
          return `<button type="button" class="status-hour" data-choose="${slot.date}|${slot.time}">${label}</button>`;
        })
        .join("")}</div>
    `;
  }
  box.hidden = false;
  box.className = "status-offers";
  box.innerHTML = `<button type="button" class="btn-ghost" data-cancel="1">Скасувати запис</button>`;
}

function paint(status, data) {
  const title = document.getElementById("statusTitle");
  const lead = document.getElementById("statusLead");
  const facts = document.getElementById("statusFacts");
  const cta = document.getElementById("statusCta");
  const pack = LABELS[status] || LABELS.pending;
  title.textContent = pack[0];
  lead.textContent = pack[1];
  title.hidden = status === "offered";
  lead.hidden = status === "offered";
  if (data) {
    facts.hidden = false;
    facts.innerHTML = `
      <div><dt>Номер</dt><dd>#${data.id}</dd></div>
      <div><dt>${status === "offered" ? "Було" : "Коли"}</dt><dd>${data.date} ${data.time}</dd></div>
      <div><dt>Майстер</dt><dd>${data.master}</dd></div>
      <div><dt>Послуга</dt><dd>${data.service}${data.service_price ? " · " + data.service_price : ""}</dd></div>
      ${data.design ? `<div><dt>Дизайн</dt><dd>${data.design}${data.design_price ? " · " + data.design_price : ""}</dd></div>` : ""}
    `;
  }
  paintOffers({ ...(data || {}), status });
  const tg = document.getElementById("statusTg");
  if (tg) {
    if (data && data.bot_start && status !== "cancelled") {
      tg.hidden = false;
      tg.href = data.bot_start;
      tg.textContent = data.telegram
        ? "Відкрити чат у Telegram"
        : "Отримувати відповідь в Telegram";
    } else {
      tg.hidden = true;
    }
  }
  if (cta) {
    cta.hidden = status === "offered";
    if (status === "confirmed") {
      cta.textContent = "На головну";
      cta.href = "/";
    } else {
      cta.textContent = "Записатись на інший час";
      cta.href = "/book";
    }
  }
  const kind = status === "confirmed" ? "ok" : status === "cancelled" ? "no" : status === "offered" ? "offer" : "wait";
  if (kind !== last) {
    last = kind;
    setScene(kind);
  }
}

async function load() {
  const title = document.getElementById("statusTitle");
  const lead = document.getElementById("statusLead");
  try {
    const res = await fetch("/api/status/" + id, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "немає заявки");
    if (typeof rosaSaveBooking === "function") rosaSaveBooking(data.id);
    paint(data.status, data);
    if (data.status === "pending" || data.status === "new" || data.status === "offered") {
      setTimeout(load, 8000);
    }
  } catch (err) {
    title.textContent = "Заявку не знайдено";
    lead.textContent = String(err.message || err);
    setScene("no");
  }
}

async function postStatus(path, body) {
  const res = await fetch("/api/status/" + id + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "не вийшло");
  return data;
}

document.querySelector(".status-box")?.addEventListener("click", async (e) => {
  const choose = e.target.closest("[data-choose]");
  const cancel = e.target.closest("[data-cancel]");
  if ((!choose && !cancel) || busy) return;
  busy = true;
  showError("");
  try {
    if (cancel) {
      await postStatus("/cancel", {});
      await load();
      return;
    }
    const [date, time] = choose.dataset.choose.split("|");
    await postStatus("/choose", { date, time });
    await load();
  } catch (err) {
    showError(String(err.message || err));
  } finally {
    busy = false;
  }
});

const look = new URLSearchParams(location.search).get("look");
if (look === "ok" || look === "no" || look === "offer") {
  paint(look === "ok" ? "confirmed" : look === "no" ? "cancelled" : "offered", {
    id: "demo",
    date: "2026-09-19",
    time: "11:30",
    master: "Аля",
    service: "Манікюр + покриття",
    offers: look === "offer" ? [{ date: "2026-09-19", time: "14:30" }, { date: "2026-09-19", time: "16:00" }] : [],
    slots: look === "offer" ? [
      { date: "2026-09-19", time: "13:00", kind: "busy" },
      { date: "2026-09-19", time: "14:30", kind: "offer" },
      { date: "2026-09-19", time: "16:00", kind: "offer" },
      { date: "2026-09-19", time: "17:30", kind: "busy" },
    ] : [],
  });
} else {
  load();
}
