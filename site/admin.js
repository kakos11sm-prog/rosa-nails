let content = null;
let tab = "site";

const $ = (id) => document.getElementById(id);

function showError(id, text) {
  const el = $(id);
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function val(el, fallback = "") {
  return el && "value" in el ? el.value : fallback;
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "не вийшло");
  return data;
}

async function upload(file) {
  const body = new FormData();
  body.append("file", file);
  const data = await api("/api/admin/upload", { method: "POST", body });
  return data.url;
}

function photoBox(src, key) {
  return `<div class="admin-photo" data-photo="${esc(key)}">
    <img src="${esc(src || "")}" alt="" />
    <label>Змінити фото<input type="file" accept="image/jpeg,image/png,image/webp" /></label>
  </div>`;
}

function render() {
  const box = $("adminMain");
  if (!content || !box) return;
  const s = content.studio || {};
  const h = content.hero || {};
  const facts = h.facts || [];
  const team = content.team || {};
  const price = content.price || {};
  const looks = content.looks || {};
  const book = content.book || {};

  if (tab === "site") {
    box.innerHTML = `
      <section class="admin-card">
        <h2>Головний екран</h2>
        <label>Рядок зверху<input data-k="hero.eyebrow" value="${esc(h.eyebrow)}" /></label>
        <label>Заголовок<textarea data-k="hero.title">${esc(h.title)}</textarea></label>
        <label>Текст під заголовком<textarea data-k="hero.lede">${esc(h.lede)}</textarea></label>
        <div class="admin-row">
          ${(facts[0] ? `<label>${esc(facts[0].label)}<input data-k="hero.facts.0.value" value="${esc(facts[0].value)}" /></label>` : "")}
          ${(facts[1] ? `<label>${esc(facts[1].label)}<input data-k="hero.facts.1.value" value="${esc(facts[1].value)}" /></label>` : "")}
          ${(facts[2] ? `<label>${esc(facts[2].label)}<input data-k="hero.facts.2.value" value="${esc(facts[2].value)}" /></label>` : "")}
        </div>
      </section>
      <section class="admin-card">
        <h2>Фото зверху (карусель)</h2>
        ${(content.showcase || [])
          .map(
            (shot, i) => `<div class="admin-grid" data-shot="${i}">
              ${photoBox(shot.img, `showcase.${i}.img`)}
              <label>Підпис<input data-k="showcase.${i}.name" value="${esc(shot.name)}" /></label>
              <div class="admin-actions"><button type="button" data-del-shot="${i}">Прибрати</button></div>
            </div>`
          )
          .join("")}
        <button class="admin-add" type="button" data-add-shot="1">+ Додати фото</button>
      </section>
      <section class="admin-card">
        <h2>Підписи розділів</h2>
        <label>Команда, маленький рядок<input data-k="team.eyebrow" value="${esc(team.eyebrow)}" /></label>
        <label>Команда, заголовок<input data-k="team.title" value="${esc(team.title)}" /></label>
        <label>Прайс, маленький рядок<input data-k="price.eyebrow" value="${esc(price.eyebrow)}" /></label>
        <label>Прайс, заголовок<input data-k="price.title" value="${esc(price.title)}" /></label>
        <label>Роботи, маленький рядок<input data-k="looks.eyebrow" value="${esc(looks.eyebrow)}" /></label>
        <label>Роботи, заголовок<input data-k="looks.title" value="${esc(looks.title)}" /></label>
        <label>Роботи, текст<textarea data-k="looks.lede">${esc(looks.lede)}</textarea></label>
        <label>Блок запису, заголовок<input data-k="book.title" value="${esc(book.title)}" /></label>
        <label>Блок запису, текст<textarea data-k="book.lede">${esc(book.lede)}</textarea></label>
      </section>`;
    return;
  }

  if (tab === "masters") {
    box.innerHTML = (content.masters || [])
      .map(
        (m, i) => `<section class="admin-card">
          <h2>${esc(m.label || m.id)}</h2>
          ${photoBox(m.img, `masters.${i}.img`)}
          <label>Ім’я на сайті<input data-k="masters.${i}.label" value="${esc(m.label)}" /></label>
          <label>Коротко про майстра<textarea data-k="masters.${i}.bio">${esc(m.bio)}</textarea></label>
        </section>`
      )
      .join("");
    return;
  }

  if (tab === "price") {
    box.innerHTML = (price.sections || [])
      .map((section, si) => {
        const items = (section.items || [])
          .map((item, ii) => {
            const prices = item.prices || {};
            return `<div class="admin-card" data-item="${si}-${ii}">
              <h3>${esc(item.name) || "Послуга"}</h3>
              ${photoBox(item.img, `price.sections.${si}.items.${ii}.img`)}
              <label>Назва<input data-k="price.sections.${si}.items.${ii}.name" value="${esc(item.name)}" /></label>
              <label>Опис<textarea data-k="price.sections.${si}.items.${ii}.note">${esc(item.note)}</textarea></label>
              <div class="admin-row">
                <label>Хвилин<input data-k="price.sections.${si}.items.${ii}.mins" value="${esc(item.mins || 90)}" /></label>
                <label>Ціна Аля<input data-k="price.sections.${si}.items.${ii}.prices.Аля" value="${esc(prices["Аля"] ?? "")}" /></label>
                <label>Ціна Єлизавета<input data-k="price.sections.${si}.items.${ii}.prices.Єлизавета" value="${esc(prices["Єлизавета"] ?? "")}" /></label>
              </div>
              <div class="admin-actions"><button type="button" data-del-item="${si}:${ii}">Прибрати послугу</button></div>
            </div>`;
          })
          .join("");
        return `<section class="admin-card">
          <h2>Розділ</h2>
          <label>Назва розділу<input data-k="price.sections.${si}.title" value="${esc(section.title)}" /></label>
          ${items}
          <div class="admin-actions">
            <button class="admin-add" type="button" data-add-item="${si}">+ Послуга</button>
            <button type="button" data-del-section="${si}">Прибрати розділ</button>
          </div>
        </section>`;
      })
      .join("") + `<button class="admin-add" type="button" data-add-section="1">+ Новий розділ прайсу</button>`;
    return;
  }

  if (tab === "looks") {
    box.innerHTML =
      (looks.items || [])
        .map(
          (item, i) => `<section class="admin-card">
            ${photoBox(item.img, `looks.items.${i}.img`)}
            <label>Назва<input data-k="looks.items.${i}.name" value="${esc(item.name)}" /></label>
            <label>Категорія<input data-k="looks.items.${i}.tag" value="${esc(item.tag)}" /></label>
            <div class="admin-actions"><button type="button" data-del-look="${i}">Прибрати</button></div>
          </section>`
        )
        .join("") + `<button class="admin-add" type="button" data-add-look="1">+ Додати роботу</button>`;
    return;
  }

  box.innerHTML = `
    <section class="admin-card">
      <h2>Контакти і адреса</h2>
      <label>Назва студії<input data-k="studio.brand" value="${esc(s.brand)}" /></label>
      <label>Телефон<input data-k="studio.phone" value="${esc(s.phone)}" /></label>
      <label>Instagram, посилання<input data-k="studio.instagram" value="${esc(s.instagram)}" /></label>
      <label>Instagram, як написано<input data-k="studio.instagram_name" value="${esc(s.instagram_name)}" /></label>
      <label>Графік<input data-k="studio.hours" value="${esc(s.hours)}" /></label>
      <label>Адреса<input data-k="studio.address" value="${esc(s.address)}" /></label>
      <label>Під адресою<input data-k="studio.address_note" value="${esc(s.address_note)}" /></label>
      <label>Підказки через кому<input data-k="studio.chips" value="${esc((s.chips || []).join(", "))}" /></label>
      <div class="admin-row">
        <label>Широта карти<input data-k="studio.map_lat" value="${esc(s.map_lat)}" /></label>
        <label>Довгота карти<input data-k="studio.map_lng" value="${esc(s.map_lng)}" /></label>
      </div>
    </section>`;
}

