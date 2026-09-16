let PRICE = {
  masters: [
    { id: "Аля", label: "Аля" },
    { id: "Єлизавета", label: "Єлизавета" },
  ],
  sections: [],
};

const TIMES = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

let LOOKS = [];

function money(value) {
  return typeof value === "number" ? `${value} грн` : `${value} грн`;
}

function fillPrice() {
  const pick = document.getElementById("priceMasters");
  const board = document.getElementById("priceBoard");
  if (!pick || !board || !PRICE.masters.length) return;
  let active = PRICE.masters[0].id;

  function paintMasters() {
    const n = Math.max(1, PRICE.masters.length);
    const idx = Math.max(0, PRICE.masters.findIndex((m) => m.id === active));
    pick.innerHTML = `<div class="price-switch" role="tablist" aria-label="Майстер прайсу" style="--n:${n};--i:${idx}">
        <i class="price-switch-glider" aria-hidden="true"></i>
        ${PRICE.masters
          .map(
            (m) => `<button type="button" role="tab" class="price-master${m.id === active ? " is-on" : ""}" data-master="${m.id}">${m.label}</button>`
          )
          .join("")}
      </div>
      <p class="price-switch-hint">Ціни різні — натисни і порівняй</p>`;
    pick.querySelectorAll("[data-master]").forEach((btn) => {
      btn.setAttribute("aria-selected", btn.dataset.master === active ? "true" : "false");
    });
    paintHeading();
  }

  function paintBoard() {
    board.innerHTML =
      PRICE.sections
        .map(
          (section, si) => `<div class="price-group">
          <div class="price-group-h">
            <h3 data-edit="price.sections.${si}.title">${section.title}</h3>
            <button type="button" class="edit-del" data-del-section="${si}" aria-label="Прибрати розділ">×</button>
          </div>
          <div class="price-cards">
            ${(section.items || [])
              .map((item, ii) => {
                const q = new URLSearchParams({ master: active, service: item.book || item.name });
                const prices = item.prices || {};
                return `<a class="price-card" href="/book?${q.toString()}">
                  <span class="edit-del" data-del-item="${si}:${ii}" role="button" aria-label="Прибрати послугу">×</span>
                  <div class="price-card-pic">
                    <img src="${item.img}" alt="" data-edit-img="price.sections.${si}.items.${ii}.img" />
                    <strong class="price" data-edit="price.sections.${si}.items.${ii}.prices.${active}">${money(prices[active])}</strong>
                  </div>
                  <div>
                    <h4 data-edit="price.sections.${si}.items.${ii}.name">${item.name}</h4>
                    <p data-edit="price.sections.${si}.items.${ii}.note">${item.note || ""}</p>
                  </div>
                </a>`;
              })
              .join("")}
          </div>
          <button type="button" class="edit-plus" data-add-item="${si}">+ Послуга</button>
        </div>`
        )
        .join("") + `<button type="button" class="edit-plus" data-add="section">+ Розділ</button>`;
  }

  function swapBoard(goingRight) {
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quiet) {
      paintBoard();
      return;
    }
    const out = goingRight ? "is-out-left" : "is-out-right";
    const inn = goingRight ? "is-in-right" : "is-in-left";
    board.classList.remove("is-in-left", "is-in-right", "is-hint");
    board.classList.add(out);
    window.setTimeout(() => {
      paintBoard();
      board.classList.remove(out);
      void board.offsetWidth;
      board.classList.add(inn);
      window.setTimeout(() => board.classList.remove(inn), 420);
    }, 220);
  }

  const head = document.querySelector(".price-head");
  const heading = document.getElementById("priceHeading");

  function paintHeading() {
    if (!heading) return;
    heading.textContent = PRICE.title || "Послуги майстра";
  }

  function hintSwitch() {
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sw = pick.querySelector(".price-switch");
    if (quiet || !sw || PRICE.masters.length < 2) return;
    sw.classList.add("is-hint");
    board.classList.add("is-hint");
    window.setTimeout(() => {
      sw.classList.remove("is-hint");
      board.classList.remove("is-hint");
    }, 1400);
  }

  window.paintPrice = function () {
    if (!PRICE.masters.some((m) => m.id === active)) active = PRICE.masters[0] && PRICE.masters[0].id;
    paintMasters();
    paintBoard();
  };

  if (!fillPrice.bound) {
    fillPrice.bound = true;
    pick.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-master]");
      if (!btn || btn.dataset.master === active) return;
      const from = PRICE.masters.findIndex((m) => m.id === active);
      const to = PRICE.masters.findIndex((m) => m.id === btn.dataset.master);
      active = btn.dataset.master;
      paintMasters();
      swapBoard(to > from);
    });
  }

  paintMasters();
  paintBoard();
  paintHeading();

  const topBar = document.querySelector("header.top");
  const section = document.getElementById("services");

  const brow = document.querySelector(".price-eyebrow");
  const browText = brow && brow.firstElementChild;

  function slideChrome() {
    if (!topBar || !head || !section) return;
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const headerH = topBar.offsetHeight || 1;
    const barTop = head.getBoundingClientRect().top;
    const leave = section.getBoundingClientRect().bottom;
    let cover = Math.min(1, Math.max(0, (headerH - barTop) / headerH));
    if (leave < headerH) {
      cover *= Math.min(1, Math.max(0, leave / headerH));
    }
    const progress = quiet ? (cover > 0.5 ? 1 : 0) : cover;
    topBar.style.transform = `translateY(${(-progress * 100).toFixed(2)}%)`;
    topBar.style.pointerEvents = progress > 0.55 ? "none" : "";

    if (brow && browText) {
      const full = browText.scrollHeight || 18;
      const overlap = Math.max(0, headerH - brow.getBoundingClientRect().top);
      const rest = Math.max(0, full - overlap);
      const shown = rest / full;
      if (quiet) {
        brow.style.height = shown > 0.5 ? "" : "0px";
        brow.style.opacity = shown > 0.5 ? "1" : "0";
        brow.style.marginBottom = shown > 0.5 ? "" : "0px";
        browText.style.transform = "";
      } else {
        brow.style.height = `${rest.toFixed(1)}px`;
        brow.style.opacity = shown.toFixed(3);
        brow.style.marginBottom = `${(14 * shown).toFixed(1)}px`;
        browText.style.transform = overlap > 0 ? `translateY(${-overlap}px)` : "";
      }
    }
  }

  let chromeRaf = 0;
  const onChrome = () => {
    if (chromeRaf) return;
    chromeRaf = window.requestAnimationFrame(() => {
      chromeRaf = 0;
      slideChrome();
    });
  };
  window.addEventListener("scroll", onChrome, { passive: true });
  window.addEventListener("resize", onChrome);
  slideChrome();

  if (section && "IntersectionObserver" in window) {
    const hintIo = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          window.setTimeout(hintSwitch, 280);
          hintIo.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    hintIo.observe(section);
  }
}

