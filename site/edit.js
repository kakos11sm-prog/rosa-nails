let editing = false;
let dirty = false;
let fileInput = null;

function setPath(obj, path, value) {
  const parts = String(path).split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cur[key] == null) cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[key];
  }
  const last = parts[parts.length - 1];
  cur[/^\d+$/.test(last) ? Number(last) : last] = value;
}

function markDirty() {
  dirty = true;
  const note = document.getElementById("editNote");
  if (note) note.textContent = "Є зміни — натисни «Зберегти».";
}

function parseValue(path, text) {
  const raw = String(text || "").replace(/\s+грн$/i, "").trim();
  if (path.includes(".prices.") || path.endsWith(".mins")) {
    return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  return raw;
}

function showLogin() {
  let box = document.getElementById("editLogin");
  if (!box) {
    box = document.createElement("div");
    box.id = "editLogin";
    box.className = "edit-login";
    box.innerHTML = `<form class="edit-login-card">
      <p class="eyebrow">Правки сайту</p>
      <h2>Введіть пароль</h2>
      <input type="password" name="password" autocomplete="current-password" required placeholder="Пароль" />
      <p class="form-hint status-error" id="editLoginErr" hidden></p>
      <button class="btn btn-wide" type="submit">Увійти</button>
      <button class="btn-ghost edit-login-close" type="button">Закрити</button>
    </form>`;
    document.body.appendChild(box);
    box.querySelector(".edit-login-close").addEventListener("click", () => {
      box.hidden = true;
    });
    box.addEventListener("click", (e) => {
      if (e.target === box) box.hidden = true;
    });
    box.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("editLoginErr");
      err.hidden = true;
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: e.target.password.value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "не той пароль");
        location.reload();
      } catch (ex) {
        err.hidden = false;
        err.textContent = ex.message;
      }
    });
  }
  box.hidden = false;
  box.querySelector("input").focus();
}

function startTextEdit(el) {
  if (el.isContentEditable) return;
  el.contentEditable = "true";
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function stopTextEdit(el) {
  if (!el.isContentEditable) return;
  el.contentEditable = "false";
  const path = el.getAttribute("data-edit");
  if (!path || !window.SITE_CONTENT) return;
  const neu = parseValue(path, el.textContent);
  let oldFilter = "";
  if (/^looks\.filters\.\d+$/.test(path)) {
    const i = Number(path.split(".")[2]);
    oldFilter = String(((window.SITE_CONTENT.looks || {}).filters || [])[i] || "");
  }
  setPath(window.SITE_CONTENT, path, neu);
  if (oldFilter && neu && oldFilter !== neu) {
    (window.SITE_CONTENT.looks.items || []).forEach((item) => {
      if (item.tag === oldFilter) item.tag = neu;
    });
    if (typeof fillLooks === "function" && fillLooks.active === oldFilter) fillLooks.active = neu;
  }
  if (/^looks\.items\.\d+\.tag$/.test(path) && neu) {
    const list = window.SITE_CONTENT.looks.filters || (window.SITE_CONTENT.looks.filters = []);
    if (!list.includes(neu)) list.push(neu);
  }
  markDirty();
  if (
    (/^masters\.\d+\.label$/.test(path) || /^looks\.filters\.\d+$/.test(path) || /^looks\.items\.\d+\.tag$/.test(path)) &&
    typeof window.refreshSiteFromContent === "function"
  ) {
    window.refreshSiteFromContent();
  }
}

async function startImageEdit(el) {
  if (!fileInput) {
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
  }
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const note = document.getElementById("editNote");
    if (note) note.textContent = "Завантажую фото…";
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "не вийшло завантажити");
      const path = el.getAttribute("data-edit-img");
      const img = el.tagName === "IMG" ? el : el.querySelector("img");
      if (img) img.src = data.url;
      if (path && window.SITE_CONTENT) setPath(window.SITE_CONTENT, path, data.url);
      markDirty();
      if (note) note.textContent = "Фото підставлено. Натисни «Зберегти».";
    } catch (err) {
      if (note) note.textContent = err.message;
    }
  };
  fileInput.click();
}

