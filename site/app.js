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

function ensureLookFilters(pack) {
  pack.looks = pack.looks || { items: [] };
  pack.looks.items = pack.looks.items || [];
  if (!Array.isArray(pack.looks.filters) || !pack.looks.filters.length) {
    pack.looks.filters = [...new Set(pack.looks.items.map((item) => item.tag).filter(Boolean))];
  }
  return pack.looks.filters;
}

function fillLooks() {
  const grid = document.getElementById("looksGrid");
  const filters = document.getElementById("lookFilters");
  if (!grid || !filters) return;

  function paint() {
    const pack = window.SITE_CONTENT || {};
    const names = ensureLookFilters(pack);
    const tags = ["Усі", ...names];
    const active = fillLooks.active || "Усі";
    filters.innerHTML =
      tags
        .map((t, i) => {
          if (t === "Усі") {
            return `<button type="button" class="chip-btn${t === active ? " is-on" : ""}" data-tag="${t}">${t}</button>`;
          }
          const fi = i - 1;
          return `<button type="button" class="chip-btn${t === active ? " is-on" : ""}" data-tag="${t}">
            <span data-edit="looks.filters.${fi}">${t}</span>
            <span class="edit-del" data-del-filter="${fi}" role="button" aria-label="Прибрати категорію">×</span>
          </button>`;
        })
        .join("") + `<button type="button" class="edit-plus" data-add="filter">+ Категорія</button>`;
    const rows = LOOKS.map((l, i) => ({ l, i })).filter((row) => active === "Усі" || row.l.tag === active);
    grid.innerHTML =
      rows
        .map(({ l, i }) => {
          const extra = l.featured && active === "Усі" ? " look-wide" : l.wide && active === "Усі" ? " look-span" : "";
          return `<article class="look${extra}" style="--d:${0.04 + i * 0.05}s" data-edit-img="looks.items.${i}.img">
          <button type="button" class="edit-del" data-del-look="${i}" aria-label="Прибрати роботу">×</button>
          <img src="${l.img}" alt="${l.name}" />
          <span class="look-tag" data-edit="looks.items.${i}.tag">${l.tag || ""}</span>
          <span class="look-name" data-edit="looks.items.${i}.name">${l.name}</span>
        </article>`;
        })
        .join("") + `<button type="button" class="edit-plus" data-add="look">+ Робота</button>`;
  }

  fillLooks.active = "Усі";
  window.paintLooks = paint;
  if (!fillLooks.bound) {
    fillLooks.bound = true;
    filters.addEventListener("click", (e) => {
      if (e.target.closest("[data-add], .edit-del")) return;
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
  if (!track || !dots || !stage) return;

  let index = 0;
  let timer = 0;

  function shots() {
    return [...track.children].filter((el) => el.classList.contains("shot"));
  }

  function maxIndex() {
    return Math.max(0, shots().length - visibleShots());
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
    const card = shots()[0];
    if (!card) {
      track.style.transform = "";
      return;
    }
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
    if (document.body.classList.contains("is-edit")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (shots().length <= visibleShots()) return;
    timer = window.setInterval(() => step(1), 3800);
  }

  window.paintShowcase = function () {
    if (index > maxIndex()) index = maxIndex();
    renderDots();
    go(index);
    play();
  };

  window.pauseShowcase = function () {
    window.clearInterval(timer);
  };

  if (!setupShowcase.bound) {
    setupShowcase.bound = true;
    const prev = document.getElementById("showcasePrev");
    const next = document.getElementById("showcaseNext");
    if (prev) {
      prev.addEventListener("click", () => {
        step(-1);
        play();
      });
    }
    if (next) {
      next.addEventListener("click", () => {
        step(1);
        play();
      });
    }
    stage.addEventListener("mouseenter", () => window.clearInterval(timer));
    stage.addEventListener("mouseleave", play);
    window.addEventListener("resize", () => {
      if (index > maxIndex()) index = maxIndex();
      renderDots();
      go(index);
    });
  }

  window.paintShowcase();
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

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paintWhy(hero) {
  const box = document.getElementById("heroWhy");
  if (!box) return;
  const reasons = hero.reasons || [];
  const tabs = reasons
    .map(
      (r, i) =>
        `<button type="button" class="${i === 0 ? "is-on" : ""}" data-why="${i}" aria-label="${esc(r.title)}">${esc(r.icon)}</button>`
    )
    .join("");
  const slides = reasons
    .map(
      (r, i) => `<article class="why-card">
        <button type="button" class="edit-del" data-del-reason="${i}" aria-label="Прибрати">×</button>
        <span class="why-ico" data-edit="hero.reasons.${i}.icon">${esc(r.icon)}</span>
        <h3 data-edit="hero.reasons.${i}.title">${esc(r.title)}</h3>
        <p data-edit="hero.reasons.${i}.text">${esc(r.text)}</p>
      </article>`
    )
    .join("");
  box.innerHTML = `<div class="why-emoji">${tabs}</div>
    <div class="why-window"><div class="why-track">${slides}</div></div>
    <button type="button" class="edit-plus" data-add="reason">+ Причина</button>`;
}

function setupWhy() {
  const box = document.getElementById("heroWhy");
  if (!box) return;
  let index = 0;
  let timer = 0;

  function cards() {
    return [...box.querySelectorAll(".why-card")];
  }
  function emojis() {
    return [...box.querySelectorAll(".why-emoji button")];
  }

  function go(next) {
    const list = cards();
    if (!list.length) return;
    index = ((next % list.length) + list.length) % list.length;
    const track = box.querySelector(".why-track");
    const card = list[0];
    if (track && card) {
      track.style.transform = `translateX(-${index * card.getBoundingClientRect().width}px)`;
    }
    emojis().forEach((btn, i) => btn.classList.toggle("is-on", i === index));
  }

  function play() {
    window.clearInterval(timer);
    if (document.body.classList.contains("is-edit")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (cards().length < 2) return;
    timer = window.setInterval(() => go(index + 1), 3800);
  }

  window.paintWhySlider = function () {
    if (index >= cards().length) index = 0;
    go(index);
    play();
  };
  window.pauseWhy = function () {
    window.clearInterval(timer);
  };

  if (!setupWhy.bound) {
    setupWhy.bound = true;
    box.addEventListener("click", (e) => {
      const btn = e.target.closest(".why-emoji button");
      if (!btn) return;
      go(Number(btn.dataset.why));
      play();
    });
    box.addEventListener("mouseenter", () => window.clearInterval(timer));
    box.addEventListener("mouseleave", play);
    window.addEventListener("resize", () => go(index));
  }

  window.paintWhySlider();
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
  paintWhy(hero);
  setText("showcaseKicker", hero.showcase_kicker || "Роботи студії");
  (hero.facts || []).forEach((fact, i) => {
    setText("fact" + i + "Label", fact.label);
    setText("fact" + i + "Value", fact.value);
  });
  const track = document.getElementById("showcaseTrack");
  if (track) {
    track.innerHTML = (data.showcase || [])
      .map(
        (shot, i) => `<figure class="shot" data-edit-img="showcase.${i}.img">
          <button type="button" class="edit-del" data-del-shot="${i}" aria-label="Прибрати фото">×</button>
          <img src="${shot.img}" alt="${shot.name || ""}" />
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
    ensureLookFilters(pack);
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
  setupWhy();
  setupFooterReveal();
}

window.refreshSiteFromContent = function () {
  const pack = window.SITE_CONTENT || {};
  ensureLookFilters(pack);
  applyLanding(pack);
  PRICE = {
    title: pack.price && pack.price.title,
    masters: (pack.masters || []).map((m) => ({ id: m.id, label: m.label || m.id })),
    sections: (pack.price && pack.price.sections) || [],
  };
  LOOKS = (pack.looks && pack.looks.items) || [];
  if (typeof window.paintPrice === "function") window.paintPrice();
  if (typeof window.paintLooks === "function") window.paintLooks();
  if (typeof window.paintShowcase === "function") window.paintShowcase();
  if (typeof window.paintWhySlider === "function") window.paintWhySlider();
};

loadSite();
