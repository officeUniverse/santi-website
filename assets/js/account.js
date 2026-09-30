/* The client account.

   Organised around one question: what does the client need to do next? That answer is a
   card at the top with its button. Everything else lives in four tabs - Plan, Brief,
   Files, Help - so nothing is a long scroll, and every milestone appears once.

   Sign-in is a link emailed to an address ERPNext already holds; there is no password
   here. The session is a signed token the Worker verifies, and the Worker takes the
   customer from that token rather than from anything this page sends - so nothing in
   this file is a security control. It is all presentation. */
(function () {
  "use strict";
  var API = "https://santi-account.zukosanti.workers.dev";
  var KEY = "santi.account.session";
  var EMAIL_KEY = "santi.account.email";

  var el = function (id) { return document.getElementById(id); };
  var all = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
  var views = { signin: el("acc-signin"), list: el("acc-list"), project: el("acc-project") };
  var state = { token: null, email: "", current: null, step: 0, tab: "plan", slot: null, moving: null };

  /* ------------------------------------------------------------------ plumbing */
  function show(name) {
    Object.keys(views).forEach(function (key) { views[key].hidden = key !== name; });
    el("acc-status").hidden = true;
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

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var MONTH_NAMES = ["January","February","March","April","May","June","July","August",
                     "September","October","November","December"];
  var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function pretty(iso) {
    if (!iso) return "";
    var parts = String(iso).split("-");
    return Number(parts[2]) + " " + MONTHS[Number(parts[1]) - 1];
  }
  function span(task) {
    if (!task.start) return "";
    return task.start === task.end ? pretty(task.start) : pretty(task.start) + " – " + pretty(task.end);
  }
  function weekday(iso) { return DAYS[new Date(iso + "T00:00:00Z").getUTCDay()]; }
  function size(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " bytes";
  }
  function holder(task) {
    return task.done ? "Done" : task.waitingOn === "you" ? "Over to you"
      : task.waitingOn === "us" ? "With us" : "Together";
  }
  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ------------------------------------------------------------------- routing */
  // #/p/PROJ-0003            the project, Plan tab
  // #/p/PROJ-0003/brief      a tab
  // #/p/PROJ-0003/m/4        a milestone, so it can be linked and the back button works
  function writeRoute(route) {
    var url = location.pathname + (route || "");
    if (location.pathname + location.hash !== url) history.pushState(null, "", url);
  }
  function projectRoute(suffix) {
    return "#/p/" + encodeURIComponent(state.current.id) + (suffix || "");
  }
  function readRoute() {
    var match = /^#\/p\/([^/]+)(?:\/(plan|brief|files|help)|\/m\/(\d+))?$/.exec(location.hash || "");
    if (!match) return null;
    return { project: decodeURIComponent(match[1]), tab: match[2] || (match[3] ? "plan" : null),
             milestone: match[3] ? Number(match[3]) : null };
  }
  function route() {
    var here = readRoute();
    if (!here) return loadProjects({ push: false });
    return openProject(here.project, { push: false }).then(function () {
      if (!state.current) return;
      setTab(here.tab || "plan", { push: false });
      if (here.milestone) selectStep(here.milestone - 1, { push: false });
    });
  }
  window.addEventListener("popstate", function () { route(); });

  /* ------------------------------------------------------------------- sign in */
  el("acc-signin-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var note = el("acc-signin-note");
    var email = el("acc-email").value.trim();
    if (!email) return;
    note.textContent = "Sending…";
    post("/account/request", { email: email }).then(function (answer) {
      // The same words whether or not the address is ours - on purpose.
      note.textContent = (answer && answer.message)
        || "If that address is on one of our projects, a sign-in link is on its way.";
    }).catch(function () {
      note.textContent = "That did not send. Email santi@santi.co.za and we will sort it out.";
    });
  });

  all("[data-signout]").forEach(function (button) {
    button.addEventListener("click", function () { signedOut(); writeRoute(""); });
  });

  /* -------------------------------------------------------------- project list */
  function loadProjects(options) {
    if (!options || options.push !== false) writeRoute("");
    return post("/account/projects", {}, true).then(function (answer) {
      // Only the Worker saying so signs anyone out. A wobble in n8n used to wipe the
      // session and send the client back to their inbox.
      if (answer && answer.signedOut) { signedOut(); return; }
      var list = el("acc-projects");
      list.innerHTML = "";
      el("acc-who").textContent = state.email;
      show("list");
      if (!answer || answer.ok !== true) {
        list.appendChild(make("li", "acc-muted",
          "Could not load your projects just now. Refresh in a moment, or email santi@santi.co.za."));
        return;
      }
      var projects = answer.projects || [];
      if (!projects.length) {
        list.appendChild(make("li", "acc-muted", "Nothing here yet — a project appears once its deposit is paid."));
        return;
      }
      // One project needs no list: take them straight to it.
      if (projects.length === 1 && (!options || options.auto !== false)) {
        return openProject(projects[0].id);
      }
      projects.forEach(function (project) {
        var li = make("li");
        var button = make("button");
        button.type = "button";
        button.appendChild(make("strong", "", project.name));
        var bits = [];
        if (project.next) bits.push((project.nextWaitingOn === "you" ? "Your next step: " : "Next: ") + project.next);
        if (project.end) bits.push("finishes " + pretty(project.end));
        button.appendChild(make("span", "acc-muted", bits.join(" · ")));
        var mini = make("div", "acc-mini");
        var fill = make("i");
        fill.style.width = project.total ? Math.round(project.done / project.total * 100) + "%" : "0";
        mini.appendChild(fill);
        button.appendChild(mini);
        button.addEventListener("click", function () { openProject(project.id); });
        li.appendChild(button);
        list.appendChild(li);
      });
    });
  }

  el("acc-back").addEventListener("click", function () { loadProjects({ auto: false }); });

  /* --------------------------------------------------------------- one project */
  function openProject(id, options) {
    return post("/account/project", { project: id }, true).then(function (data) {
      if (data && data.signedOut) { signedOut(); return; }
      if (!data || data.ok !== true) { loadProjects({ auto: false }); return; }
      state.current = data;
      if (!options || options.push !== false) writeRoute(projectRoute());
      render(data);
      show("project");
    });
  }

  function render(data) {
    el("acc-name").textContent = data.project;
    el("acc-signedin").textContent = state.email;
    document.title = data.project + " | Santi Universe";
    el("acc-bar").style.width = data.total ? Math.round(data.done / data.total * 100) + "%" : "0";
    el("acc-progress-text").textContent = data.done + " of " + data.total + " done"
      + (data.plannedEnd ? " · finishes " + pretty(data.plannedEnd) : "");

    renderHero(data);
    renderVideo(data.video);
    renderVerdict(data);
    renderRail(data.tasks || []);
    renderMonths(data.tasks || []);
    renderBrief(data);
    renderFiles(data.files || []);
    renderHelp(data);

    // Open the plan on whatever is actually next, not at the top of the list.
    var tasks = data.tasks || [];
    var first = tasks.findIndex(function (t) { return !t.done; });
    selectStep(first < 0 ? tasks.length - 1 : first, { push: false });

    var briefTab = document.querySelector('[data-tab="brief"]');
    briefTab.innerHTML = "Brief";
    if (data.briefStatus === "Awaiting") briefTab.appendChild(make("span", "acc-badge", "1"));
  }

  /* --------------------------------------------------- what to do about a step */
  // Every board names its milestones differently, so actions are matched on what a
  // milestone is about rather than its exact title.
  function actionFor(task) {
    if (!task || task.done || task.waitingOn === "us") return null;
    var subject = task.subject.toLowerCase();
    if (/brief/.test(subject)) return { label: "Fill in your brief", tab: "brief" };
    if (/asset|reference|file|source|data|credential|access/.test(subject)) {
      return { label: "Upload files", tab: "files", pick: true };
    }
    return { label: "Book a call", tab: "help", focus: "acc-meet" };
  }

  function actionButton(action, primary) {
    var button = make("button", primary ? "btn btn--accent" : "btn btn--ghost", action.label);
    button.type = "button";
    button.addEventListener("click", function () {
      setTab(action.tab);
      if (action.pick) el("acc-upload").click();
      if (action.focus) el(action.focus).scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return button;
  }

  function moreTime(task) {
    var button = make("button", "acc-link", "Need more time?");
    button.type = "button";
    button.addEventListener("click", function () { askForDate(task); });
    return button;
  }

  /* ---------------------------------------------------------------------- hero */
  function renderHero(data) {
    var tasks = data.tasks || [];
    var hero = el("acc-hero");
    var actions = el("acc-hero-actions");
    var after = el("acc-hero-after");
    actions.innerHTML = "";
    after.hidden = true;
    after.innerHTML = "";

    var fresh = newlyDone(data);
    el("acc-cheer").hidden = !fresh.length;
    if (fresh.length) {
      el("acc-cheer").textContent = fresh.length === 1
        ? "✓ " + fresh[0] + " — done."
        : "✓ " + fresh.length + " milestones done since you were last here.";
      celebrate();
    }

    var open = tasks.filter(function (t) { return !t.done; });
    var firstIndex = tasks.indexOf(open[0]);
    var mineIndex = tasks.findIndex(function (t) { return !t.done && t.waitingOn !== "us"; });
    var first = open[0];

    if (!first) {
      hero.className = "acc-hero acc-hero--calm";
      el("acc-hero-kicker").textContent = "All milestones done";
      el("acc-hero-title").textContent = "Your project is complete";
      el("acc-hero-detail").textContent = "Thank you. The balance invoice comes with the handover.";
      el("acc-hero-due").textContent = "";
      return;
    }

    if (first.waitingOn === "us") {
      // Nothing is waiting on them - say so plainly, then show what is coming their way.
      hero.className = "acc-hero acc-hero--calm";
      el("acc-hero-kicker").textContent = "Nothing needed from you right now";
      el("acc-hero-title").textContent = "We are working on: " + first.subject;
      el("acc-hero-detail").textContent = first.detail || "";
      el("acc-hero-due").textContent = first.end ? "Until " + pretty(first.end) : "";
      var mine = tasks[mineIndex];
      if (mine) {
        after.hidden = false;
        after.appendChild(document.createTextNode("After that it is over to you: "));
        after.appendChild(make("strong", "", mine.subject));
        if (mine.start) after.appendChild(document.createTextNode(", from " + pretty(mine.start) + "."));
      }
      return;
    }

    hero.className = "acc-hero";
    el("acc-hero-kicker").textContent = "Your next step · Milestone " + (firstIndex + 1) + " of " + tasks.length;
    el("acc-hero-title").textContent = first.subject;
    el("acc-hero-detail").textContent = first.detail || "";
    el("acc-hero-due").textContent = first.end ? "By " + pretty(first.end) : "";
    var action = actionFor(first);
    if (action) actions.appendChild(actionButton(action, true));
    if (first.waitingOn === "you") actions.appendChild(moreTime(first));
  }

  /* --------------------------------------------------------------- celebration */
  // Only news is celebrated: what the client saw last time is kept in their browser and
  // compared, so a milestone gets confetti once and a first visit never pretends five
  // things just happened. Nothing moves for anyone who asked for reduced motion.
  function newlyDone(data) {
    var key = "santi.account.done." + data.id;
    var done = (data.tasks || []).filter(function (t) { return t.done; }).map(function (t) { return t.subject; });
    var before = null;
    try { before = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    try { localStorage.setItem(key, JSON.stringify(done)); } catch (e) {}
    if (!before) return [];
    return done.filter(function (subject) { return before.indexOf(subject) < 0; });
  }

  function celebrate() {
    var canvas = el("acc-confetti");
    if (!canvas || !canvas.getContext) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var context = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = "block";
    var colours = ["#FFD147", "#ffffff", "#7f9cf5", "#03707A"];
    var pieces = [];
    for (var i = 0; i < 120; i += 1) {
      pieces.push({ x: Math.random() * canvas.width, y: canvas.height + Math.random() * 120,
        vx: (Math.random() - 0.5) * 3, vy: -(8 + Math.random() * 7), size: 5 + Math.random() * 7,
        tilt: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
        colour: colours[Math.floor(Math.random() * colours.length)] });
    }
    var started = Date.now();
    (function frame() {
      var elapsed = Date.now() - started;
      context.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (p) {
        p.vy += 0.13; p.x += p.vx; p.y += p.vy; p.tilt += p.spin;
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.tilt);
        context.fillStyle = p.colour;
        context.globalAlpha = Math.max(0, 1 - elapsed / 3200);
        context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        context.restore();
      });
      if (elapsed < 3200) requestAnimationFrame(frame);
      else { context.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = "none"; }
    })();
  }

  /* --------------------------------------------------------------------- video */
  // Hidden entirely until there is something filmed; an empty box above the fold was
  // noise. What may be framed is decided by the server, not here.
  function renderVideo(video) {
    var holder = el("acc-video");
    holder.innerHTML = "";
    holder.hidden = !(video && video.src);
    if (holder.hidden) return;
    if (video.kind === "file") {
      var player = make("video");
      player.src = video.src;
      player.controls = true;
      player.preload = "metadata";
      if (video.poster) player.poster = video.poster;
      holder.appendChild(player);
      return;
    }
    var frame = make("iframe");
    frame.src = video.src;
    frame.title = video.title || "Welcome video";
    frame.loading = "lazy";
    frame.allow = "encrypted-media; picture-in-picture; fullscreen";
    frame.setAttribute("allowfullscreen", "allowfullscreen");
    frame.setAttribute("referrerpolicy", "no-referrer");
    holder.appendChild(frame);
  }

  /* ---------------------------------------------------------------------- tabs */
  function setTab(name, options) {
    state.tab = name;
    all("[data-tab]").forEach(function (tab) {
      tab.setAttribute("aria-selected", String(tab.getAttribute("data-tab") === name));
    });
    all("[data-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-panel") !== name;
    });
    if (name === "help") loadSlots();
    if (state.current && (!options || options.push !== false)) {
      writeRoute(projectRoute(name === "plan" ? "" : "/" + name));
    }
  }
  all("[data-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () { setTab(tab.getAttribute("data-tab")); });
  });

  /* ---------------------------------------------------------------------- plan */
  function renderVerdict(data) {
    var box = el("acc-verdict");
    var verdict = data.verdict || {};
    box.hidden = !(data.target && verdict.message);
    if (box.hidden) return;
    box.innerHTML = "";
    box.appendChild(make("strong", "", verdict.status === "rush" ? "Your date is tighter than our plan"
      : verdict.status === "relaxed" ? "You have given us room — and that earns a discount"
      : "Your date and our plan agree"));
    box.appendChild(document.createTextNode(verdict.message + " You asked for " + pretty(data.target)
      + "; the plan finishes " + pretty(data.plannedEnd) + "."));
  }

  function renderRail(tasks) {
    var rail = el("acc-rail");
    rail.innerHTML = "";
    tasks.forEach(function (task, index) {
      var li = make("li");
      var dot = make("span", "acc-dot" + (task.done ? " acc-dot--done" : task.waitingOn === "you" ? " acc-dot--you" : ""),
        task.done ? "✓" : String(index + 1));
      var body = make("div");
      body.appendChild(make("strong", "", task.subject));
      body.appendChild(make("small", "", holder(task) + (!task.done && task.start ? " · " + pretty(task.start) : "")));
      li.appendChild(dot);
      li.appendChild(body);
      li.addEventListener("click", function () { selectStep(index); });
      rail.appendChild(li);
    });
  }

  function selectStep(index, options) {
    var tasks = (state.current && state.current.tasks) || [];
    var task = tasks[index];
    if (!task) return;
    state.step = index;
    all("#acc-rail li").forEach(function (li, position) {
      li.setAttribute("aria-current", String(position === index));
    });
    var tag = el("acc-step-tag");
    tag.textContent = holder(task);
    tag.className = "acc-tag" + (task.done ? " acc-tag--done" : task.waitingOn === "you" ? " acc-tag--you" : "");
    el("acc-step-title").textContent = task.subject;
    el("acc-step-detail").textContent = task.detail || "";
    el("acc-step-when").textContent = task.done ? "" : (task.start ? span(task) : "Not scheduled yet");
    el("acc-step-count").textContent = (index + 1) + " of " + tasks.length;

    var actions = el("acc-step-actions");
    actions.innerHTML = "";
    var action = actionFor(task);
    if (action) actions.appendChild(actionButton(action, true));
    if (!task.done && task.waitingOn === "you") actions.appendChild(moreTime(task));

    el("acc-prev").disabled = index === 0;
    el("acc-next").disabled = index === tasks.length - 1;
    if (!options || options.push !== false) writeRoute(projectRoute("/m/" + (index + 1)));
  }
  el("acc-prev").addEventListener("click", function () { selectStep(state.step - 1); });
  el("acc-next").addEventListener("click", function () { selectStep(state.step + 1); });

  function renderMonths(tasks) {
    var holder_ = el("acc-months");
    holder_.innerHTML = "";
    var order = [];
    var groups = {};
    tasks.forEach(function (task, index) {
      if (!task.start) return;
      var key = task.start.slice(0, 7);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push({ task: task, index: index });
    });
    order.forEach(function (key) {
      var column = make("div", "acc-month");
      column.appendChild(make("h4", "", MONTH_NAMES[Number(key.slice(5, 7)) - 1] + " " + key.slice(0, 4)));
      var yours = groups[key].filter(function (e) { return e.task.waitingOn === "you"; }).length;
      column.appendChild(make("small", "", groups[key].length + (groups[key].length === 1 ? " milestone" : " milestones")
        + (yours ? " · " + yours + " for you" : "")));
      groups[key].forEach(function (entry) {
        var card = make("div", "acc-mcard" + (entry.task.done ? " acc-mcard--done"
          : entry.task.waitingOn === "you" ? " acc-mcard--you" : ""));
        card.appendChild(make("strong", "", entry.task.subject));
        card.appendChild(make("small", "", span(entry.task) + " · " + holder(entry.task)));
        card.addEventListener("click", function () { setPlanView("steps"); selectStep(entry.index); });
        column.appendChild(card);
      });
      holder_.appendChild(column);
    });
    if (!order.length) holder_.appendChild(make("p", "acc-muted", "The plan is drawn up overnight — check back tomorrow."));
  }

  function setPlanView(name) {
    all("[data-planview]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-planview") === name));
    });
    el("acc-steps").hidden = name !== "steps";
    el("acc-months").hidden = name !== "months";
  }
  all("[data-planview]").forEach(function (button) {
    button.addEventListener("click", function () { setPlanView(button.getAttribute("data-planview")); });
  });

  /* --------------------------------------------------------------- move a date */
  // A dialog, because moving a date moves everything after it - that deserves a
  // sentence of explanation, not a picker that fires on change.
  function askForDate(task) {
    state.moving = task;
    el("acc-move-title").textContent = "Move: " + task.subject;
    el("acc-move-date").value = task.start || "";
    el("acc-move-note").textContent = "";
    var dialog = el("acc-move");
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "open");
  }
  function closeDialog() {
    var dialog = el("acc-move");
    if (dialog.close) dialog.close(); else dialog.removeAttribute("open");
    state.moving = null;
  }
  el("acc-move-cancel").addEventListener("click", closeDialog);
  el("acc-move-save").addEventListener("click", function () {
    var note = el("acc-move-note");
    var wanted = el("acc-move-date").value;
    if (!wanted) { note.textContent = "Pick a date first."; return; }
    note.textContent = "Moving…";
    post("/account/move", { project: state.current.id, step: state.moving.subject, date: wanted }, true)
      .then(function (answer) {
        if (!answer || answer.ok !== true) { note.textContent = (answer && answer.error) || "That date did not work."; return; }
        closeDialog();
        openProject(state.current.id, { push: false });
      });
  });

  /* --------------------------------------------------------------------- brief */
  function renderBrief(data) {
    var submitted = data.briefStatus && data.briefStatus !== "Awaiting";
    el("acc-brief-open").hidden = submitted;
    el("acc-brief-done").hidden = !submitted;
    if (submitted) return;
    var holder_ = el("acc-questions");
    holder_.innerHTML = "";
    (data.questions || []).forEach(function (question) {
      var wrap = make("div", "acc-q");
      var label = make("label", "", question.label);
      label.setAttribute("for", "aq-" + question.key);
      var field = make(question.type === "date" ? "input" : "textarea");
      if (question.type === "date") field.type = "date"; else field.rows = 3;
      field.id = "aq-" + question.key;
      wrap.appendChild(label);
      wrap.appendChild(field);
      if (question.type !== "date") wrap.appendChild(improver(question, field));
      holder_.appendChild(wrap);
    });
  }

  // A suggestion beside their words, never on top of them; accepting is a decision.
  function improver(question, field) {
    var wrap = make("div");
    var button = make("button", "acc-link", "Improve this");
    button.type = "button";
    button.style.marginTop = ".45rem";
    var note = make("p", "acc-note");
    var box = make("div", "acc-suggest");
    box.hidden = true;
    button.addEventListener("click", function () {
      var text = (field.value || "").trim();
      if (!text) { note.textContent = "Write something first and this will tidy it up."; return; }
      note.textContent = "Reading it…";
      box.hidden = true;
      post("/account/improve", { project: state.current.id, question: question.label, text: text }, true)
        .then(function (answer) {
          if (!answer || answer.ok !== true || !answer.text) {
            note.textContent = (answer && answer.error) || "Could not do that one.";
            return;
          }
          note.textContent = "";
          box.innerHTML = "";
          box.appendChild(make("small", "acc-muted", "A tidier version of your own words — nothing added:"));
          box.appendChild(make("p", "", answer.text));
          var use = make("button", "btn btn--ghost", "Use this");
          use.type = "button";
          use.addEventListener("click", function () {
            field.value = answer.text;
            box.hidden = true;
            note.textContent = "Swapped in — edit it as much as you like.";
          });
          var keep = make("button", "acc-link acc-link--quiet", "Keep mine");
          keep.type = "button";
          keep.style.marginLeft = "1rem";
          keep.addEventListener("click", function () { box.hidden = true; });
          box.appendChild(use);
          box.appendChild(keep);
          box.hidden = false;
        });
    });
    wrap.appendChild(button);
    wrap.appendChild(note);
    wrap.appendChild(box);
    return wrap;
  }

  el("acc-brief-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var note = el("acc-brief-note");
    var answers = {};
    var filled = false;
    (state.current.questions || []).forEach(function (question) {
      var value = (el("aq-" + question.key).value || "").trim();
      answers[question.key] = value;
      if (value) filled = true;
    });
    if (!filled) { note.textContent = "Fill in at least one answer first."; return; }
    note.textContent = "Sending…";
    post("/account/brief", { project: state.current.id, answers: answers }, true).then(function (answer) {
      if (!answer || answer.ok !== true) {
        note.textContent = (answer && answer.error ? answer.error + ". " : "") + "That did not send — email santi@santi.co.za.";
        return;
      }
      note.textContent = "";
      openProject(state.current.id, { push: false }).then(function () { setTab("brief", { push: false }); });
    });
  });

  /* --------------------------------------------------------------------- files */
  function renderFiles(files) {
    var list = el("acc-files");
    list.innerHTML = "";
    files.forEach(function (file) {
      var li = make("li");
      li.appendChild(make("span", "", file.name));
      li.appendChild(make("small", "", size(file.bytes) + " · " + file.at));
      list.appendChild(li);
    });
    if (!files.length) list.appendChild(make("li", "acc-muted", "Nothing received yet."));
  }

  // One file per request, in order: ten dropped logos should not open ten writes at once.
  function upload(files) {
    var note = el("acc-upload-note");
    var queue = Array.prototype.slice.call(files);
    var failed = [];
    function next() {
      if (!queue.length) {
        note.textContent = failed.length
          ? "Not sent: " + failed.join(", ") + ". Email them to santi@santi.co.za instead."
          : "Received — filed on your project.";
        return openProject(state.current.id, { push: false }).then(function () { setTab("files", { push: false }); });
      }
      var file = queue.shift();
      note.textContent = "Sending " + file.name + "…";
      if (file.size > (state.current.maxUploadBytes || 8388608)) { failed.push(file.name + " (too large)"); return next(); }
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(",").pop()); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }).then(function (data) {
        return post("/account/upload", { project: state.current.id, fileName: file.name, data: data }, true);
      }).then(function (answer) {
        if (!answer || answer.ok !== true) failed.push(file.name + (answer && answer.error ? " (" + answer.error + ")" : ""));
      }).catch(function () { failed.push(file.name); }).then(next);
    }
    return next();
  }

  var picker = el("acc-upload");
  picker.addEventListener("change", function () {
    if (picker.files && picker.files.length && state.current) upload(picker.files);
    picker.value = "";
  });
  var drop = el("acc-drop");
  drop.addEventListener("click", function () { picker.click(); });
  drop.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); picker.click(); }
  });
  ["dragenter", "dragover"].forEach(function (type) {
    drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.add("acc-drop--over"); });
  });
  ["dragleave", "drop"].forEach(function (type) {
    drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.remove("acc-drop--over"); });
  });
  drop.addEventListener("drop", function (event) {
    if (event.dataTransfer && event.dataTransfer.files.length) upload(event.dataTransfer.files);
  });

  /* ---------------------------------------------------------------------- help */
  function renderHelp(data) {
    el("acc-rates").textContent = (data.rates && data.rates.message) || "";
    var list = el("acc-requests");
    list.innerHTML = "";
    (data.requests || []).forEach(function (request) {
      var li = make("li");
      li.appendChild(document.createTextNode(request.subject));
      li.appendChild(make("small", "", request.status === "With Santi"
        ? "With Santi — he will come back to you before anything starts"
        : request.status));
      list.appendChild(li);
    });
    var helpTab = document.querySelector('[data-tab="help"]');
    helpTab.innerHTML = "Help";
    if ((data.requests || []).length) helpTab.appendChild(make("span", "acc-badge", String(data.requests.length)));
  }

  // Slots are fetched fresh each time: the calendar moves, and a stale list offers a
  // time that is already gone.
  function loadSlots() {
    if (!state.current) return;
    var holder_ = el("acc-slots");
    holder_.innerHTML = "";
    el("acc-booking").hidden = true;
    post("/account/slots", { project: state.current.id }, true).then(function (answer) {
      var slots = (answer && answer.slots) || [];
      if (!slots.length) {
        holder_.appendChild(make("p", "acc-muted", "Nothing open in the next three weeks — email santi@santi.co.za and we will make room."));
        return;
      }
      slots.slice(0, 8).forEach(function (slot) {
        var button = make("button", "", weekday(slot.date) + " " + pretty(slot.date) + ", " + slot.time);
        button.type = "button";
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", function () {
          state.slot = slot;
          all("#acc-slots button").forEach(function (other) { other.setAttribute("aria-pressed", String(other === button)); });
          el("acc-booking").hidden = false;
          el("acc-book-note").textContent = "";
          el("acc-agenda").focus();
        });
        holder_.appendChild(button);
      });
    });
  }

  // Two stages on purpose: a click that booked outright gave nobody the chance to say
  // what the call was for.
  el("acc-book").addEventListener("click", function () {
    var note = el("acc-book-note");
    var agenda = (el("acc-agenda").value || "").trim();
    if (!state.slot) { note.textContent = "Pick a time first."; return; }
    if (!agenda) { note.textContent = "Tell us what to cover — even one line."; el("acc-agenda").focus(); return; }
    note.textContent = "Booking…";
    post("/account/book", { project: state.current.id, slot: state.slot.start, email: state.email, note: agenda }, true)
      .then(function (answer) {
        if (!answer || answer.ok !== true) { note.textContent = (answer && answer.error) || "That did not book."; loadSlots(); return; }
        note.textContent = "Booked for " + weekday(state.slot.date) + " " + pretty(state.slot.date) + " at "
          + state.slot.time + ". A confirmation is on its way.";
        state.slot = null;
        el("acc-agenda").value = "";
        loadSlots();
      });
  });

  el("acc-ask-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var note = el("acc-ask-note");
    var subject = (el("acc-ask-subject").value || "").trim();
    if (!subject) { note.textContent = "Say what you need, even roughly."; return; }
    note.textContent = "Sending…";
    post("/account/ask", { project: state.current.id, subject: subject, detail: (el("acc-ask-detail").value || "").trim() }, true)
      .then(function (answer) {
        if (!answer || answer.ok !== true) { note.textContent = (answer && answer.error) || "That did not send."; return; }
        el("acc-ask-subject").value = "";
        el("acc-ask-detail").value = "";
        note.textContent = "Sent. Santi has it and will come back to you before anything starts.";
        openProject(state.current.id, { push: false }).then(function () { setTab("help", { push: false }); });
      });
  });

  /* ---------------------------------------------------------------------- boot */
  try { state.email = localStorage.getItem(EMAIL_KEY) || ""; } catch (e) {}
  var key = new URLSearchParams(location.search).get("k");
  if (key) {
    post("/account/session", { key: key }).then(function (answer) {
      // Drop the key from the address bar but keep any page they were linked to.
      history.replaceState(null, "", location.pathname + location.hash);
      if (!answer || answer.ok !== true) {
        signedOut();
        el("acc-signin-note").textContent = "That sign-in link has expired. Enter your email for a fresh one.";
        return;
      }
      store(answer.token);
      state.email = answer.email || "";
      try { localStorage.setItem(EMAIL_KEY, state.email); } catch (e) {}
      route();
    }).catch(signedOut);
  } else if (stored()) {
    state.token = stored();
    route().catch(signedOut);
  } else {
    signedOut();
  }
})();
