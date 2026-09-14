const SERVICES = [
  { name: "Манікюр + покриття", mins: 90, price: 650, img: "/static/img/look-nude.png" },
  { name: "Манікюр + дизайн", mins: 110, price: 850, img: "/static/img/look-geo.png" },
  { name: "Педикюр + покриття", mins: 90, price: 750, img: "/static/img/look-pedi.png" },
  { name: "Зняття / корекція", mins: 45, price: 300, img: "/static/img/look-berry.png" },
  { name: "Комплекс руки + ноги", mins: 180, price: 1300, img: "/static/img/look-french.png" },
];

const pickerState = { year: 0, month: 0, open: new Set() };

function nextOpenDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fillServicePicks() {
  document.getElementById("servicePicks").innerHTML = SERVICES.map(
    (s) => `<button type="button" class="pick-service" data-service="${s.name}">
      <img src="${s.img}" alt="" />
      <span><strong>${s.name}</strong><em>${s.price} грн · ${s.mins} хв</em></span>
    </button>`
  ).join("");
}

function updateWhenSummary() {
  const date = document.getElementById("dateInput").value;
  const time = document.getElementById("timeSelect").value;
  const el = document.getElementById("whenSummary");
  if (date && time) {
    const pretty = new Date(date + "T12:00:00").toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
    });
    el.textContent = `${pretty}, ${time}`;
    return;
  }
  el.textContent = date ? "Оберіть час" : "Виберіть дату і час";
}

function openStep(name) {
  document.querySelectorAll(".step").forEach((step) => {
    step.classList.toggle("is-open", step.dataset.step === name);
  });
}

function setTimes(times) {
  const field = document.getElementById("timeField");
  const sel = document.getElementById("timeSelect");
  const picked = sel.value;
  if (!times || !times.length) {
    field.hidden = true;
    sel.value = "";
    field.innerHTML = "";
    updateWhenSummary();
    return;
  }
  const groups = [
    { title: "Ранок", items: times.filter((t) => t < "12:00") },
    { title: "День", items: times.filter((t) => t >= "12:00" && t < "17:00") },
    { title: "Вечір", items: times.filter((t) => t >= "17:00") },
  ].filter((g) => g.items.length);
  field.hidden = false;
  field.innerHTML = groups
    .map(
      (g) => `<p class="slot-label">${g.title}</p>
      <div class="slot-grid">${g.items
        .map((t) => `<button type="button" class="slot-btn${t === picked ? " is-on" : ""}" data-time="${t}">${t}</button>`)
        .join("")}</div>`
    )
    .join("");
  if (picked && !times.includes(picked)) {
    sel.value = "";
    updateWhenSummary();
  }
}

function paintPicker() {
  const box = document.getElementById("datePicker");
  const selected = document.getElementById("dateInput").value;
  const title = new Date(pickerState.year, pickerState.month, 1).toLocaleDateString("uk-UA", {
    month: "long",
    year: "numeric",
  });
  const first = new Date(pickerState.year, pickerState.month, 1);
  const shift = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(pickerState.year, pickerState.month + 1, 0).getDate();
  let cells = "";
  for (let i = 0; i < shift; i += 1) cells += `<span class="picker-pad"></span>`;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = ymd(new Date(pickerState.year, pickerState.month, day));
    const open = pickerState.open.has(value);
    const on = value === selected;
    cells += `<button type="button" class="picker-day${on ? " is-on" : ""}" data-day="${value}" ${open ? "" : "disabled"}>${day}</button>`;
  }
  box.innerHTML = `
    <div class="picker-nav">
      <button type="button" class="picker-shift" data-shift="-1" aria-label="Попередній місяць">‹</button>
      <strong>${title}</strong>
      <button type="button" class="picker-shift" data-shift="1" aria-label="Наступний місяць">›</button>
    </div>
    <div class="picker-week">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="picker-grid">${cells}</div>
  `;
}

