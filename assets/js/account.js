/* The client account.

   Three states, one page: signed out, list of projects, one project. Sign-in is a link
   emailed to an address ERPNext already holds — there is no password here to forget,
   leak or reset.

   The session token lives in localStorage and is sent as a bearer to the account Worker.
   It is signed, so the browser cannot edit who it belongs to; the Worker takes the
   customer from the token and ignores anything the page claims about identity. Which
   means nothing here is a security control — it is all presentation. */
(function () {
  "use strict";
  var API = "https://santi-account.zukosanti.workers.dev";
  var KEY = "santi.account.session";

  var el = function (id) { return document.getElementById(id); };
  var status = el("acct-status");
  var views = { signin: el("acct-signin"), list: el("acct-list"), project: el("acct-project") };
  var state = { token: null, projects: [], current: null };

  function show(name) {
    Object.keys(views).forEach(function (key) { views[key].hidden = key !== name; });
    status.textContent = "";
  }

  function store(token) {
    state.token = token;
    try { token ? localStorage.setItem(KEY, token) : localStorage.removeItem(KEY); } catch (e) {}
  }

  function stored() {
    try { return localStorage.getItem(KEY) || null; } catch (e) { return null; }
  }

  function post(path, payload, auth) {
    var headers = { "Content-Type": "application/json" };
    if (auth && state.token) headers.Authorization = "Bearer " + state.token;
    return fetch(API + path, { method: "POST", headers: headers, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function signedOut() {
    store(null);
    show("signin");
  }

  function money(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " bytes";
  }

  /* ---------------------------------------------------------------- sign in */
  el("acct-signin-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var note = el("acct-signin-note");
    var email = el("acct-email").value.trim();
    if (!email) return;
    note.textContent = "Sending…";
    post("/account/request", { email: email }).then(function (answer) {
      // The same answer whether or not we know the address — on purpose.
      note.textContent = (answer && answer.message) ||
        "If that address is on one of our projects, a sign-in link is on its way.";
    }).catch(function () {
      note.textContent = "That did not send. Email santi@santi.co.za and we will sort it out.";
    });
  });

  /* ---------------------------------------------------------------- projects */
  function loadProjects() {
    return post("/account/projects", {}, true).then(function (answer) {
      if (!answer || answer.ok !== true) { signedOut(); return; }
      state.projects = answer.projects || [];
      var list = el("acct-projects");
      list.innerHTML = "";
      if (!state.projects.length) {
        var empty = document.createElement("li");
        empty.className = "acct__fine";
        empty.textContent = "Nothing here yet. Once a deposit is paid, the project appears here.";
        list.appendChild(empty);
      }
      state.projects.forEach(function (project) {
        var li = document.createElement("li");
        var button = document.createElement("button");
        button.type = "button";
        var name = document.createElement("strong");
        name.textContent = project.name;
        var meta = document.createElement("span");
        meta.textContent = project.status +
          (project.briefStatus === "Awaiting" ? " · brief still needed" : " · brief received");
        button.appendChild(name);
        button.appendChild(meta);
        button.addEventListener("click", function () { openProject(project.id); });
        li.appendChild(button);
        list.appendChild(li);
      });
      show("list");
    });
  }

  /* ---------------------------------------------------------------- one project */
  function renderSteps(tasks) {
    var list = el("acct-steps");
    list.innerHTML = "";
    tasks.forEach(function (task) {
      var li = document.createElement("li");
      if (task.done) li.className = "done";

      var tick = document.createElement("span");
      tick.className = "tick" + (task.done ? " tick--done" : "");
      tick.textContent = task.done ? "✓" : "";

      var body = document.createElement("div");
      var name = document.createElement("strong");
      name.textContent = task.subject;
      body.appendChild(name);
      if (task.detail) {
        var detail = document.createElement("span");
        detail.className = "detail";
        detail.textContent = task.detail;
        body.appendChild(detail);
      }

      var who = document.createElement("span");
      if (task.done) {
        who.className = "acct__who acct__who--us";
        who.textContent = "Done";
      } else if (task.waitingOn === "you") {
        who.className = "acct__who acct__who--you";
        who.textContent = "Over to you";
      } else {
        who.className = "acct__who acct__who--us";
        who.textContent = task.waitingOn === "us" ? "With us" : "Together";
      }

      li.appendChild(tick);
      li.appendChild(body);
      li.appendChild(who);
      list.appendChild(li);
    });
  }

  function renderBrief(data) {
    var submitted = data.briefStatus && data.briefStatus !== "Awaiting";
    el("acct-brief-form").hidden = submitted;
    el("acct-brief-intro").hidden = submitted;
    el("acct-brief-done").hidden = !submitted;
    if (submitted) return;

    var holder = el("acct-questions");
    holder.innerHTML = "";
    (data.questions || []).forEach(function (question) {
      var wrap = document.createElement("div");
      wrap.className = "acct__q";
      var label = document.createElement("label");
      label.setAttribute("for", "aq-" + question.key);
      label.textContent = question.label;
      var field = document.createElement("textarea");
      field.id = "aq-" + question.key;
      field.rows = 3;
      wrap.appendChild(label);
      wrap.appendChild(field);
      holder.appendChild(wrap);
    });
  }

  function renderFiles(files) {
    var list = el("acct-files");
    list.innerHTML = "";
    el("acct-files-empty").hidden = files.length > 0;
    files.forEach(function (file) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = file.name;
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = money(file.bytes) + " · " + file.at;
      li.appendChild(name);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  function openProject(id) {
    return post("/account/project", { project: id }, true).then(function (data) {
      if (!data || data.ok !== true) { loadProjects(); return; }
      state.current = data;
      el("acct-project-name").textContent = data.project;
      el("acct-progress").textContent = data.done + " of " + data.total + " steps done";
      el("acct-bar").style.width = data.total ? Math.round((data.done / data.total) * 100) + "%" : "0";
      renderSteps(data.tasks || []);
      renderBrief(data);
      renderFiles(data.files || []);
      show("project");
      window.scrollTo(0, 0);
    });
  }

  el("acct-back").addEventListener("click", function () { loadProjects(); });

  el("acct-brief-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var note = el("acct-brief-note");
    var answers = {};
    var filled = false;
    ((state.current || {}).questions || []).forEach(function (question) {
      var value = (el("aq-" + question.key).value || "").trim();
      answers[question.key] = value;
      if (value) filled = true;
    });
    if (!filled) { note.textContent = "Fill in at least one answer first."; return; }
    note.textContent = "Sending…";
    post("/account/brief", { project: state.current.id, answers: answers }, true)
      .then(function (answer) {
        if (!answer || answer.ok !== true) {
          note.textContent = (answer && answer.error ? answer.error + ". " : "") +
            "That did not send. Please email santi@santi.co.za instead.";
          return;
        }
        note.textContent = "";
        openProject(state.current.id);
      });
  });

  // One file per request, in sequence: ten dropped logos should not open ten writes
  // against the same project at once.
  function upload(files) {
    var note = el("acct-upload-note");
    var queue = Array.prototype.slice.call(files);
    var failed = [];

    function next() {
      if (!queue.length) {
        note.textContent = failed.length
          ? "Not sent: " + failed.join(", ") + ". Email them to santi@santi.co.za instead."
          : "Received — filed on your project.";
        return openProject(state.current.id);
      }
      var file = queue.shift();
      note.textContent = "Sending " + file.name + "…";
      if (file.size > (state.current.maxUploadBytes || 8388608)) {
        failed.push(file.name + " (too large)");
        return next();
      }
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(",").pop()); };
        reader.onerror = function () { reject(new Error("unreadable")); };
        reader.readAsDataURL(file);
      }).then(function (data) {
        return post("/account/upload", { project: state.current.id, fileName: file.name, data: data }, true);
      }).then(function (answer) {
        if (!answer || answer.ok !== true) {
          failed.push(file.name + (answer && answer.error ? " (" + answer.error + ")" : ""));
        }
      }).catch(function () { failed.push(file.name); }).then(next);
    }

    return next();
  }

  var picker = el("acct-upload");
  picker.addEventListener("change", function () {
    if (!picker.files || !picker.files.length || !state.current) return;
    upload(picker.files);
    picker.value = "";
  });

  [el("acct-signout"), el("acct-signout-2")].forEach(function (button) {
    button.addEventListener("click", signedOut);
  });

  /* ---------------------------------------------------------------- boot */
  var key = new URLSearchParams(location.search).get("k");
  if (key) {
    // Arrived from the sign-in email. Spend the key, keep the session, clean the URL so
    // the link cannot be re-shared out of a browser history or a screenshot.
    post("/account/session", { key: key }).then(function (answer) {
      history.replaceState(null, "", location.pathname);
      if (!answer || answer.ok !== true) {
        signedOut();
        el("acct-signin-note").textContent =
          "That sign-in link has expired. Enter your email and we will send a fresh one.";
        return;
      }
      store(answer.token);
      el("acct-who").textContent = answer.email || "";
      loadProjects();
    }).catch(signedOut);
  } else if (stored()) {
    state.token = stored();
    loadProjects().catch(signedOut);
  } else {
    signedOut();
  }
})();
