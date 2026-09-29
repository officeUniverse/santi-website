/* Onboarding page: exchange the start token for the project, render the live board,
   take the brief, take files. The token is removed from the address bar after the first
   exchange so it cannot leak through a Referer header, a screenshot or a shared history.

   Nothing here decides anything: the questions, the size cap and the accepted file types
   all arrive from the view endpoint, which generates them from src/core/start.js in the
   Santi Office repo. The browser is never the place a rule is enforced. */
(function () {
  "use strict";
  var N8N = "https://n8n.santi.co.za/webhook/";
  var token = new URLSearchParams(location.search).get("t") || "";
  var elStatus = document.getElementById("start-status");
  var elBody = document.getElementById("start-body");
  var view = null;

  function post(path, payload) {
    return fetch(N8N + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function dead() {
    elStatus.textContent = "This link is not valid any more. It may have expired, or it may " +
      "belong to a project that has been closed. Email santi@santi.co.za and we will send a " +
      "fresh one.";
  }

  function text(id, value) { document.getElementById(id).textContent = value || ""; }

  function size(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " bytes";
  }

  function renderTasks(tasks) {
    var list = document.getElementById("start-tasks");
    list.innerHTML = "";
    if (!tasks.length) {
      var none = document.createElement("li");
      none.textContent = "Nothing open right now — Santi is on it.";
      list.appendChild(none);
      return;
    }
    tasks.forEach(function (task) {
      var li = document.createElement("li");
      var what = document.createElement("span");
      what.textContent = task.subject;
      var when = document.createElement("span");
      when.className = "due";
      when.textContent = task.due || task.status;
      li.appendChild(what);
      li.appendChild(when);
      list.appendChild(li);
    });
  }

  function renderFiles(files) {
    var list = document.getElementById("start-files");
    list.innerHTML = "";
    document.getElementById("start-files-empty").hidden = files.length > 0;
    files.forEach(function (file) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = file.name;
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = size(file.bytes) + " · " + file.at;
      li.appendChild(name);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  function renderBrief(data) {
    var submitted = data.briefStatus && data.briefStatus !== "Awaiting";
    document.getElementById("start-brief-form").hidden = submitted;
    document.getElementById("start-brief-intro").hidden = submitted;
    document.getElementById("start-brief-done").hidden = !submitted;
    if (submitted) return;

    var holder = document.getElementById("start-questions");
    holder.innerHTML = "";
    (data.questions || []).forEach(function (question) {
      var wrap = document.createElement("div");
      wrap.className = "start__q";
      var label = document.createElement("label");
      label.setAttribute("for", "q-" + question.key);
      label.textContent = question.label;
      var field = document.createElement("textarea");
      field.id = "q-" + question.key;
      field.name = question.key;
      field.rows = 3;
      wrap.appendChild(label);
      wrap.appendChild(field);
      holder.appendChild(wrap);
    });
  }

  function render(data) {
    view = data;
    // A Project without a customer (an internal one) would otherwise render a bare "Hi".
    document.querySelector(".start__hello").hidden = !data.customer;
    text("start-customer", data.customer);
    text("start-title", data.project || "Your project");
    renderTasks(data.tasks || []);
    renderFiles(data.files || []);
    renderBrief(data);
    elStatus.textContent = "";
    elBody.hidden = false;
  }

  function refresh() {
    return post("santi-start-view", { token: token }).then(function (data) {
      if (data && data.ok) render(data);
      return data;
    });
  }

  // Reads a file as base64 without the data: prefix — the endpoint stores exactly what
  // is sent here, so anything but the payload itself would corrupt the attachment.
  function base64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",").pop()); };
      reader.onerror = function () { reject(new Error("could not read " + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  // One file per request, in sequence: a client dropping ten logos at once should not
  // open ten simultaneous writes against the same project.
  function upload(files, note) {
    var queue = Array.prototype.slice.call(files);
    var failed = [];

    function next() {
      if (!queue.length) {
        note.textContent = failed.length
          ? "Not sent: " + failed.join(", ") + ". Email them to santi@santi.co.za instead."
          : "Received — filed on your project.";
        return refresh();
      }
      var file = queue.shift();
      note.textContent = "Sending " + file.name + "…";
      if (file.size > (view && view.maxUploadBytes ? view.maxUploadBytes : 8388608)) {
        failed.push(file.name + " (too large)");
        return next();
      }
      return base64(file)
        .then(function (data) {
          return post("santi-start-upload", { token: token, fileName: file.name, data: data });
        })
        .then(function (answer) {
          if (!answer || answer.ok !== true) failed.push(file.name + (answer && answer.error ? " (" + answer.error + ")" : ""));
        })
        .catch(function () { failed.push(file.name); })
        .then(next);
    }

    return next();
  }

  if (!/^[0-9a-f]{64}$/.test(token)) { dead(); return; }

  refresh().then(function (data) {
    // Spend the token from the URL the moment it has been used.
    history.replaceState(null, "", location.pathname);
    if (!data || data.ok !== true) { dead(); return; }

    document.getElementById("start-brief-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var note = document.getElementById("start-brief-note");
      var answers = {};
      var filled = false;
      (view.questions || []).forEach(function (question) {
        var value = (document.getElementById("q-" + question.key).value || "").trim();
        answers[question.key] = value;
        if (value) filled = true;
      });
      if (!filled) { note.textContent = "Fill in at least one answer first."; return; }

      note.textContent = "Sending…";
      post("santi-start-brief", { token: token, answers: answers }).then(function (answer) {
        if (!answer || answer.ok !== true) {
          note.textContent = (answer && answer.error ? answer.error + ". " : "") +
            "That did not send. Please email santi@santi.co.za instead.";
          return;
        }
        note.textContent = "";
        refresh();
      }).catch(function () {
        note.textContent = "That did not send. Please email santi@santi.co.za instead.";
      });
    });

    var picker = document.getElementById("start-upload");
    picker.addEventListener("change", function () {
      if (!picker.files || !picker.files.length) return;
      upload(picker.files, document.getElementById("start-upload-note"));
      picker.value = "";
    });
  }).catch(dead);
})();
