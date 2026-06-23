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
  // Free / personal webmail. Matched by the FIRST domain label so ccTLD variants
  // are caught too (gmail.com, yahoo.co.za, hotmail.co.uk all match). Only enforced
  // where a business email is required — pass {businessOnly:true} (e.g. the AEO tool).
  var FREE_EMAIL_BRANDS = ["gmail", "googlemail", "yahoo", "ymail", "rocketmail", "hotmail", "outlook",
    "live", "msn", "icloud", "aol", "gmx", "protonmail", "yandex", "zoho", "fastmail"];
  var FREE_EMAIL_EXACT = ["me.com", "mac.com", "mail.com", "mail.ru", "proton.me", "pm.me",
    "qq.com", "163.com", "126.com", "naver.com", "hey.com"];
  function isFreeEmail(domain) {
    return FREE_EMAIL_BRANDS.indexOf(domain.split(".")[0]) > -1 || FREE_EMAIL_EXACT.indexOf(domain) > -1;
  }

  function validateEmail(v, opts) {
    var biz = !!(opts && opts.businessOnly);
    v = String(v || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
      return { ok: false, msg: biz ? "Please enter a valid business email address." : "Please enter a valid email address." };
    var parts = v.split("@"), local = parts[0], domain = parts[1];
    var labels = domain.split("."), sld = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    if (FAKE_WORDS.indexOf(local) > -1 || FAKE_WORDS.indexOf(sld) > -1)
      return { ok: false, msg: "Please use your real email address — that one looks like a placeholder." };
    for (var i = 0; i < DISPOSABLE.length; i++)
      if (domain.indexOf(DISPOSABLE[i]) > -1) return { ok: false, msg: "Please use a permanent (non-disposable) email address." };
    if (biz && isFreeEmail(domain))
      return { ok: false, msg: "Please enter a valid business email address." };
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

  /* ---- Mobile off-canvas navigation (independent of everything else) ----
     The template's meanmenu doesn't reliably build the mobile menu, so we
     clone the main nav into it. Runs on its own so nothing can block it. */
  (function mobileNav() {
    function ensure() {
      var container = document.querySelector(".mobile-menu");
      var sourceUl = document.querySelector(".header__nav .main-menu > ul");
      if (!container || !sourceUl) return false;
      if (container.querySelector(".mean-nav a")) return true;        // meanmenu built it
      if (container.querySelector(".santi-mobile-nav a")) return true; // we already built it
      var ul = sourceUl.cloneNode(true);
      ul.removeAttribute("id");
      ul.className = "santi-mobile-nav";
      container.appendChild(ul);
      return !!container.querySelector(".santi-mobile-nav a");
    }
    function start() {
      ensure();
      var tries = 0;
      var iv = setInterval(function () { if (ensure() || ++tries > 15) clearInterval(iv); }, 350);
      var toggle = document.getElementById("side-toggle");
      if (toggle) toggle.addEventListener("click", function () { setTimeout(ensure, 50); });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
    window.addEventListener("load", function () { setTimeout(ensure, 100); });
  })();

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


/* ============================================================
   Hero "universe" — an interactive rotating particle sphere.
   Drag to spin (with inertia); the stars reach toward your cursor.
   Self-contained: no-ops on pages without #santi-universe.
   ============================================================ */
(function () {
  "use strict";

  function start() {
    var canvas = document.getElementById("santi-universe");
    if (!canvas || canvas.dataset.universeReady) return;
    canvas.dataset.universeReady = "1";

    var ctx = canvas.getContext("2d");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var W = 0, H = 0, cx = 0, cy = 0, R = 0, dpr = 1;
    var FOCAL = 2.3;
    var pts = [];

    // Fibonacci sphere — even point distribution
    function build() {
      var n = Math.max(80, Math.min(180, Math.round((W || 300) / 2.4)));
      pts = [];
      var golden = Math.PI * (3 - Math.sqrt(5));
      for (var i = 0; i < n; i++) {
        var y = 1 - (i / (n - 1)) * 2;          // 1 .. -1
        var r = Math.sqrt(1 - y * y);
        var theta = golden * i;
        pts.push({
          x: Math.cos(theta) * r, y: y, z: Math.sin(theta) * r,
          accent: Math.random() < 0.12,          // ~12% brand-orange stars
          tw: Math.random() * Math.PI * 2,        // twinkle phase
          ox: 0, oy: 0, ovx: 0, ovy: 0,           // click-burst screen displacement
          _sx: 0, _sy: 0                          // last base-projected position
        });
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      R = Math.min(W, H) * 0.46;
      if (!pts.length) build();
    }

    // rotation state
    var ay = 0, ax = -0.22;        // current angles
    var vay = 0.0016, vax = 0;     // velocities (auto-spin on Y)
    var tiltX = 0, tiltY = 0;      // pointer parallax (eased)
    var px = -999, py = -999, pInside = false;
    var dragging = false, lastX = 0, lastY = 0;
    var rings = [];

    // Supernova: blast the stars outward from the click, ripple a ring, spring back.
    function burst(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      var bx = clientX - rect.left, by = clientY - rect.top;
      var power = R * 0.17;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var dx = p._sx - bx, dy = p._sy - by;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var imp = power * Math.max(0.2, 1 - d / (R * 1.8));
        p.ovx += (dx / d) * imp;
        p.ovy += (dy / d) * imp;
      }
      rings.push({ x: bx, y: by, r: 0, a: 0.9, accent: true });
      rings.push({ x: bx, y: by, r: 0, a: 0.55, accent: false });
      vay += (Math.random() - 0.5) * 0.014;   // little kick to the spin
    }

    function onMove(e) {
      var rect = canvas.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;
      px = clientX - rect.left; py = clientY - rect.top;
      pInside = true;
      tiltY = (px / W - 0.5) * 0.6;
      tiltX = (py / H - 0.5) * 0.6;
      if (dragging) {
        vay = (clientX - lastX) * 0.00055;
        vax = (clientY - lastY) * -0.00045;
        lastX = clientX; lastY = clientY;
      }
    }
    function onLeave() { pInside = false; px = py = -999; tiltX = 0; tiltY = 0; }
    function onDown(e) {
      dragging = true;
      lastX = e.touches ? e.touches[0].clientX : e.clientX;
      lastY = e.touches ? e.touches[0].clientY : e.clientY;
      burst(lastX, lastY);
      if (!reduce && !running) { running = true; requestAnimationFrame(frame); }
    }
    function onUp() { dragging = false; }

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    function isLight() { return !document.documentElement.classList.contains("dark"); }

    var t = 0;
    function frame() {
      t += 0.016;
      // integrate rotation with gentle inertia, easing back to slow auto-spin
      ay += vay; ax += vax;
      vay += (0.0016 - vay) * 0.03;
      vax += (0 - vax) * 0.05;
      ax = Math.max(-1.1, Math.min(1.1, ax));

      var rx = ax + tiltX, ry = ay + tiltY;
      var sinX = Math.sin(rx), cosX = Math.cos(rx);
      var sinY = Math.sin(ry), cosY = Math.cos(ry);

      ctx.clearRect(0, 0, W, H);
      var light = isLight();
      var base = light ? "20,20,20" : "255,255,255";
      var accent = "255,106,26";

      var proj = [];
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        // rotate around Y then X
        var x1 = p.x * cosY - p.z * sinY;
        var z1 = p.x * sinY + p.z * cosY;
        var y1 = p.y * cosX - z1 * sinX;
        var z2 = p.y * sinX + z1 * cosX;
        var scale = FOCAL / (FOCAL - z2);
        var baseSx = cx + x1 * R * scale;
        var baseSy = cy + y1 * R * scale;
        p._sx = baseSx; p._sy = baseSy;
        // spring the burst displacement back toward zero (bouncy)
        p.ovx += -0.05 * p.ox; p.ovx *= 0.86; p.ox += p.ovx;
        p.ovy += -0.05 * p.oy; p.ovy *= 0.86; p.oy += p.ovy;
        proj.push({
          sx: baseSx + p.ox,
          sy: baseSy + p.oy,
          depth: (z2 + 1) / 2,        // 0 back .. 1 front
          scale: scale, p: p
        });
      }

      // draw lines from the cursor to nearby stars (the "reach")
      if (pInside) {
        for (var j = 0; j < proj.length; j++) {
          var q = proj[j];
          var dx = q.sx - px, dy = q.sy - py;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < R * 0.9) {
            var la = (1 - d / (R * 0.9)) * 0.5 * (0.4 + q.depth);
            ctx.strokeStyle = "rgba(" + (q.p.accent ? accent : base) + "," + la.toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py); ctx.lineTo(q.sx, q.sy);
            ctx.stroke();
          }
        }
      }

      // draw stars (back-to-front)
      proj.sort(function (a, b) { return a.depth - b.depth; });
      for (var k = 0; k < proj.length; k++) {
        var s = proj[k];
        var tw = 0.75 + 0.25 * Math.sin(t * 1.5 + s.p.tw);
        var a = (0.18 + s.depth * 0.82) * tw;
        var rad = (0.6 + s.depth * 1.9) * s.scale;
        // brighten stars near the cursor
        if (pInside) {
          var ddx = s.sx - px, ddy = s.sy - py;
          var dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd < 70) { a = Math.min(1, a + (1 - dd / 70) * 0.6); rad += (1 - dd / 70) * 1.6; }
        }
        ctx.fillStyle = "rgba(" + (s.p.accent ? accent : base) + "," + a.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // expanding shockwave rings from clicks
      for (var ri = rings.length - 1; ri >= 0; ri--) {
        var rg = rings[ri];
        rg.r += R * 0.05; rg.a *= 0.93;
        if (rg.a < 0.03) { rings.splice(ri, 1); continue; }
        ctx.strokeStyle = "rgba(" + (rg.accent ? accent : base) + "," + rg.a.toFixed(3) + ")";
        ctx.lineWidth = rg.accent ? 1.6 : 1;
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (!reduce && running) requestAnimationFrame(frame);
    }

    var running = true;
    // pause when scrolled out of view (perf)
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var was = running;
          running = en.isIntersecting;
          if (running && !was && !reduce) requestAnimationFrame(frame);
        });
      }, { threshold: 0 }).observe(canvas);
    }

    if ("ResizeObserver" in window) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    resize();
    if (reduce) { frame(); }            // single static render
    else { requestAnimationFrame(frame); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
