/* Quote page: exchange the token for the quote, render it, take a question.
   The token is removed from the address bar after the first exchange so it cannot
   leak through a Referer header, a screenshot, or a shared browser history. */
(function () {
  "use strict";
  var N8N = "https://n8n.santi.co.za/webhook/";
  var token = new URLSearchParams(location.search).get("t") || "";
  var elStatus = document.getElementById("quote-status");
  var elBody = document.getElementById("quote-body");

  function post(path, payload) {
    return fetch(N8N + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function money(value) {
    var n = Number(value);
    if (!isFinite(n)) return "";
    return "R" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function dead() {
    elStatus.textContent = "This quote link is not valid any more. It may have expired, or a newer " +
      "quote may have replaced it. Reply to your quote email and we will send a fresh one.";
  }

  function text(id, value) { document.getElementById(id).textContent = value || ""; }

  if (!/^[0-9a-f]{64}$/.test(token)) { dead(); return; }

  post("santi-quote-view", { token: token }).then(function (quote) {
    // Spend the token from the URL the moment it has been used.
    history.replaceState(null, "", location.pathname);

    if (!quote || quote.ok === false || !quote.depositAmount) { dead(); return; }

    elStatus.textContent = "";
    text("quote-customer", quote.customer);
    text("quote-title", quote.title || "Your quote");
    text("quote-total", money(quote.grandTotal));
    text("quote-deposit", money(quote.depositAmount));
    text("quote-expires", quote.expires);
    document.getElementById("quote-pay").href = quote.payUrl;

    var rows = document.getElementById("quote-lines");
    (quote.items || []).forEach(function (item) {
      var tr = document.createElement("tr");
      tr.innerHTML = "<td></td><td></td><td></td>";
      tr.children[0].textContent = item.description;
      tr.children[1].textContent = item.qty;
      tr.children[2].textContent = money(item.amount);
      rows.appendChild(tr);
    });

    elBody.hidden = false;

    document.getElementById("quote-ask-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var field = document.getElementById("quote-question");
      var note = document.getElementById("quote-ask-status");
      var question = field.value.trim();
      if (!question) return;
      note.textContent = "Sending…";
      post("santi-quote-ask", { token: token, question: question }).then(function () {
        field.value = "";
        note.textContent = "Sent. Santi will reply by email.";
      }).catch(function () {
        note.textContent = "That did not send. Please email santi@santi.co.za instead.";
      });
    });
  }).catch(dead);
})();
