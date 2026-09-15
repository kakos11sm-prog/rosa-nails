const PRICE = {
  masters: [
    { id: "Аля", label: "Аля" },
    { id: "Єлизавета", label: "Єлизавета" },
  ],
  sections: [
    {
      title: "Манікюр",
      items: [
        { name: "Комплекс з покриттям", note: "Зняття, манікюр, форма, покриття", img: "/static/img/look-nude.png", prices: { Аля: 650, Єлизавета: 700 } },
        { name: "Комплекс з укріпленням", note: "Зняття, манікюр, укріплення, ремонт, покриття", img: "/static/img/look-geo.png", prices: { Аля: 750, Єлизавета: 800 } },
        { name: "Гігієнічний манікюр без покриття", note: "Манікюр, опил форми, покриття прозорим лаком", img: "/static/img/look-french.png", prices: { Аля: 450, Єлизавета: 450 } },
        { name: "Зняття без подальшого покриття", note: "", img: "/static/img/look-berry.png", prices: { Аля: 100, Єлизавета: 100 } },
      ],
    },
    {
      title: "Нарощення",
      items: [
        { name: "Нарощення (довжина 1–2)", note: "Кожна наступна довжина +50 грн", img: "/static/img/look-ombre.png", prices: { Аля: 900, Єлизавета: 1000 } },
        { name: "Нарощення на тіпсі", note: "Потрібно перенарощувати кожну другу корекцію", img: "/static/img/look-bridal.png", prices: { Аля: 850, Єлизавета: 900 } },
        { name: "Відновлення архітектури", note: "1 ніготь / усі · підняття клюючих, дорощування кутів, ремонт тріщин", img: "/static/img/look-chrome.png", prices: { Аля: "10 / 50", Єлизавета: "10 / 50" } },
        { name: "Нарощення 1 нігтя", note: "", img: "/static/img/look-evening.png", prices: { Аля: 50, Єлизавета: 50 } },
      ],
    },
    {
      title: "Педикюр",
      items: [
        { name: "Комплекс гігієна", note: "Зняття, обробка стопи і пальців, покриття прозорим лаком", img: "/static/img/look-pedi.png", prices: { Аля: 700, Єлизавета: 700 } },
        { name: "Комплекс з покриттям", note: "Зняття, обробка стопи і пальців, покриття гель-лак", img: "/static/img/look-pedi.png", prices: { Аля: 800, Єлизавета: 800 } },
        { name: "Покриття тільки пальці", note: "Зняття, обробка пальців, покриття гель-лак", img: "/static/img/look-pedi.png", prices: { Аля: 650, Єлизавета: 650 } },
        { name: "Педикюр без покриття", note: "Зняття, обробка пальців, покриття прозорим лаком", img: "/static/img/look-pedi.png", prices: { Аля: 550, Єлизавета: 550 } },
        { name: "Зняття покриття", note: "", img: "/static/img/look-pedi.png", prices: { Аля: 100, Єлизавета: 100 } },
      ],
    },
  ],
};

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

function money(value) {
  return typeof value === "number" ? `${value} грн` : `${value} грн`;
}

function fillPrice() {
  const pick = document.getElementById("priceMasters");
  const board = document.getElementById("priceBoard");
  if (!pick || !board) return;
  let active = PRICE.masters[0].id;

  function paintMasters() {
    if (!pick.querySelector(".price-switch")) {
      pick.innerHTML = `<div class="price-switch" role="tablist" aria-label="Майстер прайсу">
          <i class="price-switch-glider" aria-hidden="true"></i>
          ${PRICE.masters
            .map(
              (m) => `<button type="button" role="tab" class="price-master" data-master="${m.id}">${m.label}</button>`
            )
            .join("")}
        </div>
        <p class="price-switch-hint">Ціни різні — натисни і порівняй</p>`;
    }
    const sw = pick.querySelector(".price-switch");
    sw.classList.toggle("is-liza", active === "Єлизавета");
    pick.querySelectorAll("[data-master]").forEach((btn) => {
      const on = btn.dataset.master === active;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function paintBoard() {
    board.innerHTML = PRICE.sections
      .map(
        (section, si) => `<div class="price-group">
          <h3>${section.title}</h3>
          <div class="price-cards">
            ${section.items
              .map((item, ii) => `<article class="price-card">
                  <img src="${item.img}" alt="" />
                  <div>
                    <h4>${item.name}</h4>
                    ${item.note ? `<p>${item.note}</p>` : ""}
                    <strong class="price" data-price-key="${si}-${ii}">${money(item.prices[active])}</strong>
                  </div>
                </article>`)
              .join("")}
          </div>
        </div>`
      )
      .join("");
  }

  function swapPrices() {
    board.querySelectorAll("[data-price-key]").forEach((dd) => {
      const [si, ii] = dd.dataset.priceKey.split("-").map(Number);
      const next = money(PRICE.sections[si].items[ii].prices[active]);
      if (dd.textContent === next) return;
      dd.classList.add("is-out");
      window.setTimeout(() => {
        dd.textContent = next;
        dd.classList.remove("is-out");
      }, 180);
    });
  }

  pick.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-master]");
    if (!btn || btn.dataset.master === active) return;
    active = btn.dataset.master;
    paintMasters();
    swapPrices();
  });

  paintMasters();
  paintBoard();
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
    const link = document.getElementById("botLink");
    if (!link) return;
    if (data.bot_url) {
      link.href = data.bot_url;
    } else {
      link.hidden = true;
    }
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

fillPrice();
fillLooks();
loadConfig();
setupShowcase();
setupFooterReveal();
