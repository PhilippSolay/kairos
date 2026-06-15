// Shared logic for the auth screens (login / signup / forgot / reset).
// Each page has one <form data-auth="..." data-endpoint="...">.
(function () {
  const form = document.querySelector("form[data-auth]");
  if (!form) return;
  const errEl = document.getElementById("err");
  const params = new URLSearchParams(location.search);
  const mode = form.dataset.auth;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    errEl.classList.remove("ok");
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;

    const payload = {};
    form.querySelectorAll("input[name]").forEach((i) => { payload[i.name] = i.value; });
    if (mode === "reset") payload.token = params.get("token") || "";

    try {
      const res = await fetch(form.dataset.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        errEl.textContent = data.error || "Something went wrong. Please try again.";
        btn.disabled = false;
        return;
      }

      if (mode === "forgot") {
        errEl.classList.add("ok");
        errEl.textContent = "If that email has an account, a reset link is on its way.";
        if (data.devResetLink) {
          const a = document.createElement("a");
          a.href = data.devResetLink; a.className = "dev-link";
          a.textContent = "Dev: open reset link →";
          form.appendChild(a);
        }
        btn.disabled = false;
        return;
      }

      if (mode === "reset") {
        errEl.classList.add("ok");
        errEl.textContent = "Password updated. Redirecting to sign in…";
        setTimeout(() => { location.href = data.redirect || "/login"; }, 900);
        return;
      }

      location.href = data.redirect || "/";
    } catch (err) {
      errEl.textContent = "Network error. Please try again.";
      btn.disabled = false;
    }
  });
})();
