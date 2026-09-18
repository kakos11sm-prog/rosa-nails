const ROSA_BOOKING_KEY = "rosa_booking_id";

function rosaSaveBooking(id) {
  const value = String(id || "").trim();
  if (!value || value === "demo") return;
  try {
    localStorage.setItem(ROSA_BOOKING_KEY, value);
  } catch (_) {
    /* private mode */
  }
}

function rosaReadBooking() {
  try {
    return localStorage.getItem(ROSA_BOOKING_KEY) || "";
  } catch (_) {
    return "";
  }
}

function rosaClearBooking() {
  try {
    localStorage.removeItem(ROSA_BOOKING_KEY);
  } catch (_) {
    /* ignore */
  }
}

function rosaVisitAlive(date, time) {
  if (!date) return false;
  const when = new Date(`${date}T${time || "23:59"}:00`);
  if (Number.isNaN(when.getTime())) {
    return date >= new Date().toISOString().slice(0, 10);
  }
  return Date.now() <= when.getTime() + 3 * 60 * 60 * 1000;
}

function rosaBookingStillOn(data) {
  if (!data) return false;
  if (rosaVisitAlive(data.date, data.time)) return true;
  return (data.offers || []).some((item) => rosaVisitAlive(item.date, item.time));
}

function rosaEsc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rosaVisitItems(data) {
  const bits = [];
  if (data.service) {
    bits.push(data.service + (data.service_price ? ` · ${data.service_price}` : ""));
  }
  if (data.design) {
    bits.push(data.design + (data.design_price ? ` · ${data.design_price}` : ""));
  }
  if (!bits.length) return "";
  return `<p class="visit-bar-items">${bits.map((bit) => `<span>${rosaEsc(bit)}</span>`).join("")}</p>`;
}

function rosaPrettyWhen(date, time, master) {
  let when = date;
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    when = parsed.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  }
  if (time) when += `, ${time}`;
  if (master) when += ` · ${master}`;
  return when;
}

let rosaVisitTimer = 0;
let rosaVisitStamp = "";

function rosaVisitKind(status) {
  if (status === "confirmed") return "ok";
  if (status === "cancelled") return "no";
  if (status === "offered") return "offer";
  return "wait";
}

function rosaVisitHours(data) {
  const slots = (data.slots || []).filter((item) => item && item.kind === "offer");
  const list = slots.length ? slots : data.offers || [];
  const many = new Set(list.map((item) => item.date)).size > 1;
  return list
    .map((item) => {
      if (!item || !item.date || !item.time) return "";
      const when = new Date(`${item.date}T12:00:00`);
      const day = Number.isNaN(when.getTime())
        ? item.date
        : when.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
      const label = many ? `${day} · ${item.time}` : item.time;
      return `<button type="button" class="visit-hour" data-visit-choose="${item.date}|${item.time}">${label}</button>`;
    })
    .join("");
}

function rosaVisitSeal(kind, data) {
  const hours = kind === "offer" ? rosaVisitHours(data) : "";
  return `<div class="visit-seal is-${kind}">
    <svg viewBox="0 0 140 140" fill="none">
      <circle class="seal-halo" cx="70" cy="70" r="62"></circle>
      <circle class="seal-track" cx="70" cy="70" r="50"></circle>
      <circle class="seal-ring" cx="70" cy="70" r="50"></circle>
      <path class="seal-check" d="M44 72.5 L61 89 L98 50"></path>
      <path class="seal-x a" d="M50 50 L90 90"></path>
      <path class="seal-x b" d="M90 50 L50 90"></path>
    </svg>
    <div class="status-dots"><i></i><i></i><i></i></div>
    ${hours ? `<div class="visit-hours">${hours}</div>` : ""}
  </div>`;
}