function fillLooks() {
  const grid = document.getElementById("looksGrid");
  const filters = document.getElementById("lookFilters");
  if (!grid || !filters) return;

  function paint() {
    const tags = ["Усі", ...new Set(LOOKS.map((l) => l.tag))];
    const active = fillLooks.active || "Усі";
    filters.innerHTML = tags
      .map(
        (t) =>
          `<button type="button" class="chip-btn${t === active ? " is-on" : ""}" data-tag="${t}">${t}</button>`
      )
      .join("");
    const rows = LOOKS.map((l, i) => ({ l, i })).filter((row) => active === "Усі" || row.l.tag === active);
    grid.innerHTML =
      rows
        .map(({ l, i }) => {
          const extra = l.featured && active === "Усі" ? " look-wide" : l.wide && active === "Усі" ? " look-span" : "";
          return `<article class="look${extra}" style="--d:${0.04 + i * 0.05}s" data-edit-img="looks.items.${i}.img">
          <button type="button" class="edit-del" data-del-look="${i}" aria-label="Прибрати роботу">×</button>
          <img src="${l.img}" alt="${l.name}" />
          <span data-edit="looks.items.${i}.name">${l.name}</span>
        </article>`;
        })
        .join("") + `<button type="button" class="edit-plus" data-add="look">+ Робота</button>`;
  }

  fillLooks.active = "Усі";
  window.paintLooks = paint;
  if (!fillLooks.bound) {
    fillLooks.bound = true;
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tag]");
      if (!btn) return;
      fillLooks.active = btn.dataset.tag;
      paint();
    });
  }

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
  if (!total) return;
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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value != null && value !== "") el.textContent = value;
}

