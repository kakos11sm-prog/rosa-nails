const $ = (id) => document.getElementById(id);

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "не вийшло");
  return data;
}

(async () => {
  try {
    const me = await api("/api/admin/me");
    if (me.in) location.replace("/");
  } catch (_) {
    /* stay on login */
  }
})();

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("loginError");
  err.hidden = true;
  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: e.target.password.value }),
    });
    location.replace("/");
  } catch (ex) {
    err.hidden = false;
    err.textContent = ex.message;
  }
});