function rosaBindVisitBar(bar) {
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = "1";
  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-visit-choose]");
    if (!btn || bar.dataset.busy) return;
    const id = rosaReadBooking();
    const [date, time] = String(btn.dataset.visitChoose || "").split("|");
    if (!id || !date || !time) return;
    bar.dataset.busy = "1";
    btn.disabled = true;
    try {
      const res = await fetch("/api/status/" + encodeURIComponent(id) + "/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time }),
      });
      const pack = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(pack.error || "не вийшло");
      rosaVisitStamp = "";
      await rosaShowVisitBar();
    } catch (_) {
      btn.disabled = false;
    } finally {
      delete bar.dataset.busy;
    }
  });
}

async function rosaShowVisitBar() {
  const bar = document.getElementById("visitBar");
  if (!bar) return;
  rosaBindVisitBar(bar);
  const id = rosaReadBooking();
  if (!id) return;
  try {
    const res = await fetch("/api/status/" + encodeURIComponent(id), { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      rosaClearBooking();
      bar.hidden = true;
      return;
    }
    if (!rosaBookingStillOn(data)) {
      rosaClearBooking();
      bar.hidden = true;
      return;
    }
    const status = data.status || "pending";
    const stamp = [status, data.date, data.time, data.service, data.service_price, data.design, data.design_price, JSON.stringify(data.offers || [])].join("|");
    const changed = Boolean(rosaVisitStamp) && rosaVisitStamp !== stamp;
    const same = rosaVisitStamp === stamp;
    rosaVisitStamp = stamp;

    if (!same) {
      const kind = rosaVisitKind(status);
      const label =
        status === "confirmed"
          ? "Запис підтверджено"
          : status === "cancelled"
            ? "Запис скасовано"
            : status === "offered"
              ? "Студія пропонує інший час"
              : "Заявка ще на підтвердженні";
      const when =
        status === "offered"
          ? "Оберіть зручну годину в кружечку"
          : rosaPrettyWhen(data.date, data.time, data.master);
      const cta =
        status === "cancelled"
          ? `<a class="btn btn-sm" href="/book">Записатись знову</a>`
          : status === "offered"
            ? ""
            : `<a class="btn btn-sm" href="/status/${data.id}">Відкрити статус</a>`;

      bar.hidden = false;
      bar.classList.toggle("is-ok", kind === "ok");
      bar.classList.toggle("is-no", kind === "no");
      bar.classList.toggle("is-offer", kind === "offer");
      bar.classList.toggle("is-wait", kind === "wait");
      bar.innerHTML = `
        <div class="visit-main">
          ${rosaVisitSeal(kind, data)}
          <div class="visit-copy">
            <p class="visit-bar-kicker">${label}</p>
            <p class="visit-bar-when">${when}</p>
            ${rosaVisitItems(data)}
          </div>
        </div>
        ${cta}
      `;
      const seal = bar.querySelector(".visit-seal");
      if (seal && kind !== "wait") {
        void seal.offsetWidth;
        seal.classList.add("is-reveal");
      }
      if (changed) {
        bar.classList.remove("is-pulse");
        void bar.offsetWidth;
        bar.classList.add("is-pulse");
      }
    }

    const live = status === "pending" || status === "new" || status === "offered";
    window.clearTimeout(rosaVisitTimer);
    if (live) rosaVisitTimer = window.setTimeout(rosaShowVisitBar, 6000);
  } catch (_) {
    window.clearTimeout(rosaVisitTimer);
    rosaVisitTimer = window.setTimeout(rosaShowVisitBar, 12000);
  }
}

function rosaSlimHeader() {
  const top = document.querySelector("header.top");
  if (!top) return;
  let slim = false;
  let raf = 0;
  let busy = false;
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lockMs = quiet ? 0 : 320;

  const apply = (next) => {
    if (next === slim) return;
    slim = next;
    top.classList.toggle("is-slim", slim);
    if (!lockMs) return;
    busy = true;
    window.setTimeout(() => {
      busy = false;
      decide();
    }, lockMs);
  };

  const decide = () => {
    if (busy) return;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    if (!slim && y > 64) apply(true);
    else if (slim && y < 12) apply(false);
  };

  const onScroll = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      decide();
    });
  };

  decide();
  window.addEventListener("scroll", onScroll, { passive: true });
}

rosaShowVisitBar();
rosaSlimHeader();
