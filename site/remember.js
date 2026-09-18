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

function rosaOfferLine(data) {
  const offers = (data.offers || []).filter((item) => item && item.date && item.time);
  if (!offers.length) return rosaPrettyWhen(data.date, data.time, data.master);
  return offers
    .map((item) => {
      const parsed = new Date(`${item.date}T12:00:00`);
      const day = Number.isNaN(parsed.getTime())
        ? item.date
        : parsed.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
      return `${day}, ${item.time}`;
    })
    .join(" · ");
}

let rosaVisitTimer = 0;
let rosaVisitStamp = "";

async function rosaShowVisitBar() {
  const bar = document.getElementById("visitBar");
  if (!bar) return;
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
    const stamp = [status, data.date, data.time, JSON.stringify(data.offers || [])].join("|");
    const changed = Boolean(rosaVisitStamp) && rosaVisitStamp !== stamp;
    rosaVisitStamp = stamp;

    const label =
      status === "confirmed"
        ? "Запис підтверджено"
        : status === "cancelled"
          ? "Запис скасовано"
          : status === "offered"
            ? "Студія пропонує інший час"
            : "Заявка ще на підтвердженні";
    const when =
      status === "offered" ? rosaOfferLine(data) : rosaPrettyWhen(data.date, data.time, data.master);
    const cta =
      status === "offered"
        ? "Обрати час"
        : status === "cancelled"
          ? "Записатись знову"
          : "Відкрити статус";
    const href = status === "cancelled" ? "/book" : "/status/" + data.id;

    bar.hidden = false;
    bar.classList.toggle("is-ok", status === "confirmed");
    bar.classList.toggle("is-no", status === "cancelled");
    bar.classList.toggle("is-offer", status === "offered");
    bar.classList.toggle("is-wait", status === "pending" || status === "new");
    bar.innerHTML = `
      <div>
        <p class="visit-bar-kicker">${label}</p>
        <p class="visit-bar-when">${when}</p>
      </div>
      <a class="btn btn-sm" href="${href}">${cta}</a>
    `;
    if (changed) {
      bar.classList.remove("is-pulse");
      void bar.offsetWidth;
      bar.classList.add("is-pulse");
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
