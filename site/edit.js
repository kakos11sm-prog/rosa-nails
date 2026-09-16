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
  setPath(window.SITE_CONTENT, path, parseValue(path, el.textContent));
  markDirty();
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
    <p id="editNote">Затисни або натисни на текст чи фото — і міняй.</p>
    <button class="btn btn-sm" type="button" id="editSave">Зберегти</button>
    <button class="btn btn-sm btn-ghost" type="button" id="editOut">Вийти</button>
  `;
  document.body.appendChild(bar);
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

function onEditPointer(e) {
  if (!editing) return;
  const text = e.target.closest("[data-edit]");
  const img = e.target.closest("[data-edit-img]");
  if (!img && !text) return;
  if (e.target.closest(".edit-bar, .edit-login, .price-switch, .showcase-bar, .look-filters")) return;
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
      if (e.target.closest(".price-switch, .showcase-bar, .look-filters")) return;
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
