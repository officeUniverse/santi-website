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

  /* ---------- case-study image viewer ---------- */
  var caseImages = $$(".case-hero__media img, .case .board img");
  if (caseImages.length) {
    var viewer = document.createElement("dialog");
    viewer.className = "case-viewer";
    viewer.setAttribute("aria-label", "Project image viewer");
    viewer.innerHTML = '<button type="button" class="case-viewer__close" aria-label="Close image">Close ×</button><button type="button" class="case-viewer__prev" aria-label="Previous image">←</button><figure><img alt=""><figcaption aria-live="polite"></figcaption></figure><button type="button" class="case-viewer__next" aria-label="Next image">→</button>';
    document.body.appendChild(viewer);
    var activeImage = 0, imageTrigger, previousOverflow;
    function showCaseImage(index) {
      activeImage = (index + caseImages.length) % caseImages.length;
      var source = caseImages[activeImage];
      var captionContainer = source.closest("figure") || source.closest(".board");
      var caption = captionContainer ? captionContainer.querySelector("figcaption, .cap") : null;
      $("img", viewer).src = source.currentSrc || source.src;
      $("img", viewer).alt = source.alt;
      $("figcaption", viewer).textContent = (caption ? caption.textContent : source.alt) + " · " + (activeImage + 1) + " / " + caseImages.length;
    }
    caseImages.forEach(function (img, index) {
      var trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "case-image-open";
      trigger.setAttribute("aria-label", "Enlarge image: " + img.alt);
      trigger.setAttribute("aria-haspopup", "dialog");
      img.parentNode.insertBefore(trigger, img);
      trigger.appendChild(img);
      trigger.addEventListener("click", function () {
        imageTrigger = trigger;
        showCaseImage(index);
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        viewer.showModal();
        $(".case-viewer__close", viewer).focus();
      });
    });
    $(".case-viewer__close", viewer).addEventListener("click", function () { viewer.close(); });
    $(".case-viewer__prev", viewer).addEventListener("click", function () { showCaseImage(activeImage - 1); });
    $(".case-viewer__next", viewer).addEventListener("click", function () { showCaseImage(activeImage + 1); });
    viewer.addEventListener("click", function (event) { if (event.target === viewer) viewer.close(); });
    viewer.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        showCaseImage(activeImage + (event.key === "ArrowLeft" ? -1 : 1));
      }
    });
    viewer.addEventListener("close", function () {
      document.body.style.overflow = previousOverflow;
      if (imageTrigger) imageTrigger.focus({ preventScroll: true });
    });
  }

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
  var nav = $(".nav"), hero = $(".hero, .page-hero, .frame--hero");
  if (nav) {
    var onScroll = function () {
      // Light pages (no dark hero) get the solid nav straight away.
      nav.classList.toggle("is-solid", !hero || hero.getBoundingClientRect().bottom - 80 <= 0);
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
        say(msg, "That didn't send. Please email santi@santi.co.za.", "err");
      }).finally(function () { next.disabled = false; });
    });
  }

  /* ---------- featured work: 7 of the pool per visit, least-recently-shown first ---------- */
  var work = $(".work");
  if (work) {
    var pool = $$(".tile", work), byHref = {};
    pool.forEach(function (tl) { byHref[tl.getAttribute("href")] = tl; });
    var LAYOUT = [["l", "s"], ["s", "l"], ["third", "third", "third"]], SHOW = 7;
    var SEEN = "santi-featured-seen", LAST = "santi-featured-last", pick = null;
    var navEntry = window.performance && performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
    try { // Back from a project: keep the set the visitor just saw
      if (navEntry && navEntry.type === "back_forward") pick = JSON.parse(sessionStorage.getItem(LAST));
    } catch (e) {}
    if (!pick || !pick.every(function (h) { return byHref[h]; })) {
      var seen = {};
      try { seen = JSON.parse(localStorage.getItem(SEEN)) || {}; } catch (e) {}
      pick = pool.map(function (tl) { var h = tl.getAttribute("href"); return { h: h, s: seen[h] || 0, r: Math.random() }; })
        .sort(function (x, y) { return x.s - y.s || x.r - y.r; })
        .slice(0, SHOW).map(function (x) { return x.h; });
      for (var i = pick.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), tmp = pick[i]; pick[i] = pick[j]; pick[j] = tmp; }
      var stamp = Date.now();
      pick.forEach(function (h) { seen[h] = stamp; });
      try { localStorage.setItem(SEEN, JSON.stringify(seen)); sessionStorage.setItem(LAST, JSON.stringify(pick)); } catch (e) {}
    }
    if (pick.length === SHOW) {
      work.textContent = "";
      var k = 0;
      LAYOUT.forEach(function (sizes) {
        var row = document.createElement("div");
        row.className = "work-row" + (sizes.length === 3 ? " work-row--3" : "");
        sizes.forEach(function (sz) {
          var tl = byHref[pick[k++]];
          tl.className = tl.className.replace(/tile--\w+/, "tile--" + sz);
          row.appendChild(tl);
        });
        work.appendChild(row);
      });
    }
  }

  /* ---------- work tiles: cycle a project's images on hover ---------- */
  var registry = {};
  (window.SANTI_CASE_STUDIES || []).forEach(function (p) { registry[p.href] = p.images.map(function (im) { return im.src; }); });
  var canHover = window.matchMedia("(hover: hover)").matches;
  if (canHover && !reduce) {
    $$("[data-project]").forEach(function (tile) { // homepage tiles + All-work cards
      var media = $(".tile__media", tile);
      if (!media) return;
      var cover = $("img", media);
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

  /* ---------- "← Back": return through history so the list keeps its scroll ---------- */
  $$("[data-back]").forEach(function (link) {
    link.addEventListener("click", function (e) {
      var fromHere = false;
      try { fromHere = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (err) {}
      if (fromHere && history.length > 1) { e.preventDefault(); history.back(); }
      // otherwise the plain href (All work) handles it
    });
  });

  /* ---------- All-work filters ---------- */
  var filterBtns = $$(".filters [data-filter]");
  filterBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var f = btn.dataset.filter;
      filterBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      $$(".card[data-tags]").forEach(function (c) {
        c.hidden = f !== "all" && c.dataset.tags.split(" ").indexOf(f) === -1;
      });
    });
  });

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

  /* ---------- contact form (contact.html) ---------- */
  var cForm = $("#santi-contact-form");
  if (cForm) {
    cForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var out = $("#santi-contact-msg"), btn = $("button[type=submit]", cForm);
      var field = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; };
      if (!field("full-name") || !field("subject") || !field("message")) { say(out, "Please fill in your name, subject and message.", "err"); return; }
      var em = validateEmail(field("email"));
      if (!em.ok) { say(out, em.msg, "err"); return; }
      var ph = validatePhone(field("phone"), false); // optional, but must be real if given
      if (!ph.ok) { say(out, ph.msg, "err"); return; }
      btn.disabled = true; say(out, "Sending…");
      postLead({
        type: "contact", name: field("full-name"), email: em.value, phone: ph.value,
        subject: field("subject"), message: field("message"),
        page: location.href, submittedAt: new Date().toISOString()
      }).then(function () {
        say(out, "Thank you! Your message is on its way — we'll reply within one business day.", "ok");
        cForm.reset();
      }).catch(function () {
        say(out, "Sorry, that didn't send. Please email santi@santi.co.za or try again.", "err");
      }).finally(function () { btn.disabled = false; });
    });
  }

  /* ---------- location-aware line (about.html; only after cookie consent) ---------- */
  function personaliseGeo() {
    var geo = $("#santi-geo");
    if (!geo || !window.fetch) return;
    var providers = [
      { url: "https://get.geojs.io/v1/ip/geo.json", map: function (d) { return { cc: d.country_code, city: d.city, country: d.country }; } },
      { url: "https://ipapi.co/json/", map: function (d) { return d.error ? null : { cc: d.country_code, city: d.city, country: d.country_name }; } },
      { url: "https://ipwho.is/", map: function (d) { return d.success === false ? null : { cc: d.country_code, city: d.city, country: d.country }; } }
    ];
    var show = function (g) {
      var msg;
      if (g.cc === "ZA") msg = "Proudly based in South Africa — serving businesses in " + (g.city || "your area") + ", across the country and worldwide.";
      else if (g.cc === "KE") msg = "On the ground in Kenya — partnering with businesses in " + (g.city || "Nairobi") + " and across the region.";
      else msg = "Based in South Africa & Kenya — working with clients in " + (g.country || "your region") + " and worldwide.";
      geo.textContent = msg; // textContent: API values never become markup
    };
    (function tryNext(i) {
      if (i >= providers.length) return; // keep the static fallback
      fetch(providers[i].url)
        .then(function (r) { return r.json(); })
        .then(function (d) { var g = providers[i].map(d); if (g && g.cc) show(g); else tryNext(i + 1); })
        .catch(function () { tryNext(i + 1); });
    })(0);
  }

  /* ---------- Google Analytics (GA4) via Consent Mode ----------
     The tag itself is in every page's <head> with consent defaulting to "denied"
     (no cookies, no visitor identity). Accept flips analytics storage on. */
  function grantAnalytics(on) {
    if (typeof window.gtag === "function") window.gtag("consent", "update", { analytics_storage: on ? "granted" : "denied" });
  }

  /* ---------- Hotjar (heatmaps + session recordings) — loads only after the visitor accepts ---------- */
  var HJ_ID = 2048719, hjLoaded = false;
  function loadHotjar() {
    if (hjLoaded) return;
    hjLoaded = true;
    $$("form").forEach(function (f) { f.setAttribute("data-hj-suppress", ""); }); // never record what people type into forms
    window.hj = window.hj || function () { (window.hj.q = window.hj.q || []).push(arguments); };
    window._hjSettings = { hjid: HJ_ID, hjsv: 6 };
    var tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://static.hotjar.com/c/hotjar-" + HJ_ID + ".js?sv=6";
    document.head.appendChild(tag);
  }

  /* ---------- cookie consent (POPIA / GDPR) ---------- */
  var CK = "santi-cookie-consent-v3"; // v3: the choice covers Google Analytics and Hotjar, so earlier answers are asked again
  var consent = null; try { consent = localStorage.getItem(CK); } catch (e) {}
  function onAccept() { personaliseGeo(); grantAnalytics(true); loadHotjar(); }
  if (consent === "accepted") { personaliseGeo(); loadHotjar(); } // analytics consent is already restored in the <head> tag
  if (!consent) {
    var bar = document.createElement("div");
    bar.className = "cookie"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Cookie consent");
    bar.innerHTML = '<p>With your OK we use Google Analytics cookies and Hotjar to see how the site is used, and show a location-aware message. See our <a href="cookies.html">Cookie Policy</a>.</p>' +
      '<div><button type="button" class="btn btn--ghost" data-c="rejected">Decline</button><button type="button" class="btn btn--accent" data-c="accepted">Accept</button></div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("is-visible"); });
    $$("button", bar).forEach(function (b) {
      b.addEventListener("click", function () {
        try { localStorage.setItem(CK, b.dataset.c); } catch (e) {}
        if (b.dataset.c === "accepted") onAccept();
        bar.classList.remove("is-visible");
        setTimeout(function () { bar.remove(); }, 400);
      });
    });
  }

  // "Change my cookie choice" (Cookie Policy): forget the answer, clear Analytics + Hotjar data, ask again
  $$("[data-cookie-reset]").forEach(function (b) {
    b.addEventListener("click", function () {
      try { localStorage.removeItem(CK); } catch (e) {}
      grantAnalytics(false);
      document.cookie.split(";").forEach(function (c) {
        var name = c.split("=")[0].trim();
        if (name.indexOf("_ga") === 0 || name.indexOf("_hj") === 0) {
          document.cookie = name + "=; Max-Age=0; path=/";
          document.cookie = name + "=; Max-Age=0; path=/; domain=." + location.hostname.replace(/^www\./, "");
        }
      });
      [localStorage, sessionStorage].forEach(function (store) {
        try { Object.keys(store).forEach(function (k) { if (/^_?hj/i.test(k)) store.removeItem(k); }); } catch (e) {}
      });
      location.reload();
    });
  });
})();
