let SERVICES = [
  { name: "Комплекс з покриттям", mins: 90, price: { Аля: 650, Єлизавета: 700 }, img: "/static/img/look-nude.png", group: "Манікюр" },
  { name: "Комплекс з укріпленням", mins: 110, price: { Аля: 750, Єлизавета: 800 }, img: "/static/img/look-geo.png", group: "Манікюр" },
  { name: "Гігієнічний манікюр без покриття", mins: 60, price: 450, img: "/static/img/look-french.png", group: "Манікюр" },
  { name: "Зняття без подальшого покриття", mins: 30, price: 100, img: "/static/img/look-berry.png", group: "Манікюр" },
  { name: "Нарощення (довжина 1–2)", mins: 150, price: { Аля: 900, Єлизавета: 1000 }, img: "/static/img/look-ombre.png", group: "Нарощення" },
  { name: "Нарощення на тіпсі", mins: 150, price: { Аля: 850, Єлизавета: 900 }, img: "/static/img/look-bridal.png", group: "Нарощення" },
  { name: "Нарощення 1 нігтя", mins: 45, price: 50, img: "/static/img/look-chrome.png", group: "Нарощення" },
  { name: "Відновлення архітектури", mins: 45, price: 50, img: "/static/img/look-evening.png", group: "Нарощення" },
  { name: "Педикюр: комплекс гігієна", mins: 90, price: 700, img: "/static/img/look-pedi.png", group: "Педикюр" },
  { name: "Педикюр: комплекс з покриттям", mins: 90, price: 800, img: "/static/img/look-pedi.png", group: "Педикюр" },
  { name: "Педикюр: покриття тільки пальці", mins: 75, price: 650, img: "/static/img/look-pedi.png", group: "Педикюр" },
  { name: "Педикюр без покриття", mins: 60, price: 550, img: "/static/img/look-pedi.png", group: "Педикюр" },
  { name: "Педикюр: зняття покриття", mins: 30, price: 100, img: "/static/img/look-pedi.png", group: "Педикюр" },
];