async function refreshDays() {
  const master = document.getElementById("masterSelect").value;
  const service = document.getElementById("serviceSelect").value;
  const dateInput = document.getElementById("dateInput");
  const hint = document.getElementById("slotsHint");
  if (!master || !service) {
    paintPicker();
    return;
  }
  try {
    const q = new URLSearchParams({ master, service, _: String(Date.now()) });
    const res = await fetch(`/api/days?${q}`, { cache: "no-store" });
    const data = await res.json();
    pickerState.open = new Set(data.days || []);
  } catch (_) {
    pickerState.open = new Set();
  }
  if (dateInput.value && !pickerState.open.has(dateInput.value)) {
    dateInput.value = "";
    document.getElementById("timeSelect").value = "";
  }
  if (dateInput.value) {
    const [y, m] = dateInput.value.split("-").map(Number);
    pickerState.year = y;
    pickerState.month = m - 1;
  }
  paintPicker();
  if (!dateInput.value) {
    setTimes([]);
    if (hint) hint.textContent = pickerState.open.size ? "Оберіть вільний день." : "Немає вільних днів у цього майстра.";
    return;
  }
  await refreshSlots();
}

async function refreshSlots() {
  const date = document.getElementById("dateInput").value;
  const master = document.getElementById("masterSelect").value;
  const service = document.getElementById("serviceSelect").value;
  const hint = document.getElementById("slotsHint");
  if (!date || !master) {
    setTimes([]);
    return;
  }
  try {
    const q = new URLSearchParams({ date, master, service, _: String(Date.now()) });
    const res = await fetch(`/api/slots?${q}`, { cache: "no-store" });
    const data = await res.json();
    const times = data.times || [];
    setTimes(times);
    if (hint) hint.textContent = times.length ? "Оберіть вільний час." : "На цю дату вільних годин немає.";
  } catch (_) {
    setTimes([]);
  }
}

function showNote(text, ok) {
  const el = document.getElementById("formNote");
  el.hidden = false;
  el.textContent = text;
  el.className = "form-note " + (ok ? "is-ok" : "is-bad");
}

const start = new Date(nextOpenDate() + "T12:00:00");
pickerState.year = start.getFullYear();
pickerState.month = start.getMonth();
fillServicePicks();
paintPicker();

document.getElementById("bookForm").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-open]");
  if (tab) {
    openStep(tab.dataset.open);
    return;
  }
  const person = e.target.closest("[data-master]");
  if (person) {
    document.getElementById("masterSelect").value = person.dataset.master;
    document.getElementById("masterSummary").textContent = person.dataset.master;
    document.querySelectorAll("[data-master]").forEach((el) => el.classList.toggle("is-on", el === person));
    if (document.getElementById("serviceSelect").value) refreshDays();
    openStep("service");
    return;
  }
  const service = e.target.closest("[data-service]");
  if (service) {
    document.getElementById("serviceSelect").value = service.dataset.service;
    const info = SERVICES.find((s) => s.name === service.dataset.service);
    document.getElementById("serviceSummary").textContent = info
      ? `${info.name} · ${info.price} грн`
      : service.dataset.service;
    document.querySelectorAll("[data-service]").forEach((el) => el.classList.toggle("is-on", el === service));
    if (document.getElementById("masterSelect").value) refreshDays();
    openStep("when");
    return;
  }
  const shift = e.target.closest("[data-shift]");
  if (shift) {
    pickerState.month += Number(shift.dataset.shift);
    if (pickerState.month < 0) {
      pickerState.month = 11;
      pickerState.year -= 1;
    }
    if (pickerState.month > 11) {
      pickerState.month = 0;
      pickerState.year += 1;
    }
    paintPicker();
    return;
  }
  const day = e.target.closest("[data-day]");
  if (day && !day.disabled) {
    document.getElementById("dateInput").value = day.dataset.day;
    document.getElementById("timeSelect").value = "";
    paintPicker();
    updateWhenSummary();
    refreshSlots();
    return;
  }
  const slot = e.target.closest("[data-time]");
  if (slot) {
    document.getElementById("timeSelect").value = slot.dataset.time;
    document.querySelectorAll(".slot-btn").forEach((el) => el.classList.toggle("is-on", el === slot));
    updateWhenSummary();
    openStep("contacts");
  }
});

document.getElementById("bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submitBtn");
  const payload = Object.fromEntries(new FormData(e.target).entries());
  if (!payload.master || !payload.service || !payload.date || !payload.time) {
    showNote("Оберіть майстра, послугу, дату і час.", false);
    return;
  }
  btn.disabled = true;
  try {
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "не вдалося записати");
    location.href = `/status/${data.booking.id}`;
  } catch (err) {
    showNote(String(err.message || err), false);
    btn.disabled = false;
  }
});
