const SERVICES = [
  { name: "Манікюр + покриття", mins: 90, price: 650 },
  { name: "Манікюр + дизайн", mins: 110, price: 850 },
  { name: "Педикюр + покриття", mins: 90, price: 750 },
  { name: "Зняття / корекція", mins: 45, price: 300 },
  { name: "Комплекс руки + ноги", mins: 180, price: 1300 },
];

const TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

function fillServices() {
  const cards = document.getElementById("serviceCards");
  const select = document.getElementById("serviceSelect");
  cards.innerHTML = SERVICES.map(
    (s) => `<article class="card">
      <h3>${s.name}</h3>
      <p>${s.mins} хвилин</p>
      <div class="price">${s.price} грн</div>
    </article>`
  ).join("");
  select.innerHTML = SERVICES.map((s) => `<option value="${s.name}">${s.name} · ${s.price} грн</option>`).join("");
}

function nextOpenDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fillTimes() {
  const sel = document.getElementById("timeSelect");
  sel.innerHTML = TIMES.map((t) => `<option>${t}</option>`).join("");
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    const link = document.getElementById("botLink");
    if (data.bot_url) {
      link.href = data.bot_url;
    } else {
      link.textContent = "Бот підключимо після токена";
      link.removeAttribute("href");
    }
  } catch (_) {
    /* offline */
  }
}

function showNote(text, ok) {
  const el = document.getElementById("formNote");
  el.hidden = false;
  el.textContent = text;
  el.className = "form-note " + (ok ? "is-ok" : "is-bad");
}

document.getElementById("bookForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submitBtn");
  const payload = Object.fromEntries(new FormData(e.target).entries());
  btn.disabled = true;
  try {
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "не вдалося записати");
    showNote("Записано. Студія отримає заявку в Telegram.", true);
    e.target.reset();
    document.getElementById("dateInput").value = nextOpenDate();
    fillTimes();
  } catch (err) {
    showNote(String(err.message || err), false);
  } finally {
    btn.disabled = false;
  }
});

function visibleShots() {
  return window.matchMedia("(max-width: 820px)").matches ? 2 : 3;
}

function setupShowcase() {
  const track = document.getElementById("showcaseTrack");
  const dots = document.getElementById("showcaseDots");
  const stage = document.getElementById("showcase");
  if (!track || !dots) return;

  const total = track.children.length;
  let index = 0;
  let timer = 0;

  function maxIndex() {
    return Math.max(0, total - visibleShots());
  }

  function renderDots() {
    dots.innerHTML = "";
    const last = maxIndex();
    for (let i = 0; i <= last; i += 1) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("aria-label", `Роботи ${i + 1}`);
      btn.className = i === index ? "is-on" : "";
      btn.addEventListener("click", () => go(i));
      dots.appendChild(btn);
    }
  }

  function go(next) {
    index = Math.max(0, Math.min(maxIndex(), next));
    const card = track.children[0];
    const stepPx = card.getBoundingClientRect().width + 12;
    track.style.transform = `translateX(-${index * stepPx}px)`;
    [...dots.children].forEach((dot, i) => dot.classList.toggle("is-on", i === index));
  }

  function step(dir) {
    const last = maxIndex();
    if (index + dir > last) go(0);
    else if (index + dir < 0) go(last);
    else go(index + dir);
  }

  function play() {
    window.clearInterval(timer);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer = window.setInterval(() => step(1), 3800);
  }

  document.getElementById("showcasePrev").addEventListener("click", () => {
    step(-1);
    play();
  });
  document.getElementById("showcaseNext").addEventListener("click", () => {
    step(1);
    play();
  });
  stage.addEventListener("mouseenter", () => window.clearInterval(timer));
  stage.addEventListener("mouseleave", play);
  window.addEventListener("resize", () => {
    if (index > maxIndex()) index = maxIndex();
    renderDots();
    go(index);
  });

  renderDots();
  go(0);
  play();
}

fillServices();
fillTimes();
document.getElementById("dateInput").value = nextOpenDate();
document.getElementById("dateInput").min = nextOpenDate();
loadConfig();
setupShowcase();
