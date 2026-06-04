/* ============================================================
   Santi Universe — AEO tool front-end
   Talks to the AEO analyzer backend (api/aeo.js).
   ============================================================ */
(function () {
  "use strict";

  // Endpoint resolution:
  //  - window.AEO_ENDPOINT overrides everything (set in the page if you like)
  //  - local preview (Python static server on :8848) -> Node API on :8849
  //  - everywhere else -> same-origin /api/aeo
  function resolveEndpoint() {
    if (window.AEO_ENDPOINT) return window.AEO_ENDPOINT;
    var h = location.hostname;
    // Local dev -> local Node server (api/server.js on :8849)
    if ((h === "localhost" || h === "127.0.0.1") && location.port !== "8849") {
      return "http://localhost:8849/api/aeo";
    }
    // Production -> the AEO analyzer running on n8n
    return "https://n8n.santi.co.za/webhook/aeo-check";
  }

  var ICONS = { pass: "✓", warn: "!", fail: "✕" };
  var LABELS = {
    pass: "Looking good",
    warn: "Needs attention",
    fail: "Action needed",
  };

  function el(id) { return document.getElementById(id); }

  function scoreLabel(score) {
    if (score >= 90) return "Excellent — your site is highly AI-ready.";
    if (score >= 75) return "Good — a few tweaks will make you stand out to AI.";
    if (score >= 55) return "Fair — there's real room to improve how AI reads you.";
    if (score >= 40) return "Needs work — AI is likely missing or misreading key things.";
    return "At risk — AI engines will struggle to understand and recommend you.";
  }

  function render(report) {
    var results = el("aeo-results");
    el("aeo-score").textContent = report.score;
    var ring = document.querySelector(".aeo-score-ring");
    if (ring) ring.style.setProperty("--val", report.score);
    el("aeo-grade").textContent = report.grade;
    el("aeo-score-label").textContent = scoreLabel(report.score);
    el("aeo-url-line").textContent = report.url;

    var list = el("aeo-checklist");
    list.innerHTML = "";
    report.checks
      .slice()
      .sort(function (a, b) {
        var order = { fail: 0, warn: 1, pass: 2 };
        return order[a.status] - order[b.status];
      })
      .forEach(function (c) {
        var li = document.createElement("li");
        li.className = "aeo-check " + c.status;
        li.innerHTML =
          '<span class="mark">' + ICONS[c.status] + "</span>" +
          "<div>" +
          '<div class="c-label">' + esc(c.label) + "</div>" +
          '<div class="c-detail">' + esc(c.detail) + "</div>" +
          (c.status === "pass"
            ? ""
            : '<div class="c-fix"><b>Fix:</b> ' + esc(c.fix) + "</div>") +
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

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var url = (input.value || "").trim();
      if (!url) return;

      // Require a real email + phone before revealing the score
      var em = V.email ? V.email(emailInput ? emailInput.value : "")
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