function bindLongPress(el, fn) {
  let timer = 0;
  const start = (e) => {
    if (e.touches && e.touches.length > 1) return;
    timer = window.setTimeout(() => {
      timer = 0;
      fn(e);
    }, 520);
  };
  const stop = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", stop);
  el.addEventListener("touchmove", stop);
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    start(e);
  });
  el.addEventListener("mouseup", stop);
  el.addEventListener("mouseleave", stop);
}

function enableEditing() {
  if (editing) return;
  editing = true;
  document.body.classList.add("is-edit");
  const bar = document.createElement("div");
  bar.className = "edit-bar";
  bar.innerHTML = `
    <p id="editNote">Клік — текст або фото. Плюсик — додати.</p>
    <div class="edit-bar-acts">
      <button class="btn btn-sm" type="button" id="editSave">Зберегти</button>
      <button class="btn btn-sm btn-ghost" type="button" id="editOut">Вийти</button>
    </div>
  `;
  document.body.appendChild(bar);
  if (typeof window.pauseShowcase === "function") window.pauseShowcase();
  if (typeof window.pauseWhy === "function") window.pauseWhy();
  document.getElementById("editSave").addEventListener("click", async () => {
    const note = document.getElementById("editNote");
    try {
      note.textContent = "Зберігаю…";
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(window.SITE_CONTENT || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "не збереглось");
      dirty = false;
      note.textContent = "Готово. Так і стоїть на сайті.";
    } catch (err) {
      note.textContent = err.message;
    }
  });
  document.getElementById("editOut").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    location.reload();
  });
}

function handleStructure(e) {
  const add = e.target.closest("[data-add], [data-add-item]");
  const del = e.target.closest("[data-del-master], [data-del-section], [data-del-item], [data-del-look], [data-del-shot], [data-del-filter], [data-del-reason]");
  if (!add && !del) return false;
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  const pack = window.SITE_CONTENT;
  if (!pack) return true;
  pack.masters = pack.masters || [];
  pack.price = pack.price || { sections: [] };
  pack.price.sections = pack.price.sections || [];
  pack.looks = pack.looks || { items: [] };
  pack.looks.items = pack.looks.items || [];
  pack.showcase = pack.showcase || [];
  if (add) {
    if (add.dataset.add === "master") {
      const id = "m" + Date.now();
      pack.masters.push({
        id,
        label: "Новий майстер",
        bio: "Натисни і напиши про майстра",
        img: "/static/img/master-alya.png",
      });
      pack.price.sections.forEach((section) => {
        (section.items || []).forEach((item) => {
          item.prices = item.prices || {};
          item.prices[id] = 0;
        });
      });
    }
    if (add.dataset.add === "section") {
      pack.price.sections.push({ title: "Новий розділ", items: [] });
    }
    if (add.dataset.add === "look") {
      const current = typeof fillLooks === "function" ? fillLooks.active : "";
      const tag =
        current && current !== "Усі"
          ? current
          : ((pack.looks.filters || [])[0] || "Нюд");
      pack.looks.items.push({ name: "Нова робота", img: "/static/img/hero.png", tag });
    }
    if (add.dataset.add === "filter") {
      if (typeof ensureLookFilters === "function") ensureLookFilters(pack);
      pack.looks.filters.push("Нова");
      if (typeof fillLooks === "function") fillLooks.active = "Нова";
    }
    if (add.dataset.add === "shot") {
      pack.showcase.push({ name: "Нова робота", img: "/static/img/hero.png" });
    }
    if (add.dataset.add === "reason") {
      pack.hero = pack.hero || {};
      pack.hero.reasons = pack.hero.reasons || [];
      pack.hero.reasons.push({ icon: "🤍", title: "Нова причина", text: "Натисни і напиши текст." });
    }
    if (add.dataset.addItem != null) {
      const si = Number(add.dataset.addItem);
      const prices = {};
      pack.masters.forEach((m) => {
        prices[m.id] = 0;
      });
      const section = pack.price.sections[si];
      if (section) {
        section.items = section.items || [];
        section.items.push({
          name: "Нова послуга",
          note: "Опис",
          img: "/static/img/look-nude.png",
          mins: 90,
          prices,
        });
      }
    }
  }
  if (del) {
    if (del.dataset.delMaster != null) {
      if (pack.masters.length < 2) {
        const note = document.getElementById("editNote");
        if (note) note.textContent = "Має лишитись хоч один майстер.";
        return true;
      }
      const i = Number(del.dataset.delMaster);
      const gone = pack.masters[i];
      pack.masters.splice(i, 1);
      if (gone) {
        pack.price.sections.forEach((section) => {
          (section.items || []).forEach((item) => {
            if (item.prices) delete item.prices[gone.id];
          });
        });
      }
    }
    if (del.dataset.delSection != null) {
      pack.price.sections.splice(Number(del.dataset.delSection), 1);
    }
    if (del.dataset.delItem != null) {
      const [si, ii] = del.dataset.delItem.split(":").map(Number);
      const section = pack.price.sections[si];
      if (section && section.items) section.items.splice(ii, 1);
    }
    if (del.dataset.delLook != null) {
      pack.looks.items.splice(Number(del.dataset.delLook), 1);
    }
    if (del.dataset.delFilter != null) {
      pack.looks.filters = pack.looks.filters || [];
      const i = Number(del.dataset.delFilter);
      const gone = pack.looks.filters[i];
      pack.looks.filters.splice(i, 1);
      if (typeof fillLooks === "function" && fillLooks.active === gone) fillLooks.active = "Усі";
    }
    if (del.dataset.delShot != null) {
      if (pack.showcase.length < 2) {
        const note = document.getElementById("editNote");
        if (note) note.textContent = "Має лишитись хоч одне фото.";
        return true;
      }
      pack.showcase.splice(Number(del.dataset.delShot), 1);
    }
    if (del.dataset.delReason != null) {
      pack.hero = pack.hero || {};
      pack.hero.reasons = pack.hero.reasons || [];
      pack.hero.reasons.splice(Number(del.dataset.delReason), 1);
    }
  }
  markDirty();
  if (typeof window.refreshSiteFromContent === "function") window.refreshSiteFromContent();
  return true;
}