function applyLanding(data) {
  const studio = data.studio || {};
  const hero = data.hero || {};
  const team = data.team || {};
  const price = data.price || {};
  const looks = data.looks || {};
  const book = data.book || {};
  document.querySelectorAll("#brandName").forEach((el) => {
    el.textContent = studio.brand || "Lissa Nails";
  });
  setText("heroEyebrow", hero.eyebrow);
  setText("heroTitle", hero.title);
  setText("heroLede", hero.lede);
  (hero.facts || []).forEach((fact, i) => {
    setText("fact" + i + "Label", fact.label);
    setText("fact" + i + "Value", fact.value);
  });
  const track = document.getElementById("showcaseTrack");
  if (track && (data.showcase || []).length) {
    track.innerHTML = data.showcase
      .map(
        (shot, i) => `<figure class="shot">
          <img src="${shot.img}" alt="${shot.name || ""}" data-edit-img="showcase.${i}.img" />
          <figcaption data-edit="showcase.${i}.name">${shot.name || ""}</figcaption>
        </figure>`
      )
      .join("");
  }
  setText("teamEyebrow", team.eyebrow);
  setText("teamTitle", team.title);
  const people = document.getElementById("mastersList");
  if (people) {
    people.innerHTML = (data.masters || [])
      .map(
        (m, i) => `<article class="person">
          <button type="button" class="edit-del" data-del-master="${i}" aria-label="Прибрати майстра">×</button>
          <img class="avatar-img" src="${m.img}" alt="${m.label || m.id}" data-edit-img="masters.${i}.img" />
          <h3 data-edit="masters.${i}.label">${m.label || m.id}</h3>
          <p data-edit="masters.${i}.bio">${m.bio || ""}</p>
        </article>`
      )
      .join("");
  }
  setText("priceEyebrow", price.eyebrow);
  setText("priceHeading", price.title);
  setText("looksEyebrow", looks.eyebrow);
  setText("looksTitle", looks.title);
  setText("looksLede", looks.lede);
  const looksInsta = document.getElementById("looksInsta");
  if (looksInsta && studio.instagram) {
    looksInsta.href = studio.instagram;
    looksInsta.textContent = studio.instagram_name || looksInsta.textContent;
  }
  setText("bookEyebrow", book.eyebrow);
  setText("bookTitle", book.title);
  setText("bookLede", book.lede);
  setText("footBrand", studio.brand);
  setText("footHours", studio.hours);
  setText("footPhone", studio.phone);
  setText("footAddr", studio.address);
  setText("footAddrNote", studio.address_note);
  const footInsta = document.getElementById("footInsta");
  if (footInsta && studio.instagram) {
    footInsta.href = studio.instagram;
    footInsta.textContent = studio.instagram_name || footInsta.textContent;
  }
  const ig = document.getElementById("igLink");
  if (ig && studio.instagram) ig.href = studio.instagram;
  const chips = document.getElementById("footChips");
  if (chips && (studio.chips || []).length) {
    chips.innerHTML = studio.chips.map((c, i) => `<span data-edit="studio.chips.${i}">${c}</span>`).join("");
  }
  const lat = studio.map_lat;
  const lng = studio.map_lng;
  if (lat && lng) {
    const route = document.getElementById("footRoute");
    const map = document.getElementById("footMap");
    if (route) route.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    if (map) map.src = `https://maps.google.com/maps?q=${lat},${lng}&hl=uk&z=17&output=embed`;
  }
}

async function loadSite() {
  try {
    const res = await fetch("/api/content", { cache: "no-store" });
    const data = await res.json();
    const pack = data.content || {};
    window.SITE_CONTENT = pack;
    applyLanding(pack);
    PRICE = {
      title: pack.price && pack.price.title,
      masters: (pack.masters || []).map((m) => ({ id: m.id, label: m.label || m.id })),
      sections: (pack.price && pack.price.sections) || [],
    };
    LOOKS = (pack.looks && pack.looks.items) || [];
  } catch (_) {
    /* keep fallbacks */
  }
  fillPrice();
  fillLooks();
  loadConfig();
  setupShowcase();
  setupFooterReveal();
}

window.refreshSiteFromContent = function () {
  const pack = window.SITE_CONTENT || {};
  applyLanding(pack);
  PRICE = {
    title: pack.price && pack.price.title,
    masters: (pack.masters || []).map((m) => ({ id: m.id, label: m.label || m.id })),
    sections: (pack.price && pack.price.sections) || [],
  };
  LOOKS = (pack.looks && pack.looks.items) || [];
  if (typeof window.paintPrice === "function") window.paintPrice();
  if (typeof window.paintLooks === "function") window.paintLooks();
};

loadSite();
