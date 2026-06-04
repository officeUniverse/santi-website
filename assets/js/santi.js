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

  var STORAGE_KEY = "santi-theme";

  function val(id) { var el = document.getElementById(id); return el ? (el.value || "").trim() : ""; }

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
        sendLead(
          {
            type: "contact",
            name: val("full-name"), email: val("email"), phone: val("phone"),
            subject: val("subject"), message: val("message"),
            page: location.href, submittedAt: new Date().toISOString()
          },
          {
            form: cForm,
            btn: cForm.querySelector("button[type=submit]"),
            msgEl: document.getElementById("santi-contact-msg"),
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
        sendLead(
          { type: "newsletter", email: input ? input.value.trim() : "", page: location.href, submittedAt: new Date().toISOString() },
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