function setPath(path, value) {
  const parts = path.split(".");
  let cur = content;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cur[key] == null) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[key];
  }
  const last = parts[parts.length - 1];
  const key = /^\d+$/.test(last) ? Number(last) : last;
  cur[key] = value;
}

function readFields() {
  document.querySelectorAll("[data-k]").forEach((el) => {
    let value = el.value;
    if (el.dataset.k === "studio.chips") {
      value = value.split(",").map((x) => x.trim()).filter(Boolean);
    } else if (el.dataset.k.endsWith(".mins")) {
      value = Number(value) || 90;
    } else if (el.dataset.k.includes(".prices.")) {
      value = /^\d+(\.\d+)?$/.test(String(value).trim()) ? Number(value) : value;
    }
    setPath(el.dataset.k, value);
  });
}

function openDesk() {
  $("loginBox").hidden = true;
  $("desk").hidden = false;
  render();
}

async function boot() {
  try {
    const me = await api("/api/admin/me");
    if (me.in) {
      const data = await api("/api/content");
      content = data.content || {};
      openDesk();
    }
  } catch (err) {
    showError("loginError", err.message);
  }
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("loginError", "");
  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: e.target.password.value }),
    });
    const data = await api("/api/content");
    content = data.content || {};
    openDesk();
  } catch (err) {
    showError("loginError", err.message);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  location.reload();
});

