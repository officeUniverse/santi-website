/* ============================================================
   Santi Universe — AEO tool front-end
   Talks to the AEO analyzer backend (api/aeo.js).
   ============================================================ */
(function () {
  "use strict";

  // Endpoint resolution:
  //  - window.AEO_ENDPOINT overrides everything (set in the page if you like)
  //  - local preview (Python static server on :8848) -> Node API on :8849
  //  - everywhere else -> the AEO analyzer running on n8n
  function resolveEndpoint() {
    if (window.AEO_ENDPOINT) return window.AEO_ENDPOINT;
    var h = location.hostname;
    if ((h === "localhost" || h === "127.0.0.1") && location.port !== "8849") {
      return "http://localhost:8849/api/aeo";
    }
    return "https://n8n.santi.co.za/webhook/aeo-check";
  }

  var ICONS = { pass: "✓", warn: "!", fail: "✕" };
  var LABELS = { pass: "Looking good", warn: "Could be better", fail: "Needs fixing" };

  // Plain-language "what this means" for every check — written for
  // non-technical visitors. Keyed by the stable check.id from aeo-core.js.
  var PLAIN = {
    https: "This is the padlock in the address bar. It keeps your visitors safe, and AI engines trust secure sites far more than unsecured ones.",
    title: "The headline AI and Google show for your page. It's the very first thing they read to understand what you do.",
    description: "The short summary shown under your link in search results and AI answers — think of it as your one-line sales pitch.",
    lang: "Tells AI which language your site is written in, so it reads and quotes you correctly instead of guessing.",
    headings: "These are the 'chapter titles' on your page. They let AI follow your content instead of seeing one big wall of text.",
    content: "AI reads words, not pictures. If your message lives inside images, or only appears after a click, AI simply can't see it.",
    schema: "A behind-the-scenes label that spells out who you are, what you offer and how to reach you — in a format AI understands perfectly. This is the single biggest win.",
    opengraph: "Controls the little preview card (image + text) shown when your link is shared or surfaced by AI. It makes you look established and trustworthy.",
    canonical: "Tells AI which version of a page is the 'real' one, so you're not marked down for looking like duplicate pages.",
    robots: "A small text file that can accidentally tell AI to 'go away'. We make sure it isn't blocking ChatGPT, Claude, Perplexity or Google's AI.",
    llms: "A simple 'cheat sheet' file made just for AI — it points the AI straight to your most important pages and what your business does. New, but powerful.",
    sitemap: "A map of all your pages, so AI and Google can find every one — not just your homepage.",
    viewport: "Makes sure your site works properly on phones. Most people — and AI's mobile checks — see the phone version first.",
    favicon: "The tiny icon in the browser tab. A small thing, but it signals a real, cared-for website."
  };

  function el(id) { return document.getElementById(id); }

  function scoreLabel(score) {
    if (score >= 90) return "Excellent — your site is highly AI-ready.";
    if (score >= 75) return "Good — a few tweaks will make you stand out to AI.";
    if (score >= 55) return "Fair — there's real room to improve how AI reads you.";
    if (score >= 40) return "Needs work — AI is likely missing or misreading key things.";
    return "At risk — AI engines will struggle to understand and recommend you.";
  }

  function band(score) { return score >= 75 ? "good" : score >= 40 ? "mid" : "low"; }

  function sortedChecks(report) {
    var order = { fail: 0, warn: 1, pass: 2 };
    return report.checks.slice().sort(function (a, b) { return order[a.status] - order[b.status]; });
  }

  var lastReport = null;

  function render(report) {
    lastReport = report;
    var results = el("aeo-results");
    el("aeo-score").textContent = report.score;
    var ring = document.querySelector(".aeo-score-ring");
    if (ring) ring.style.setProperty("--val", report.score);
    el("aeo-grade").textContent = report.grade;
    el("aeo-score-label").textContent = scoreLabel(report.score);
    el("aeo-url-line").textContent = report.url;

    // Personalise the WhatsApp button with their result.
    var wa = el("aeo-wa-btn");
    if (wa) {
      var msg = "Hi Santi, I just ran the AEO check on " + report.url +
        " and scored " + report.score + "/100 (" + report.grade + "). I'd like some help improving it.";
      wa.href = "https://wa.me/27715914495?text=" + encodeURIComponent(msg);
    }

    var list = el("aeo-checklist");
    list.innerHTML = "";
    sortedChecks(report).forEach(function (c) {
      var li = document.createElement("li");
      li.className = "aeo-check " + c.status;
      var plain = PLAIN[c.id] || "";
      li.innerHTML =
        '<span class="mark">' + ICONS[c.status] + "</span>" +
        "<div>" +
        '<div class="c-head"><span class="c-label">' + esc(c.label) + "</span>" +
        '<span class="c-pill ' + c.status + '">' + LABELS[c.status] + "</span></div>" +
        (plain ? '<div class="c-plain">' + esc(plain) + "</div>" : "") +
        '<div class="c-detail">' + esc(c.detail) + "</div>" +
        (c.status === "pass"
          ? ""
          : '<div class="c-fix"><b>How to fix:</b> ' + esc(c.fix) + "</div>") +
        "</div>";
      list.appendChild(li);
    });

    results.hidden = false;
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ---------- Downloadable report (PDF via the browser) ----------
     Opens a clean, branded, self-contained report in a new tab that the
     visitor can "Save as PDF". Falls back to downloading a standalone
     .html file if the new tab is blocked. No template chrome, no libraries. */
  function downloadReport() {
    if (!lastReport) return;
    var html = buildReportHtml(lastReport);
    var w = null;
    try { w = window.open("", "_blank"); } catch (e) {}
    if (w && w.document) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      try { w.focus(); } catch (e) {}
      return;
    }
    // Fallback: download a standalone HTML file they can open + print.
    try {
      var blob = new Blob([html], { type: "text/html" });
      var url = URL.createObjectURL(blob);
      var host = String(lastReport.url || "site")
        .replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
      var a = document.createElement("a");
      a.href = url;
      a.download = "aeo-report-" + (host || "site") + ".html";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    } catch (e) {}
  }

  function buildReportHtml(report) {
    var s = report.summary || {};
    var date;
    try {
      date = new Date(report.fetchedAt || Date.now())
        .toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) { date = new Date().toDateString(); }

    var rows = sortedChecks(report).map(function (c) {
      var plain = PLAIN[c.id] || "";
      return '<div class="r ' + c.status + '">' +
        '<div class="r-top"><span class="r-name">' + esc(c.label) + "</span>" +
        '<span class="r-pill ' + c.status + '">' + LABELS[c.status] + "</span></div>" +
        (plain ? '<p class="r-plain">' + esc(plain) + "</p>" : "") +
        '<p class="r-detail">' + esc(c.detail) + "</p>" +
        (c.status === "pass" ? "" : '<p class="r-fix"><strong>How to fix:</strong> ' + esc(c.fix) + "</p>") +
        "</div>";
    }).join("");

    return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>AEO Readiness Report — " + esc(report.url) + "</title>" +
      "<style>" + reportCss() + "</style></head><body>" +
      "<div class=\"bar no-print\"><span>Your report is ready. Use the button to save it as a PDF.</span>" +
      "<button onclick=\"window.print()\">&#x2913; Save as PDF</button></div>" +
      "<main class=\"page\">" +
        "<header class=\"rhead\">" +
          "<div class=\"brand\">Santi<span>Universe</span></div>" +
          "<div class=\"rhead-meta\">AEO Readiness Report<br><small>Web · Graphic · AI</small></div>" +
        "</header>" +
        "<section class=\"meta\">" +
          "<div><span class=\"k\">Website</span><span class=\"v\">" + esc(report.url) + "</span></div>" +
          "<div><span class=\"k\">Date</span><span class=\"v\">" + esc(date) + "</span></div>" +
        "</section>" +
        "<section class=\"hero\">" +
          "<div class=\"score s-" + band(report.score) + "\"><span class=\"num\">" + report.score + "</span><span class=\"den\">/ 100</span></div>" +
          "<div class=\"hero-txt\"><div class=\"grade\">" + esc(report.grade) + "</div>" +
            "<p class=\"verdict\">" + esc(scoreLabel(report.score)) + "</p>" +
            "<p class=\"counts\"><b style=\"color:#1f9d57\">" + (s.pass || 0) + " looking good</b> &nbsp;·&nbsp; " +
              "<b style=\"color:#b08900\">" + (s.warn || 0) + " could be better</b> &nbsp;·&nbsp; " +
              "<b style=\"color:#d6452f\">" + (s.fail || 0) + " need fixing</b></p>" +
          "</div>" +
        "</section>" +
        "<h2 class=\"sec-title\">What we checked</h2>" +
        "<section class=\"checks\">" + rows + "</section>" +
        "<section class=\"note\"><h3>One important thing: this isn't instant</h3>" +
          "<p>The scan takes seconds — but getting AI engines like ChatGPT, Gemini and Perplexity to actually find, " +
          "trust and recommend you is a slower journey. Once these fixes are in place, AI tools still need to re-crawl " +
          "your site, and trust builds over <strong>weeks to a few months</strong> as your content, reviews and " +
          "reputation grow. This report is your head start, not a magic switch — the sooner you act, the sooner you show up.</p></section>" +
        "<section class=\"cta\"><h3>Want us to fix this for you?</h3>" +
          "<p>We'll handle the technical fixes and get your site AI-ready, so you can focus on your business.</p>" +
          "<p class=\"contact\"><strong>Santi Universe</strong> &nbsp;·&nbsp; santi.co.za &nbsp;·&nbsp; santi@santi.co.za &nbsp;·&nbsp; +27 71 591 4495</p>" +
          "<p class=\"book\"><a href=\"https://santi.co.za/contact.html\">Book a free consultation &rarr;</a></p>" +
        "</section>" +
        "<footer class=\"rfoot\">Generated by the free AEO checker at santi.co.za/aeo.html · Guidance only, not a guarantee.</footer>" +
      "</main></body></html>";
  }

  function reportCss() {
    return "*{box-sizing:border-box}" +
      "body{margin:0;background:#f4f4f5;color:#1a1a1a;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      ".bar{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:16px;background:#111;color:#fff;padding:12px 20px;font-size:14px}" +
      ".bar button{background:#FA814D;color:#fff;border:0;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer}" +
      ".page{max-width:820px;margin:24px auto;background:#fff;padding:48px}" +
      ".rhead{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #FA814D;padding-bottom:18px}" +
      ".brand{font-size:26px;font-weight:800;letter-spacing:-.02em}" +
      ".brand span{color:#FA814D;margin-left:6px;font-weight:500}" +
      ".rhead-meta{text-align:right;font-size:15px;font-weight:600;color:#444}" +
      ".rhead-meta small{color:#999;font-weight:400}" +
      ".meta{display:flex;gap:48px;margin:22px 0 28px;font-size:14px}" +
      ".meta .k{display:block;color:#999;text-transform:uppercase;letter-spacing:.06em;font-size:11px;margin-bottom:3px}" +
      ".meta .v{font-weight:600;word-break:break-all}" +
      ".hero{display:flex;align-items:center;gap:28px;background:#faf7f5;border:1px solid #eee;border-radius:12px;padding:26px;margin-bottom:18px}" +
      ".score{flex:0 0 auto;width:118px;height:118px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}" +
      ".score.s-good{background:#27ae60}.score.s-mid{background:#e8a000}.score.s-low{background:#e74c3c}" +
      ".score .num{font-size:42px;font-weight:800;line-height:1}" +
      ".score .den{font-size:13px;opacity:.85}" +
      ".grade{font-size:30px;font-weight:800;color:#FA814D;line-height:1}" +
      ".verdict{margin:4px 0 8px;font-size:18px;font-weight:600}" +
      ".counts{margin:0;font-size:14px;color:#555}" +
      ".sec-title{font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin:26px 0 14px}" +
      ".r{border:1px solid #eee;border-left:4px solid #ccc;border-radius:8px;padding:16px 18px;margin-bottom:12px;page-break-inside:avoid}" +
      ".r.pass{border-left-color:#27ae60}.r.warn{border-left-color:#f1c40f}.r.fail{border-left-color:#e74c3c}" +
      ".r-top{display:flex;justify-content:space-between;align-items:center;gap:12px}" +
      ".r-name{font-weight:700;font-size:17px}" +
      ".r-pill{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 11px;border-radius:20px;white-space:nowrap;color:#fff}" +
      ".r-pill.pass{background:#27ae60}.r-pill.warn{background:#c9a000}.r-pill.fail{background:#e74c3c}" +
      ".r-plain{margin:9px 0 0;color:#2b2b2b}" +
      ".r-detail{margin:6px 0 0;color:#999;font-size:13px}" +
      ".r-fix{margin:9px 0 0;font-size:14px;color:#2b2b2b}" +
      ".r-fix strong{color:#FA814D}" +
      ".note,.cta{border-radius:10px;padding:22px 24px;margin-top:24px}" +
      ".note{background:#fff7f2;border:1px solid #ffe0cf}" +
      ".note h3,.cta h3{margin:0 0 8px;font-size:19px}" +
      ".cta{background:#111;color:#fff}" +
      ".cta p{margin:6px 0;color:#ddd}" +
      ".cta .contact{font-size:15px}" +
      ".cta .book{margin-top:10px}" +
      ".cta .book a{color:#FA814D;font-weight:700;text-decoration:none}" +
      ".rfoot{margin-top:28px;padding-top:16px;border-top:1px solid #eee;color:#aaa;font-size:12px;text-align:center}" +
      "@media print{body{background:#fff}.no-print{display:none}.page{margin:0;max-width:none;padding:0}@page{margin:14mm}}";
  }

  function setStatus(msg, isError) {
    var s = el("aeo-status");
    s.hidden = false;
    s.className = "aeo-status" + (isError ? " is-error" : "");
    s.innerHTML = isError ? esc(msg) : '<span class="spinner"></span>' + esc(msg);
  }

  // Send the AEO check as a qualified lead (with their score) to n8n.
  function captureAeoLead(email, phone, report) {
    var hook = window.SANTI_LEAD_WEBHOOK || "https://n8n.santi.co.za/webhook/santi-leads";
    var fails = report.checks.filter(function (c) { return c.status === "fail"; }).map(function (c) { return c.label; });
    var warns = report.checks.filter(function (c) { return c.status === "warn"; }).map(function (c) { return c.label; });
    var s = report.summary || {};
    var payload = {
      type: "aeo",
      email: email,
      phone: phone || "",
      url: report.url,
      score: report.score,
      grade: report.grade,
      summary: report.score + "/100 (" + report.grade + ") · " +
        (s.pass || 0) + " pass / " + (s.warn || 0) + " warn / " + (s.fail || 0) + " fail",
      issues: fails.concat(warns).join("; "),
      page: location.href,
      submittedAt: new Date().toISOString()
    };
    // Fire-and-forget — never block showing the user their results
    try {
      fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = el("aeo-form");
    if (!form) return;
    var input = el("aeo-url");
    var emailInput = el("aeo-email");
    var phoneInput = el("aeo-phone");
    var btn = el("aeo-submit");
    var V = window.SantiValidate || {};

    var dl = el("aeo-download");
    if (dl) dl.addEventListener("click", downloadReport);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = (input.value || "").trim();
      if (!url) return;

      // Require a real email + phone before revealing the score
      var em = V.email ? V.email((emailInput ? emailInput.value : ""), { businessOnly: true })
        : { ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((emailInput ? emailInput.value : "").trim()), value: (emailInput ? emailInput.value : "").trim(), msg: "Please enter a valid email." };
      if (!em.ok) { setStatus(em.msg, true); if (emailInput) emailInput.focus(); return; }
      var ph = V.phone ? V.phone(phoneInput ? phoneInput.value : "", true)
        : { ok: !!(phoneInput && phoneInput.value.trim()), value: (phoneInput ? phoneInput.value : "").trim(), msg: "Please enter your phone number." };
      if (!ph.ok) { setStatus(ph.msg, true); if (phoneInput) phoneInput.focus(); return; }
      var email = em.value, phone = ph.value;

      el("aeo-results").hidden = true;
      setStatus("Analyzing " + url + " — reading it the way an AI would…", false);
      btn.disabled = true;

      fetch(resolveEndpoint() + "?url=" + encodeURIComponent(url), {
        method: "GET",
        headers: { Accept: "application/json" },
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok || res.j.error) throw new Error(res.j.error || "We couldn't analyze that site.");
          el("aeo-status").hidden = true;
          captureAeoLead(email, phone, res.j);   // qualified lead + their score -> n8n
          render(res.j);
        })
        .catch(function (err) {
          setStatus(
            (err && err.message ? err.message : "Something went wrong.") +
              " Please check the address and try again.",
            true
          );
        })
        .finally(function () { btn.disabled = false; });
    });
  });
})();
