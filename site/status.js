const LABELS = {
  pending: ["Очікує підтвердження", "Студія ще не відповіла. Сторінка оновиться сама — тут з’явиться так або ні."],
  confirmed: ["Запис підтверджено", "Чекаємо вас у студії в обраний час."],
  cancelled: ["Запис не підтвердили", "Цей час вільний для інших. Оберіть інший слот на сайті."],
  new: ["Очікує підтвердження", "Студія ще не відповіла."],
};

const id = location.pathname.split("/").filter(Boolean).pop();
let last = "";

function setScene(kind) {
  const scene = document.getElementById("statusScene");
  const band = document.getElementById("statusBand");
  const eye = document.getElementById("statusEye");
  if (!scene) return;
  scene.classList.remove("is-wait", "is-ok", "is-no", "is-reveal");
  scene.classList.add("is-" + kind);
  scene.dataset.state = kind;
  if (band) {
    band.classList.remove("is-ok", "is-no");
    if (kind === "ok" || kind === "no") band.classList.add("is-" + kind);
  }
  if (eye) {
    eye.textContent = kind === "ok" ? "Підтверджено" : kind === "no" ? "Відмова" : "Заявка";
  }
  void scene.offsetWidth;
  scene.classList.add("is-reveal");
}

function paint(status, data) {
  const title = document.getElementById("statusTitle");
  const lead = document.getElementById("statusLead");
  const facts = document.getElementById("statusFacts");
  const cta = document.getElementById("statusCta");
  const pack = LABELS[status] || LABELS.pending;
  title.textContent = pack[0];
  lead.textContent = pack[1];
  if (data) {
    facts.hidden = false;
    facts.innerHTML = `
      <div><dt>Номер</dt><dd>#${data.id}</dd></div>
      <div><dt>Коли</dt><dd>${data.date} ${data.time}</dd></div>
      <div><dt>Майстер</dt><dd>${data.master}</dd></div>
      <div><dt>Послуга</dt><dd>${data.service}</dd></div>
    `;
  }
  if (cta) {
    if (status === "confirmed") {
      cta.textContent = "На головну";
      cta.href = "/";
    } else {
      cta.textContent = "Записатись на інший час";
      cta.href = "/book";
    }
  }
  const kind = status === "confirmed" ? "ok" : status === "cancelled" ? "no" : "wait";
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
    paint(data.status, data);
    if (data.status === "pending" || data.status === "new") setTimeout(load, 8000);
  } catch (err) {
    title.textContent = "Заявку не знайдено";
    lead.textContent = String(err.message || err);
    setScene("no");
  }
}

const look = new URLSearchParams(location.search).get("look");
if (look === "ok" || look === "no") {
  paint(look === "ok" ? "confirmed" : "cancelled", {
    id: "demo",
    date: "2026-09-10",
    time: "13:00",
    master: "Аля",
    service: "Манікюр + покриття",
  });
} else {
  load();
}
