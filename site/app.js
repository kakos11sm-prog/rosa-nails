const SERVICES = [
  { name: "Манікюр + покриття", mins: 90, price: 650, img: "/static/img/look-nude.png" },
  { name: "Манікюр + дизайн", mins: 110, price: 850, img: "/static/img/look-geo.png" },
  { name: "Педикюр + покриття", mins: 90, price: 750, img: "/static/img/look-pedi.png" },
  { name: "Зняття / корекція", mins: 45, price: 300, img: "/static/img/look-berry.png" },
  { name: "Комплекс руки + ноги", mins: 180, price: 1300, img: "/static/img/look-french.png" },
];

const TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

const LOOKS = [
  { name: "Молочний френч", img: "/static/img/look-french.png", tag: "Френч", featured: true },
  { name: "Омбре", img: "/static/img/look-ombre.png", tag: "Нюд", wide: true },
  { name: "Нюд + блиск", img: "/static/img/look-nude.png", tag: "Нюд" },
  { name: "Ягідний глянець", img: "/static/img/look-berry.png", tag: "Яскраві" },
  { name: "Кішечка", img: "/static/img/look-cateye.png", tag: "Яскраві" },
  { name: "Хром", img: "/static/img/look-chrome.png", tag: "Дизайн" },
  { name: "Квіти", img: "/static/img/look-floral.png", tag: "Дизайн" },
  { name: "Геометрія", img: "/static/img/look-geo.png", tag: "Дизайн" },
  { name: "Весільний", img: "/static/img/look-bridal.png", tag: "Весілля" },
  { name: "Вечірній", img: "/static/img/look-evening.png", tag: "Вечір" },
  { name: "Класика", img: "/static/img/hero.png", tag: "Нюд" },
  { name: "Педикюр", img: "/static/img/look-pedi.png", tag: "Педикюр" },
];

function fillServices() {
  const cards = document.getElementById("serviceCards");
  if (!cards) return;
  cards.innerHTML = SERVICES.map(
    (s, i) => `<article class="card" style="--d:${0.06 + i * 0.07}s">
      <img src="${s.img}" alt="${s.name}" />
      <div>
        <h3>${s.name}</h3>
        <p>${s.mins} хв · <span class="price">${s.price} грн</span></p>
      </div>
    </article>`
  ).join("");
}

function fillLooks() {
  const grid = document.getElementById("looksGrid");
  const filters = document.getElementById("lookFilters");
  if (!grid || !filters) return;

  const tags = ["Усі", ...new Set(LOOKS.map((l) => l.tag))];
  let active = "Усі";

  function paint() {
    filters.innerHTML = tags
      .map(
        (t) =>
          `<button type="button" class="chip-btn${t === active ? " is-on" : ""}" data-tag="${t}">${t}</button>`
      )
      .join("");
    const rows = active === "Усі" ? LOOKS : LOOKS.filter((l) => l.tag === active);
    grid.innerHTML = rows
      .map((l, i) => {
        const extra = l.featured && active === "Усі" ? " look-wide" : l.wide && active === "Усі" ? " look-span" : "";
        return `<article class="look${extra}" style="--d:${0.04 + i * 0.05}s">
          <img src="${l.img}" alt="${l.name}" />
          <span>${l.name}</span>
        </article>`;
      })
      .join("");
  }

  filters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tag]");
    if (!btn) return;
    active = btn.dataset.tag;
    paint();
  });

  paint();
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    document.querySelectorAll(".js-bot-link").forEach((link) => {
      if (data.bot_url) {
        link.href = data.bot_url;
        link.removeAttribute("aria-disabled");
        return;
      }
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      const label = link.querySelector("[data-bot-label]");
      if (label) label.textContent = "Бот підключимо після токена";
    });
  } catch (_) {
    /* offline */
  }
}

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

function revealOnView(el) {
  if (!el) return;
  const show = () => el.classList.add("is-in");
  if (!("IntersectionObserver" in window)) {
    show();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        show();
        io.disconnect();
      }
    },
    { threshold: 0.18 }
  );
  io.observe(el);
}

function setupFooterReveal() {
  revealOnView(document.getElementById("visit"));
  revealOnView(document.getElementById("services"));
  revealOnView(document.getElementById("looks"));
}

fillServices();
fillLooks();
loadConfig();
setupShowcase();
setupFooterReveal();