let DESIGNS = [
  { name: "Френч (ручки)", price: 100 },
  { name: "Френч (ніжки)", price: 50 },
  { name: "Наліпки, поталь (1 ніготь)", price: 10 },
  { name: "Стемпінг, втирка (1 ніготь)", price: 10 },
  { name: "Сухоцвіти (1 ніготь)", price: 15 },
  { name: "Градієнт (1 ніготь)", price: 15 },
  { name: "Малюнок від руки", price: "від 20" },
  { name: "Об'ємні фігурки (1 шт)", price: 30 },
  { name: "Кошаче око", price: 50 },
  { name: "Світловідбиваючий", price: 50 },
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

function servicePrice(item, master) {
  if (typeof item.price === "number") return item.price;
  if (master && item.price[master] != null) return item.price[master];
  return Math.min(...Object.values(item.price));
}

function fillServicePicks() {
  const box = document.getElementById("servicePicks");
  const master = document.getElementById("masterSelect").value;
  const groups = [...new Set(SERVICES.map((s) => s.group))];
  box.innerHTML = groups
    .map((group) => {
      const rows = SERVICES.filter((s) => s.group === group)
        .map((s) => {
          const price = servicePrice(s, master);
          const label = master ? `${price} грн · ${s.mins} хв` : `від ${price} грн · ${s.mins} хв`;
          const on = s.name === document.getElementById("serviceSelect").value ? " is-on" : "";
          return `<button type="button" class="pick-service${on}" data-service="${s.name}">
            <img src="${s.img}" alt="" />
            <span><strong>${s.name}</strong><em>${label}</em></span>
          </button>`;
        })
        .join("");
      return `<p class="slot-label">${group}</p>${rows}`;
    })
    .join("");
}

function designMoney(item) {
  if (!item) return "";
  return typeof item.price === "number" ? `${item.price} грн` : `${item.price} грн`;
}

function fillDesignPicks() {
  const box = document.getElementById("designPicks");
  if (!box) return;
  const chosen = document.getElementById("designSelect").value;
  box.innerHTML = DESIGNS.map((item) => {
    const on = item.name === chosen ? " is-on" : "";
    return `<button type="button" class="pick-design${on}" data-design="${item.name}">
      <strong>${item.name}</strong>
      <em>${designMoney(item)}</em>
    </button>`;
  }).join("");
}

function setDesign(name) {
  const item = DESIGNS.find((d) => d.name === name);
  document.getElementById("designSelect").value = name || "";
  document.getElementById("designSummary").textContent = item
    ? `${item.name} · ${designMoney(item)}`
    : "Без додаткового дизайну";
  fillDesignPicks();
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

function setTimes(times, best) {
  const field = document.getElementById("timeField");
  const sel = document.getElementById("timeSelect");
  const picked = sel.value;
  const tight = new Set(best || []);
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
        .map((t) => {
          const on = t === picked ? " is-on" : "";
          const pack = tight.has(t) ? " is-tight" : "";
          return `<button type="button" class="slot-btn${on}${pack}" data-time="${t}">${t}</button>`;
        })
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
    const best = data.best || [];
    const mins = Number(data.mins) || 0;
    setTimes(times, best);
    if (hint) {
      if (!times.length) hint.textContent = "На цю дату вільних годин немає.";
      else if (best.length) {
        hint.innerHTML = `${mins ? `Послуга займає <b>${mins} хв</b>. ` : ""}<i class="slot-dot"></i> зручніше поруч з іншими записами — графік щільніший. Інші години теж можна.`;
      } else {
        hint.textContent = mins ? `Послуга займає ${mins} хв. Оберіть вільний час.` : "Оберіть вільний час.";
      }
    }
  } catch (_) {
    setTimes([]);
  }
}

function applyFromQuery() {
  const q = new URLSearchParams(location.search);
  const master = q.get("master") || "";
  const service = q.get("service") || "";
  const allowed = [...document.querySelectorAll("[data-master]")].map((el) => el.dataset.master);
  if (!allowed.includes(master)) return;
  document.getElementById("masterSelect").value = master;
  document.getElementById("masterSummary").textContent = master;
  document.querySelectorAll("[data-master]").forEach((el) => {
    el.classList.toggle("is-on", el.dataset.master === master);
  });
  fillServicePicks();
  const info = SERVICES.find((s) => s.name === service);
  if (!info) {
    openStep("service");
    return;
  }
  document.getElementById("serviceSelect").value = info.name;
  document.getElementById("serviceSummary").textContent = `${info.name} · ${servicePrice(info, master)} грн`;
  fillServicePicks();
  refreshDays();
  openStep("design");
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

async function bootBook() {
  try {
    const res = await fetch("/api/content", { cache: "no-store" });
    const data = await res.json();
    const pack = data.content || {};
    const rows = [];
    for (const section of (pack.price && pack.price.sections) || []) {
      for (const item of section.items || []) {
        rows.push({
          name: item.book || item.name,
          mins: item.mins || 90,
          price: item.prices,
          img: item.img,
          group: section.title,
        });
      }
    }
    if (rows.length) SERVICES = rows;
    const extras = (pack.designs || []).filter((item) => item && item.name);
    if (extras.length) DESIGNS = extras.map((item) => ({ name: item.name, price: item.price }));
    const box = document.querySelector(".pick-people");
    if (box && (pack.masters || []).length) {
      box.innerHTML = pack.masters
        .map(
          (m) => `<button type="button" class="pick-person" data-master="${m.id}">
            <img src="${m.img}" alt="" />
            <span>${m.label || m.id}</span>
          </button>`
        )
        .join("");
    }
    const brand = document.querySelector(".logo-word");
    if (brand && pack.studio && pack.studio.brand) brand.textContent = pack.studio.brand;
  } catch (_) {
    /* keep fallbacks */
  }
  fillServicePicks();
  fillDesignPicks();
  paintPicker();
  applyFromQuery();
}

bootBook();

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
    fillServicePicks();
    const chosen = document.getElementById("serviceSelect").value;
    if (chosen) {
      const info = SERVICES.find((s) => s.name === chosen);
      if (info) {
        document.getElementById("serviceSummary").textContent = `${info.name} · ${servicePrice(info, person.dataset.master)} грн`;
      }
      refreshDays();
    }
    openStep("service");
    return;
  }
  const service = e.target.closest("[data-service]");
  if (service) {
    document.getElementById("serviceSelect").value = service.dataset.service;
    const info = SERVICES.find((s) => s.name === service.dataset.service);
    document.getElementById("serviceSummary").textContent = info
      ? `${info.name} · ${servicePrice(info, document.getElementById("masterSelect").value)} грн`
      : service.dataset.service;
    document.querySelectorAll("[data-service]").forEach((el) => el.classList.toggle("is-on", el === service));
    if (document.getElementById("masterSelect").value) refreshDays();
    openStep("design");
    return;
  }
  const skip = e.target.closest("[data-design-skip]");
  if (skip) {
    setDesign("");
    if (document.getElementById("masterSelect").value) refreshDays();
    openStep("when");
    return;
  }
  const design = e.target.closest("[data-design]");
  if (design) {
    setDesign(design.dataset.design);
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
    if (data.booking && data.booking.id) rosaSaveBooking(data.booking.id);
    location.href = `/status/${data.booking.id}`;
  } catch (err) {
    showNote(String(err.message || err), false);
    btn.disabled = false;
  }
});
