/* ============================================================
   Santi Universe — custom scripts (theme toggle, etc.)
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     LEADS — paste your n8n (or any) webhook URL between the quotes
     to receive contact-form + newsletter submissions as JSON.
     e.g. "https://your-n8n.app/webhook/santi-leads"
     ============================================================ */
  var SANTI_LEAD_WEBHOOK = window.SANTI_LEAD_WEBHOOK || "https://n8n.santi.co.za/webhook/santi-leads";
  window.SANTI_LEAD_WEBHOOK = SANTI_LEAD_WEBHOOK; // shared with aeo.js

  var STORAGE_KEY = "santi-theme";

  function val(id) { var el = document.getElementById(id); return el ? (el.value || "").trim() : ""; }

  /* ---- Shared "is this real?" validators (also used by aeo.js) ---- */
  var FAKE_WORDS = ["test", "example", "fake", "demo", "sample", "asdf", "none", "noemail", "nomail", "xxx", "abc", "qwerty"];
  var DISPOSABLE = ["mailinator", "yopmail", "guerrillamail", "tempmail", "temp-mail", "10minutemail", "trashmail",
    "sharklasers", "getnada", "dispostable", "maildrop", "fakeinbox", "throwaway", "guerrilla"];

  function validateEmail(v) {
    v = String(v || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, msg: "Please enter a valid email address." };
    var parts = v.split("@"), local = parts[0], domain = parts[1];
    var labels = domain.split("."), sld = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    if (FAKE_WORDS.indexOf(local) > -1 || FAKE_WORDS.indexOf(sld) > -1)
      return { ok: false, msg: "Please use your real email address — that one looks like a placeholder." };
    for (var i = 0; i < DISPOSABLE.length; i++)
      if (domain.indexOf(DISPOSABLE[i]) > -1) return { ok: false, msg: "Please use a permanent (non-disposable) email address." };
    return { ok: true, value: v };
  }

  // South-African phone validation + obvious-fake detection. `required`=false allows empty.
  function validatePhone(v, required) {
    var raw = String(v || "").trim();
    if (!raw) return required ? { ok: false, msg: "Please enter your phone number." } : { ok: true, value: "" };
    var d = raw.replace(/[^\d+]/g, "");
    if (d.indexOf("+27") === 0) d = "0" + d.slice(3);
    else if (d.indexOf("0027") === 0) d = "0" + d.slice(4);
    else if (d.indexOf("27") === 0 && d.length === 11) d = "0" + d.slice(2);
    d = d.replace(/\D/g, "");
    if (!/^0\d{9}$/.test(d)) return { ok: false, msg: "Please enter a valid 10-digit South African number (e.g. 071 234 5678)." };
    var bad =
      /^(\d)\1{9}$/.test(d) ||                         // all same digit
      new Set(d.split("")).size <= 2 ||               // 1–2 distinct digits
      /(\d)\1{5,}/.test(d) ||                          // 6+ of the same in a row (e.g. 0740000000)
      "01234567890".indexOf(d) > -1 ||                // ascending run
      "09876543210".indexOf(d) > -1;                  // descending run
    if (bad) return { ok: false, msg: "That phone number doesn't look real — please double-check it." };
    return { ok: true, value: d };
  }

  window.SantiValidate = { email: validateEmail, phone: validatePhone };

  function sendLead(data, opts) {
    opts = opts || {};
    var msgEl = opts.msgEl, btn = opts.btn, form = opts.form;
    function show(text, cls) {
      if (!msgEl) return;
      msgEl.style.display = "block";
      msgEl.className = (opts.msgBaseClass || "") + " " + cls;
      msgEl.textContent = text;
    }
    if (!SANTI_LEAD_WEBHOOK) {
      // Not configured yet — fail gracefully to email rather than lose the lead
      show("Almost there! Please email us at santi@santi.co.za and we'll respond fast.", "err");
      return;
    }
    if (btn) btn.disabled = true;
    show("Sending…", "");
    fetch(SANTI_LEAD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (r) { if (!r.ok) throw new Error("bad status"); return r; })
      .then(function () {
        show(opts.successText || "Thank you! We'll be in touch shortly.", "ok");
        if (form) form.reset();
      })
      .catch(function () {
        show("Something went wrong. Please email santi@santi.co.za instead.", "err");
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function currentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  function applyTheme(theme) {
    var isDark = theme !== "light";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    try { localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light"); } catch (e) {}
  }

  /* ---- Location-aware About line (only runs with consent) ---- */
  function runGeoPersonalisation() {
    var geo = document.getElementById("santi-geo");
    if (!geo) return;
    var providers = [
      { url: "https://get.geojs.io/v1/ip/geo.json", map: function (d) { return { cc: d.country_code, city: d.city, country: d.country }; } },
      { url: "https://ipapi.co/json/", map: function (d) { return d.error ? null : { cc: d.country_code, city: d.city, country: d.country_name }; } },
      { url: "https://ipwho.is/", map: function (d) { return d.success === false ? null : { cc: d.country_code, city: d.city, country: d.country }; } }
    ];
    function personalise(g) {
      if (!g || !g.cc) return;
      var msg;
      if (g.cc === "ZA") msg = "Proudly based in South Africa — serving businesses in " + (g.city || "your area") + ", across the country and worldwide.";
      else if (g.cc === "KE") msg = "On the ground in Kenya — partnering with businesses in " + (g.city || "Nairobi") + " and across the region.";
      else msg = "Based in South Africa & Kenya — working with clients in " + (g.country || "your region") + " and worldwide.";
      geo.textContent = msg; // textContent avoids any injection from API values
    }
    (function tryNext(i) {
      if (i >= providers.length) return; // keep the static, SEO-friendly fallback
      fetch(providers[i].url)
        .then(function (r) { return r.json(); })
        .then(function (d) { var g = providers[i].map(d); if (g && g.cc) personalise(g); else tryNext(i + 1); })
        .catch(function () { tryNext(i + 1); });
    })(0);
  }

  /* ---- Cookie consent ---- */
  var CONSENT_KEY = "santi-cookie-consent";
  function getConsent() { try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; } }
  function setConsent(v) { try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {} }

  function initCookieConsent() {
    var choice = getConsent();
    if (choice === "accepted") { runGeoPersonalisation(); return; }
    if (choice === "rejected") { return; }

    var bar = document.createElement("div");
    bar.className = "santi-cookie-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookie consent");
    bar.innerHTML =
      '<p class="cc-text">We use essential cookies to make this site work, plus optional cookies and approximate ' +
      'location to improve your experience. See our <a href="cookies.html">Cookie Policy</a>.</p>' +
      '<div class="cc-actions">' +
      '<button type="button" class="cc-btn cc-decline">Decline</button>' +
      '<button type="button" class="cc-btn cc-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("is-visible"); });

    function close() {
      bar.classList.remove("is-visible");
      setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 500);
    }
    bar.querySelector(".cc-accept").addEventListener("click", function () { setConsent("accepted"); close(); runGeoPersonalisation(); });
    bar.querySelector(".cc-decline").addEventListener("click", function () { setConsent("rejected"); close(); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", function () {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    }

    // Cookie consent + (consent-gated) location personalisation
    initCookieConsent();

    // Contact form -> webhook
    var cForm = document.getElementById("santi-contact-form");
    if (cForm) {
      cForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var cMsg = document.getElementById("santi-contact-msg");
        function fail(t) { if (cMsg) { cMsg.style.display = "block"; cMsg.className = "newsletter-msg err"; cMsg.textContent = t; } }
        var em = validateEmail(val("email"));
        if (!em.ok) { fail(em.msg); return; }
        var ph = validatePhone(val("phone"), false); // optional on contact, but must be real if given
        if (!ph.ok) { fail(ph.msg); return; }
        sendLead(
          {
            type: "contact",
            name: val("full-name"), email: em.value, phone: ph.value,
            subject: val("subject"), message: val("message"),
            page: location.href, submittedAt: new Date().toISOString()
          },
          {
            form: cForm,
            btn: cForm.querySelector("button[type=submit]"),
            msgEl: cMsg,
            msgBaseClass: "newsletter-msg",
            successText: "Thank you! Your message is on its way — we'll reply within one business day."
          }
        );
      });
    }

    // Newsletter -> webhook
    var nForm = document.getElementById("newsletter-form");
    if (nForm) {
      nForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = nForm.querySelector('input[type=email]');
        var nMsg = document.getElementById("newsletter-msg");
        var em = validateEmail(input ? input.value : "");
        if (!em.ok) { if (nMsg) { nMsg.style.display = "block"; nMsg.className = "newsletter-msg err"; nMsg.textContent = em.msg; } return; }
        sendLead(
          { type: "newsletter", email: em.value, page: location.href, submittedAt: new Date().toISOString() },
          {
            form: nForm,
            btn: nForm.querySelector("button[type=submit]"),
            msgEl: document.getElementById("newsletter-msg"),
            msgBaseClass: "newsletter-msg",
            successText: "You're subscribed — thank you!"
          }
        );
      });
    }

    // Portfolio filtering
    var filters = document.getElementById("pf-filters");
    var grid = document.getElementById("pf-grid");
    if (filters && grid) {
      filters.addEventListener("click", function (e) {
        var b = e.target.closest(".santi-pf-filter");
        if (!b) return;
        filters.querySelectorAll(".santi-pf-filter").forEach(function (x) {
          x.classList.toggle("is-active", x === b);
        });
        var f = b.getAttribute("data-filter");
        grid.querySelectorAll(".santi-pf-card").forEach(function (card) {
          var show = f === "all" || card.getAttribute("data-category") === f;
          card.style.display = show ? "" : "none";
        });
      });
    }
  });
})();
