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

  /* ---------- lead tracking (Google Analytics events; never any personal details) ---------- */
  function track(name, params) { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); }
  window.SantiTrack = track; // used by aeo.js
  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]');
    if (!link) return;
    var href = link.getAttribute("href");
    track("contact_click", { method: href.indexOf("tel:") === 0 ? "phone" : href.indexOf("mailto:") === 0 ? "email" : "whatsapp" });
  });

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
    var i = 0, lastFocus = null, card = $(".modal__card", modal);

    var show = function (n) {
      i = n;
      steps.forEach(function (s, k) { s.hidden = k !== i; });
      if ($('input[name="budget"]', steps[i])) fitBudgets();
      bars.forEach(function (b, k) { b.classList.toggle("is-on", k <= i); });
      back.disabled = i === 0;
      var onAssist = steps[i].classList.contains("step--assistant");
      card.classList.toggle("is-chat", onAssist); // chat scrolls on its own; answer box and buttons stay put
      paintNext();
      say(msg, "");
      if (onAssist && !assist.started) startAssistant();
      var f = $("input, textarea", steps[i]); if (f) f.focus({ preventScroll: true });
    };
    var picked = function (name) { return $$('input[name="' + name + '"]:checked', form).map(function (x) { return x.value; }); };
    // Budget step follows the services picked: ranges that top out at or below the combined
    // starting price are hidden. Add a service's starting price (in rand) to SERVICE_MIN.
    // Once-off starting prices; keep in step with PRICE_LIST in the n8n assistant (monthly items left out on purpose)
    var SERVICE_MIN = { "Website": 4500, "Online store": 17500, "Website copywriting": 1500, "Bookings or payments": 3000,
      "Logo": 1500, "Brand identity": 9500, "Stationery / social kit": 2000, "Graphic design": 750, "Company profile": 3800,
      "AI solution": 7500, "AEO": 2950, "WordPress plugin": 6500 };
    var BUDGET_MAX = { "Under R5k": 5000, "R5k–R15k": 15000, "R15k–R30k": 30000, "R30k–R60k": 60000,
      "R60k–R100k": 100000, "R100k–R250k": 250000, "R250k+": Infinity };
    var rand = function (n) { return "R" + n.toLocaleString("en-ZA"); };
    // Thank-you screen: each picked service with its starting price, then budget, timeline and a "from" total.
    var showEstimate = function (services, budget, timeline) {
      var box = $(".estimate", done), lines = $(".estimate__lines", done);
      if (!box || !lines) return;
      var row = function (k, v, cls) {
        var d = document.createElement("div"); if (cls) d.className = cls;
        var dt = document.createElement("dt"); dt.textContent = k;
        var dd = document.createElement("dd"); dd.textContent = v;
        d.appendChild(dt); d.appendChild(dd); lines.appendChild(d);
      };
      lines.textContent = "";
      var total = 0;
      services.forEach(function (s) {
        var from = SERVICE_MIN[s];
        if (from) total += from;
        row(s, from ? "from " + rand(from) : "priced after a quick chat");
      });
      row("Your budget", budget === "Not sure" ? "Not sure yet" : budget, "estimate__meta");
      row("Timeline", timeline, "estimate__meta");
      if (total) row("Starting from", rand(total), "estimate__total");
      box.hidden = false;
    };
    var fitBudgets = function () {
      var min = picked("service").reduce(function (sum, s) { return sum + (SERVICE_MIN[s] || 0); }, 0);
      $$('input[name="budget"]', form).forEach(function (inp) {
        var hide = BUDGET_MAX[inp.value] !== undefined && BUDGET_MAX[inp.value] <= min;
        inp.closest(".chip").hidden = hide;
        if (hide) inp.checked = false;
      });
      var hint = $(".budget-hint", form);
      if (hint) {
        hint.hidden = !min;
        hint.textContent = min ? "For what you picked, projects start from " + rand(min) + "." : "";
      }
    };
    /* ---- project assistant (n8n + Claude): asks scoping questions, then quotes and coaches on budget ---- */
    var ASSIST_URL = "https://n8n.santi.co.za/webhook/santi-project-assistant";
    var aStep = $(".step--assistant", form);
    var assist = { started: false, turns: [], status: null, quote: null, summary: "", busy: false, failed: false, removed: [], conv: "" };
    var aLog = $(".assist__log", aStep), aQuote = $(".assist__quote", aStep), aAsk = $(".assist__ask", aStep);
    var aInput = $("#assist-input", aStep), aSend = $("[data-assist-send]", aStep);
    // Next shows once there is an estimate to send, or the assistant is unavailable
    var canGo = function () { return assist.failed || !!(assist.quote && assist.quote.lines.length); };
    // with an estimate on screen, Next becomes the "let's work" button
    var paintNext = function () {
      var onAssist = steps[i] === aStep, fancy = onAssist && !!(assist.quote && assist.quote.lines.length);
      next.hidden = onAssist && !canGo();
      next.classList.toggle("btn--celebrate", fancy);
      next.innerHTML = fancy ? 'Not broke? Let’s work <span class="arr">→</span>'
        : i === steps.length - 1 ? 'Send request <span class="arr">→</span>' : 'Next <span class="arr">→</span>';
    };
    var syncNext = paintNext;
    var confetti = function (fromEl) {
      if (reduce) return;
      var c = document.createElement("canvas"), x = c.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = window.innerWidth, H = window.innerHeight, r = fromEl.getBoundingClientRect();
      c.className = "confetti"; c.width = W * dpr; c.height = H * dpr; x.scale(dpr, dpr);
      document.body.appendChild(c);
      var cols = ["#173B9A", "#08BECC", "#FFD147", "#03707A", "#F4F7F8"], bits = [];
      for (var k = 0; k < 90; k++) {
        var a = -Math.PI / 2 + (Math.random() - .5) * 1.9, v = 7 + Math.random() * 8;
        bits.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[k % cols.length] });
      }
      var t0 = performance.now();
      var tick = function (t) {
        var life = (t - t0) / 1600;
        x.clearRect(0, 0, W, H);
        if (life >= 1) { c.remove(); return; }
        x.globalAlpha = 1 - Math.max(0, life - .6) / .4;
        bits.forEach(function (b) {
          b.vy += .32; b.vx *= .985; b.x += b.vx; b.y += b.vy; b.rot += b.vr;
          x.save(); x.translate(b.x, b.y); x.rotate(b.rot); x.fillStyle = b.c; x.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); x.restore();
        });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    var bubble = function (who, text, extra) {
      var b = document.createElement("div");
      b.className = "assist__msg assist__msg--" + who + (extra ? " " + extra : "");
      b.textContent = text; // textContent: model and visitor text never become markup
      aLog.appendChild(b); aLog.scrollTop = aLog.scrollHeight;
      // bring the new message into view inside the pop-up (it can sit above the estimate card)
      b.scrollIntoView({ block: who === "bot" ? "start" : "nearest", behavior: reduce ? "auto" : "smooth" });
      return b;
    };
    var quoteCard = function (q, intoEl, note, onRemove) {
      intoEl.textContent = "";
      var box = document.createElement("div"); box.className = "estimate";
      var h = document.createElement("h4"); h.textContent = "Your estimate"; box.appendChild(h);
      var dl = document.createElement("dl"); dl.className = "estimate__lines"; box.appendChild(dl);
      var row = function (k, v, cls, gets, line) {
        var d = document.createElement("div"); if (cls) d.className = cls;
        var dt = document.createElement("dt"); dt.textContent = k;
        if (gets) { var g = document.createElement("span"); g.className = "estimate__gets"; g.textContent = "You get: " + gets; dt.appendChild(g); }
        var dd = document.createElement("dd"); dd.textContent = v;
        d.appendChild(dt); d.appendChild(dd);
        if (line && onRemove) {
          var x = document.createElement("button"); x.type = "button"; x.className = "estimate__rm";
          x.setAttribute("aria-label", "Remove " + k); x.title = "Remove"; x.textContent = "×";
          x.addEventListener("click", function () { onRemove(line); });
          d.appendChild(x);
        }
        dl.appendChild(d);
      };
      var range = function (a, b) { return a === b ? rand(a) : rand(a) + " – " + rand(b); };
      q.lines.filter(function (l) { return !l.monthly; }).forEach(function (l) { row(l.item, range(l.min, l.max), "", l.includes, l); });
      if (q.total_max) row("Once-off total", range(q.total_min, q.total_max), "estimate__total");
      q.lines.filter(function (l) { return l.monthly; }).forEach(function (l) { row(l.item, range(l.min, l.max) + " / month", "estimate__meta", l.includes, l); });
      var p = document.createElement("p"); p.className = "estimate__note";
      p.textContent = note || "Estimate only — subject to change once we’ve reviewed your project.";
      box.appendChild(p); intoEl.appendChild(box); intoEl.hidden = false;
    };
    var sum = function (ls, monthly, k) { return ls.filter(function (l) { return l.monthly === monthly; }).reduce(function (s, l) { return s + l[k]; }, 0); };
    // the visitor drops a line: totals recompute here, and the assistant is told on the next message
    var removeLine = function (line) {
      var q = assist.quote;
      q.lines = q.lines.filter(function (l) { return l !== line; });
      q.total_min = sum(q.lines, false, "min"); q.total_max = sum(q.lines, false, "max");
      assist.removed.push(line.item);
      track("assistant_remove");
      if (q.lines.length) quoteCard(q, aQuote, null, removeLine);
      else { assist.quote = null; aQuote.hidden = true; aQuote.textContent = ""; }
      syncNext();
    };
    var resetAssistant = function () {
      assist.started = false; assist.turns = []; assist.status = null; assist.quote = null; assist.summary = ""; assist.busy = false;
      assist.failed = false; assist.removed = []; assist.conv = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      aLog.textContent = ""; aQuote.hidden = true; aQuote.textContent = "";
      aAsk.hidden = false; aInput.value = ""; aInput.placeholder = "Type your answer…";
    };
    var askAssistant = function () {
      if (assist.busy) return;
      assist.busy = true; aSend.disabled = true; aInput.disabled = true;
      var thinking = bubble("bot", "Thinking…", "is-thinking");
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
      fetch(ASSIST_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({ services: picked("service"), budget: picked("budget")[0], timeline: picked("timeline")[0], page: location.href, turns: assist.turns,
          conv: assist.conv, removed: assist.removed, estimate: assist.quote ? assist.quote.lines.map(function (l) { return l.item; }) : [] })
      }).then(function (r) { return r.json(); }).then(function (res) {
        thinking.remove();
        if (!res || typeof res.reply !== "string") throw new Error("bad reply");
        bubble("bot", res.reply);
        if (!res.ok) { aAsk.hidden = true; assist.failed = true; return; }
        assist.turns.push({ role: "assistant", content: res.reply });
        assist.status = res.status; assist.summary = res.summary || "";
        track("assistant_reply", { status: res.status });
        if (res.status === "quoted" && res.quote) {
          assist.quote = res.quote; quoteCard(res.quote, aQuote, null, removeLine);
          aInput.placeholder = "Add something, or ask about the estimate…";
        }
      }).catch(function () {
        thinking.remove();
        bubble("bot", "Sorry, the assistant isn’t available right now. You can still send us your details and we’ll reply within one business day.");
        aAsk.hidden = true; assist.failed = true;
      }).then(function () {
        clearTimeout(timer); assist.busy = false; aSend.disabled = false; aInput.disabled = false; syncNext();
        if (!aAsk.hidden) aInput.focus({ preventScroll: true });
      });
    };
    var startAssistant = function () { resetAssistant(); assist.started = true; askAssistant(); };
    aSend.addEventListener("click", function () {
      var text = aInput.value.trim().slice(0, 1200);
      if (!text || assist.busy) return;
      bubble("you", text); assist.turns.push({ role: "user", content: text }); aInput.value = "";
      askAssistant();
    });
    aInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); aSend.click(); } });
    var estimateText = function () {
      if (!assist.quote) return "";
      var q = assist.quote, out = ["", "— Assistant estimate (subject to change) —"];
      q.lines.forEach(function (l) { out.push("• " + l.item + ": " + rand(l.min) + " – " + rand(l.max) + (l.monthly ? " / month" : "") + (l.includes ? " (includes " + l.includes + ")" : "")); });
      out.push("Once-off total: " + rand(q.total_min) + " – " + rand(q.total_max));
      if (assist.summary) out.push("", "Assistant summary: " + assist.summary);
      out.push("", "Conversation:");
      assist.turns.forEach(function (t) { out.push((t.role === "user" ? "Client: " : "Assistant: ") + t.content.replace(/\s+/g, " ").slice(0, 600)); });
      return out.join("\n");
    };

    var check = function () {
      if (i === 0 && !picked("service").length) { say(msg, "Pick at least one — or choose “Not sure yet”.", "err"); return false; }
      if (i === 1 && !picked("budget").length) { say(msg, "Choose a budget range — “Not sure” is fine.", "err"); return false; }
      if (i === 2 && !picked("timeline").length) { say(msg, "Choose a rough timeline.", "err"); return false; }
      return true;
    };

    var open = function () {
      track("quote_start");
      lastFocus = document.activeElement;
      form.reset(); form.hidden = false; done.hidden = true; navRow.hidden = false; prog.hidden = false;
      resetAssistant();
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
    back.addEventListener("click", function () {
      if (i > 0 && steps[i].classList.contains("step--assistant")) resetAssistant(); // answers may change
      if (i > 0) show(i - 1);
    });
    next.addEventListener("click", function () {
      if (!check()) return;
      if (steps[i] === aStep && assist.quote) { track("assistant_accept"); confetti(next); }
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
        message: (form.details.value.trim() || "(no extra details)") + estimateText(),
        estimate_min: assist.quote ? assist.quote.total_min : null,
        estimate_max: assist.quote ? assist.quote.total_max : null,
        assistant_summary: assist.summary || "",
        services: services, budget: budget, timeline: timeline,
        page: location.href, submittedAt: new Date().toISOString()
      }).then(function () {
        track("generate_lead", { lead_type: "quote" });
        var slot = $(".done__quote", done);
        if (!slot) { slot = document.createElement("div"); slot.className = "done__quote"; done.insertBefore(slot, $(".estimate", done)); }
        if (assist.quote) { $(".estimate", done).hidden = true; quoteCard(assist.quote, slot); }
        else { slot.hidden = true; showEstimate(services, budget, timeline); }
        say(msg, "");
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
        track("generate_lead", { lead_type: "contact" });
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
