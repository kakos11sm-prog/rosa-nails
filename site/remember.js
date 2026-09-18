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
      return;
    }
    if (!rosaVisitAlive(data.date, data.time)) {
      rosaClearBooking();
      return;
    }
    const label =
      data.status === "confirmed"
        ? "Ваш запис підтверджено"
        : data.status === "cancelled"
          ? "Цей запис скасовано"
          : data.status === "offered"
            ? "Студія пропонує інший час"
            : "Заявка ще на підтвердженні";
    bar.hidden = false;
    bar.classList.toggle("is-ok", data.status === "confirmed");
    bar.classList.toggle("is-no", data.status === "cancelled");
    bar.innerHTML = `
      <div>
        <p class="visit-bar-kicker">${label}</p>
        <p class="visit-bar-when">${rosaPrettyWhen(data.date, data.time, data.master)}</p>
      </div>
      <a class="btn btn-sm" href="/status/${data.id}">Відкрити статус</a>
    `;
  } catch (_) {
    /* offline */
  }
}

function rosaSlimHeader() {
  const top = document.querySelector("header.top");
  if (!top) return;
  let slim = false;
  let raf = 0;
  const paint = () => {
    raf = 0;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    if (!slim && y > 56) slim = true;
    else if (slim && y < 8) slim = false;
    top.classList.toggle("is-slim", slim);
  };
  const onScroll = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(paint);
  };
  paint();
  window.addEventListener("scroll", onScroll, { passive: true });
}

rosaShowVisitBar();
rosaSlimHeader();