function onEditPointer(e) {
  if (!editing) return;
  const text = e.target.closest("[data-edit]");
  const img = e.target.closest("[data-edit-img]");
  if (!img && !text) return;
  if (e.target.closest(".edit-bar, .edit-login, .price-switch, .showcase-bar, .why-emoji")) return;
  e.preventDefault();
  e.stopPropagation();
  if (text) startTextEdit(text);
  else startImageEdit(img);
}

function bootEdit() {
  const logo = document.querySelector("header.top .logo");
  if (logo) {
    bindLongPress(logo, (e) => {
      e.preventDefault();
      if (!editing) showLogin();
    });
  }
  document.addEventListener(
    "click",
    (e) => {
      if (!editing) return;
      if (e.target.closest(".edit-bar, .edit-login")) return;
      if (handleStructure(e)) return;
      if (e.target.closest(".price-switch, .showcase-bar, .why-emoji")) return;
      const filterLabel = e.target.closest(".look-filters [data-edit]");
      if (filterLabel) {
        const btn = filterLabel.closest("[data-tag]");
        const on = typeof fillLooks === "function" ? fillLooks.active : "Усі";
        if (!btn || btn.dataset.tag !== on) return;
      }
      const hit = e.target.closest("[data-edit], [data-edit-img]");
      if (hit) {
        e.preventDefault();
        e.stopPropagation();
        onEditPointer(e);
        return;
      }
      if (e.target.closest("a[href]")) {
        e.preventDefault();
      }
    },
    true
  );
  document.addEventListener("focusout", (e) => {
    const el = e.target.closest && e.target.closest("[data-edit]");
    if (el) stopTextEdit(el);
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter" && e.target && e.target.getAttribute && e.target.getAttribute("data-edit")) {
        e.preventDefault();
        e.target.blur();
      }
    },
    true
  );
}

async function start() {
  bootEdit();
  try {
    const res = await fetch("/api/admin/me", { cache: "no-store" });
    const me = await res.json();
    if (me && me.in) enableEditing();
  } catch (_) {
    /* visitor */
  }
}

start();
