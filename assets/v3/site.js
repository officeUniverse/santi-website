/* ============================================================
   Santi Universe v3 — site behaviour (no dependencies)
   Leads + validators (shared with aeo.js), nav, quote modal,
   cookie consent, work-tile hover cycling, scroll restoration,
   reveal-on-scroll, progressive-blur toggle.
   ============================================================ */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- leads webhook (shared with aeo.js) ---------- */
  var WEBHOOK = window.SANTI_LEAD_WEBHOOK || "https://n8n.santi.co.za/webhook/santi-leads";
  window.SANTI_LEAD_WEBHOOK = WEBHOOK;

  /* ---------- "is this real?" validators (same rules as v2) ---------- */
  var FAKE = ["test", "example", "fake", "demo", "sample", "asdf", "none", "noemail", "nomail", "xxx", "abc", "qwerty"];
  var DISPOSABLE = ["mailinator", "yopmail", "guerrillamail", "tempmail", "temp-mail", "10minutemail", "trashmail",
    "sharklasers", "getnada", "dispostable", "maildrop", "fakeinbox", "throwaway", "guerrilla"];
  var FREE_BRANDS = ["gmail", "googlemail", "yahoo", "ymail", "rocketmail", "hotmail", "outlook", "live", "msn",
    "icloud", "aol", "gmx", "protonmail", "yandex", "zoho", "fastmail"];
  var FREE_EXACT = ["me.com", "mac.com", "mail.com", "mail.ru", "proton.me", "pm.me", "qq.com", "163.com", "126.com", "naver.com", "hey.com"];

  function validateEmail(v, opts) {
    var biz = !!(opts && opts.businessOnly);
    v = String(v || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, msg: biz ? "Please enter a valid business email address." : "Please enter a valid email address." };
    var parts = v.split("@"), local = parts[0], domain = parts[1], labels = domain.split(".");
    var sld = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
    if (FAKE.indexOf(local) > -1 || FAKE.indexOf(sld) > -1) return { ok: false, msg: "Please use your real email address — that one looks like a placeholder." };
    for (var i = 0; i < DISPOSABLE.length; i++) if (domain.indexOf(DISPOSABLE[i]) > -1) return { ok: false, msg: "Please use a permanent (non-disposable) email address." };
    if (biz && (FREE_BRANDS.indexOf(labels[0]) > -1 || FREE_EXACT.indexOf(domain) > -1)) return { ok: false, msg: "Please enter a valid business email address." };
    return { ok: true, value: v };
  }

  function validatePhone(v, required) {
    var raw = String(v || "").trim();
    if (!raw) return required ? { ok: false, msg: "Please enter your phone number." } : { ok: true, value: "" };
    var d = raw.replace(/[^\d+]/g, "");
    if (d.indexOf("+27") === 0) d = "0" + d.slice(3);
    else if (d.indexOf("0027") === 0) d = "0" + d.slice(4);
    else if (d.indexOf("27") === 0 && d.length === 11) d = "0" + d.slice(2);
    d = d.replace(/\D/g, "");
    if (!/^0\d{9}$/.test(d)) return { ok: false, msg: "Please enter a valid 10-digit South African number (e.g. 071 234 5678)." };
    var bad = /^(\d)\1{9}$/.test(d) || new Set(d.split("")).size <= 2 || /(\d)\1{5,}/.test(d) ||
      "01234567890".indexOf(d) > -1 || "09876543210".indexOf(d) > -1;
    if (bad) return { ok: false, msg: "That phone number doesn't look real — please double-check it." };
    return { ok: true, value: d };
  }
  window.SantiValidate = { email: validateEmail, phone: validatePhone };

  function postLead(data) {
    return fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r; });
  }
  function say(el, text, cls) { if (!el) return; el.textContent = text; el.className = "form-msg" + (cls ? " " + cls : ""); }

  /* ---------- nav: solid state + mobile sheet ---------- */
  var nav = $(".nav"), hero = $(".hero");
  if (nav) {
    var onScroll = function () {
      var edge = hero ? hero.getBoundingClientRect().bottom - 80 : 80;
      nav.classList.toggle("is-solid", edge <= 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    var menuBtn = $(".nav__menu"), sheet = $(".sheet");
    if (menuBtn && sheet) {
      var setMenu = function (open) {
        sheet.classList.toggle("is-open", open);
        menuBtn.setAttribute("aria-expanded", String(open));
        document.body.style.overflow = open ? "hidden" : "";
      };
      menuBtn.addEventListener("click", function () { setMenu(!sheet.classList.contains("is-open")); });
      $$("a, button", sheet).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheet.classList.contains("is-open")) { setMenu(false); menuBtn.focus(); } });
    }
  }

  /* ---------- quote modal (multi-step) ---------- */
  var modal = $("#quote");
  if (modal) {
    var form = $("form", modal), steps = $$(".step", modal), bars = $$(".progress span", modal);
    var back = $("[data-q-back]", modal), next = $("[data-q-next]", modal), msg = $(".form-msg", modal);
    var done = $(".done", modal), navRow = $(".modal__nav", modal), prog = $(".progress", modal);
    var i = 0, lastFocus = null;

    var show = function (n) {
      i = n;
      steps.forEach(function (s, k) { s.hidden = k !== i; });
      bars.forEach(function (b, k) { b.classList.toggle("is-on", k <= i); });
      back.disabled = i === 0;
      next.innerHTML = i === steps.length - 1 ? 'Send request <span class="arr">→</span>' : 'Next <span class="arr">→</span>';
      say(msg, "");
      var f = $("input, textarea", steps[i]); if (f) f.focus({ preventScroll: true });
    };
    var picked = function (name) { return $$('input[name="' + name + '"]:checked', form).map(function (x) { return x.value; }); };
    var check = function () {
      if (i === 0 && !picked("service").length) { say(msg, "Pick at least one — or choose “Not sure yet”.", "err"); return false; }
      if (i === 1 && !picked("budget").length) { say(msg, "Choose a budget range — “Not sure” is fine.", "err"); return false; }
      if (i === 2 && !picked("timeline").length) { say(msg, "Choose a rough timeline.", "err"); return false; }
      return true;
    };

    var open = function () {
      lastFocus = document.activeElement;
      form.reset(); form.hidden = false; done.hidden = true; navRow.hidden = false; prog.hidden = false;
      modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      show(0);
    };
    var close = function () {
      modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    };

    $$("[data-quote]").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
    $$("[data-q-close]", modal).forEach(function (b) { b.addEventListener("click", close); });
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) {
      if (!modal.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") { // keep focus inside the dialog
        var f = $$('button:not([disabled]), input, textarea, a[href], [tabindex]:not([tabindex="-1"])', modal).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    back.addEventListener("click", function () { if (i > 0) show(i - 1); });
    next.addEventListener("click", function () {
      if (!check()) return;
      if (i < steps.length - 1) { show(i + 1); return; }
      var em = validateEmail(form.email.value, { businessOnly: false });
      if (!form.name.value.trim()) { say(msg, "Please tell us your name.", "err"); form.name.focus(); return; }
      if (!em.ok) { say(msg, em.msg, "err"); form.email.focus(); return; }
      var ph = validatePhone(form.phone.value, false);
      if (!ph.ok) { say(msg, ph.msg, "err"); form.phone.focus(); return; }
      var services = picked("service"), budget = picked("budget")[0], timeline = picked("timeline")[0];
      next.disabled = true; say(msg, "Sending…");
      postLead({
        type: "quote",
        name: form.name.value.trim(), email: em.value, phone: ph.value,
        subject: "Quote — " + services.join(", ") + " · " + budget + " · " + timeline,
        message: form.details.value.trim() || "(no extra details)",
        services: services, budget: budget, timeline: timeline,
        page: location.href, submittedAt: new Date().toISOString()
      }).then(function () {
        form.hidden = true; navRow.hidden = true; prog.hidden = true; done.hidden = false;
        $("h3", done).focus();
      }).catch(function () {
        say(msg, "That didn't send. Please email santi@santi.co.za or WhatsApp +27 63 559 4183.", "err");
      }).finally(function () { next.disabled = false; });
    });
  }

  /* ---------- newsletter ---------- */
  var news = $("#newsletter");
  if (news) {
    news.addEventListener("submit", function (e) {
      e.preventDefault();
      var out = $(".form-msg", news.parentNode), em = validateEmail(news.email.value);
      if (!em.ok) { say(out, em.msg, "err"); return; }
      var b = $("button", news); b.disabled = true; say(out, "Subscribing…");
      postLead({ type: "newsletter", email: em.value, page: location.href, submittedAt: new Date().toISOString() })
        .then(function () { say(out, "You're subscribed — thank you!", "ok"); news.reset(); })
        .catch(function () { say(out, "Couldn't subscribe right now. Please try again later.", "err"); })
        .finally(function () { b.disabled = false; });
    });
  }

  /* ---------- work tiles: cycle a project's images on hover ---------- */
  var registry = {};
  (window.SANTI_CASE_STUDIES || []).forEach(function (p) { registry[p.href] = p.images.map(function (im) { return im.src; }); });
  var canHover = window.matchMedia("(hover: hover)").matches;
  if (canHover && !reduce) {
    $$(".tile[data-project]").forEach(function (tile) {
      var media = $(".tile__media", tile), cover = $("img", media);
      // Curated, mockups-first reel from data-reel; fall back to the case-study registry.
      var source = tile.dataset.reel ? tile.dataset.reel.split("|") : (registry[tile.dataset.project] || []);
      var list = source.filter(function (s) { return s && s !== cover.getAttribute("src"); });
      if (!list.length) return;
      var orig = cover.getAttribute("src"), a = cover, b = cover.cloneNode();
      b.removeAttribute("srcset"); b.removeAttribute("loading"); b.alt = ""; b.setAttribute("aria-hidden", "true"); b.classList.add("is-next");
      media.appendChild(b);
      var showing = a, timer = null, k = 0, hovering = false;
      var swapTo = function (src) {
        var hidden = showing === a ? b : a;
        hidden.src = src; hidden.classList.remove("is-next"); showing.classList.add("is-next"); showing = hidden;
      };
      var step = function () {
        var src = list[k++ % list.length], pre = new Image();
        pre.onload = function () { if (hovering) swapTo(src); };
        pre.src = src;
      };
      tile.addEventListener("pointerenter", function () { hovering = true; step(); timer = setInterval(step, 1400); });
      tile.addEventListener("pointerleave", function () {
        hovering = false; clearInterval(timer); timer = null;
        if (showing.getAttribute("src") !== orig) swapTo(orig);
      });
    });
  }

  /* ---------- remember scroll position for "← Back" from a project ---------- */
  var KEY = "santi-scroll:" + location.pathname;
  $$("a[data-keep-scroll]").forEach(function (a) {
    a.addEventListener("click", function () { try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (e) {} });
  });
  try {
    var saved = sessionStorage.getItem(KEY);
    var nav0 = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    if (saved !== null && nav0 && nav0.type === "back_forward") {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      window.addEventListener("load", function () { window.scrollTo(0, parseInt(saved, 10) || 0); });
    }
  } catch (e) {}

  /* ---------- gentle reveal (content is never left hidden) ---------- */
  var reveals = $$(".reveal");
  if (reveals.length && "IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("is-in"); io.unobserve(x.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add("is-in"); }); }, 2500); // safety net
  } else {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- progressive blur: hide near the footer and while modal is open ---------- */
  var blur = $(".pblur"), foot = $(".footer");
  if (blur && foot) {
    var tick = function () {
      var near = foot.getBoundingClientRect().top < window.innerHeight - 40;
      var modalOpen = modal && modal.classList.contains("is-open");
      var atTop = window.scrollY < 160; // never blur the hero CTAs in the first screen
      blur.classList.toggle("is-off", near || modalOpen || atTop);
    };
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    if (modal) new MutationObserver(tick).observe(modal, { attributes: true, attributeFilter: ["class"] });
    tick();
  }

  /* ---------- cookie consent (POPIA / GDPR) ---------- */
  var CK = "santi-cookie-consent";
  var consent = null; try { consent = localStorage.getItem(CK); } catch (e) {}
  if (!consent) {
    var bar = document.createElement("div");
    bar.className = "cookie"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Cookie consent");
    bar.innerHTML = '<p>We use essential cookies to run this site, plus optional ones to improve it. See our <a href="cookies.html">Cookie Policy</a>.</p>' +
      '<div><button type="button" class="btn btn--ghost" data-c="rejected">Decline</button><button type="button" class="btn btn--accent" data-c="accepted">Accept</button></div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("is-visible"); });
    $$("button", bar).forEach(function (b) {
      b.addEventListener("click", function () {
        try { localStorage.setItem(CK, b.dataset.c); } catch (e) {}
        bar.classList.remove("is-visible");
        setTimeout(function () { bar.remove(); }, 400);
      });
    });
  }
})();