$("adminNav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  readFields();
  tab = btn.dataset.tab;
  $("adminNav").querySelectorAll("button").forEach((el) => el.classList.toggle("is-on", el === btn));
  render();
});

$("adminMain").addEventListener("change", async (e) => {
  const file = e.target.closest("input[type=file]");
  if (!file || !file.files[0]) return;
  const box = file.closest("[data-photo]");
  try {
    $("saveNote").textContent = "Завантажую фото…";
    const url = await upload(file.files[0]);
    setPath(box.dataset.photo, url);
    const img = box.querySelector("img");
    if (img) img.src = url;
    $("saveNote").textContent = "Фото підставлено. Натисни «Зберегти на сайті».";
  } catch (err) {
    $("saveNote").textContent = err.message;
  }
});

$("adminMain").addEventListener("click", (e) => {
  const addShot = e.target.closest("[data-add-shot]");
  const delShot = e.target.closest("[data-del-shot]");
  const addItem = e.target.closest("[data-add-item]");
  const delItem = e.target.closest("[data-del-item]");
  const addSection = e.target.closest("[data-add-section]");
  const delSection = e.target.closest("[data-del-section]");
  const addLook = e.target.closest("[data-add-look]");
  const delLook = e.target.closest("[data-del-look]");
  if (!addShot && !delShot && !addItem && !delItem && !addSection && !delSection && !addLook && !delLook) return;
  readFields();
  if (addShot) {
    content.showcase = content.showcase || [];
    content.showcase.push({ img: "/static/img/hero.png", name: "Нова робота" });
  }
  if (delShot) content.showcase.splice(Number(delShot.dataset.delShot), 1);
  if (addItem) {
    const si = Number(addItem.dataset.addItem);
    const section = content.price.sections[si];
    section.items = section.items || [];
    section.items.push({
      name: "Нова послуга",
      note: "",
      img: "/static/img/look-nude.png",
      mins: 90,
      prices: { Аля: 0, Єлизавета: 0 },
    });
  }
  if (delItem) {
    const [si, ii] = delItem.dataset.delItem.split(":").map(Number);
    content.price.sections[si].items.splice(ii, 1);
  }
  if (addSection) {
    content.price.sections = content.price.sections || [];
    content.price.sections.push({ title: "Новий розділ", items: [] });
  }
  if (delSection) content.price.sections.splice(Number(delSection.dataset.delSection), 1);
  if (addLook) {
    content.looks.items = content.looks.items || [];
    content.looks.items.push({ name: "Нова робота", img: "/static/img/hero.png", tag: "Нюд" });
  }
  if (delLook) content.looks.items.splice(Number(delLook.dataset.delLook), 1);
  render();
});

$("saveBtn").addEventListener("click", async () => {
  readFields();
  try {
    $("saveNote").textContent = "Зберігаю…";
    await api("/api/admin/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    $("saveNote").textContent = "Готово. Онови звичайну сторінку сайту.";
  } catch (err) {
    $("saveNote").textContent = err.message;
  }
});

boot();
