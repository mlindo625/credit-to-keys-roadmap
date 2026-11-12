(function () {
  "use strict";

  var DICT = window.RM_I18N;
  var CONFIG = window.RM_CONFIG || {};
  var EMAIL = "mlindo@theresponsiveway.com";

  var ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  };

  function lookup(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }

  function getLang() {
    try {
      var saved = window.localStorage.getItem("rm-lang");
      if (saved === "en" || saved === "es") return saved;
    } catch (e) { /* storage blocked */ }
    return "en";
  }

  var lang = getLang();

  function applyLang() {
    var t = DICT[lang];
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var value = lookup(t, el.getAttribute("data-i18n"));
      if (typeof value === "string") el.textContent = value;
    });
    document.querySelectorAll("[data-i18n-label]").forEach(function (el) {
      var value = lookup(t, el.getAttribute("data-i18n-label"));
      if (typeof value === "string") el.setAttribute("aria-label", value);
    });
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang") === lang));
    });
    var book = document.getElementById("book-email");
    if (book) book.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(t.thanks.book);
    // Clear any validation messages so they do not stay in the old language.
    document.querySelectorAll("[data-error]").forEach(function (el) { el.textContent = ""; });
  }

  document.querySelectorAll("[data-icon]").forEach(function (el) {
    var small = el.hasAttribute("data-small") ? " icon-sm" : "";
    el.outerHTML = '<svg class="icon' + small + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[el.getAttribute("data-icon")] || "") + "</svg>";
  });

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      lang = btn.getAttribute("data-lang");
      try { window.localStorage.setItem("rm-lang", lang); } catch (e) { /* storage blocked */ }
      applyLang();
    });
  });

  applyLang();

  var form = document.getElementById("get-guide");
  if (!form) return;

  function setError(key, message) {
    var el = form.querySelector('[data-error="' + key + '"]');
    if (el) el.textContent = message || "";
    var input = form.elements[key];
    if (input) input.setAttribute("aria-invalid", String(!!message));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = DICT[lang];
    var name = form.elements.name.value.trim();
    var email = form.elements.email.value.trim();
    var phone = form.elements.phone.value.trim();
    var digits = phone.replace(/\D/g, "");

    var bad = {
      name: name.length < 2 || name.length > 100,
      email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 255,
      phone: !/^[0-9+().\-\s]+$/.test(phone) || digits.length < 10 || digits.length > 15,
    };
    setError("name", bad.name ? t.form.errors.name : "");
    setError("email", bad.email ? t.form.errors.email : "");
    setError("phone", bad.phone ? t.form.errors.phone : "");
    setError("generic", "");
    if (bad.name || bad.email || bad.phone) return;

    if (!CONFIG.signupEndpoint) {
      console.warn("Signup endpoint is not set. Add the Apps Script URL in assets/config.js.");
      setError("generic", t.form.errors.generic);
      return;
    }

    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = t.form.sending;

    // text/plain keeps this a "simple" request, which Apps Script web apps accept cross-origin.
    fetch(CONFIG.signupEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        name: name,
        email: email,
        phone: phone,
        challenge: form.elements.challenge.value,
        language: lang,
        website: form.elements.website.value, // spam trap, real people leave it empty
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "rejected");
        window.location.href = "thank-you.html";
      })
      .catch(function (err) {
        console.error("Signup failed:", err);
        button.disabled = false;
        button.textContent = DICT[lang].form.submit;
        setError("generic", DICT[lang].form.errors.generic);
      });
  });
})();
