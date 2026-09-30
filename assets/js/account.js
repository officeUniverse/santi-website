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

  // Each view has an address. A milestone is a page in every sense that matters to a
  // person: it can be linked, bookmarked, and the back button does what they expect
  // rather than dumping them out of the account. The hash carries it because the site is
  // static - there is no server to route paths - and a hash is never sent to anyone.
  function writeRoute(route, replace) {
    var url = location.pathname + (route || "");
    if (replace) history.replaceState(null, "", url);
    else if (location.pathname + location.hash !== url) history.pushState(null, "", url);
  }

  function readRoute() {
    var match = /^#\/p\/([^/]+)(?:\/m\/(\d+))?$/.exec(location.hash || "");
    if (!match) return null;
    return { project: decodeURIComponent(match[1]), milestone: match[2] ? Number(match[2]) : null };
  }

  function route() {
    var here = readRoute();
    if (!here) return loadProjects({ push: false });
    return openProject(here.project, { push: false }).then(function () {
      if (!state.current) return;
      if (here.milestone) openStep(here.milestone - 1, { push: false });
      else closeStep({ push: false });
    });
  }

  window.addEventListener("popstate", function () { route(); });

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

  /* ------------------------------------------------------------- celebration */
  // Hand-rolled, about forty lines, because a confetti library is 15KB to do this and
  // this page already loads enough. It respects prefers-reduced-motion: a client who has
  // asked their computer to stop moving things has asked us too.
  function celebrate() {
    var canvas = el("acct-confetti");
    if (!canvas || !canvas.getContext) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var context = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = "block";

    var colours = ["#FFD147", "#ffffff", "#7f9cf5", "#03707A"];
    var pieces = [];
    for (var i = 0; i < 120; i += 1) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: canvas.height + Math.random() * 120,          // rises from the bottom
        vx: (Math.random() - 0.5) * 3,
        vy: -(8 + Math.random() * 7),
        size: 5 + Math.random() * 7,
        tilt: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        colour: colours[Math.floor(Math.random() * colours.length)]
      });
    }

    var started = Date.now();
    (function frame() {
      var elapsed = Date.now() - started;
      context.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (piece) {
        piece.vy += 0.13;                                 // gravity takes them back down
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.tilt += piece.spin;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.tilt);
        context.fillStyle = piece.colour;
        context.globalAlpha = Math.max(0, 1 - elapsed / 3200);
        context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
        context.restore();
      });
      if (elapsed < 3200) {
        requestAnimationFrame(frame);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = "none";
      }
    })();
  }

  // What was done last time this client looked. Kept per project in their own browser:
  // it decides whether something is NEWS, and news is the only thing worth celebrating.
  function seenKey(id) { return "santi.account.done." + id; }

  function newlyDone(data) {
    var done = (data.tasks || []).filter(function (t) { return t.done; })
      .map(function (t) { return t.subject; });
    var before = null;
    try { before = JSON.parse(localStorage.getItem(seenKey(data.id)) || "null"); } catch (e) {}
    try { localStorage.setItem(seenKey(data.id), JSON.stringify(done)); } catch (e) {}
    if (!before) return [];                               // first visit is not an achievement
    return done.filter(function (subject) { return before.indexOf(subject) < 0; });
  }

  /* ---------------------------------------------------------------- sign in */
  el("acct-signin-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var note = el("acct-signin-note");
    var email = el("acct-email").value.trim();
    if (!email) return;
    note.textContent = "Sending…";
    post("/account/ask", { email: email }).then(function (answer) {
      // The same answer whether or not we know the address — on purpose.
      note.textContent = (answer && answer.message) ||
        "If that address is on one of our projects, a sign-in link is on its way.";
    }).catch(function () {
      note.textContent = "That did not send. Email santi@santi.co.za and we will sort it out.";
    });
  });

  /* ---------------------------------------------------------------- projects */
  function loadProjects(options) {
    if (!options || options.push !== false) writeRoute("");
    return post("/account/projects", {}, true).then(function (answer) {
      // Only a Worker that says "signedOut" signs anyone out. A 502 from a wobbling
      // n8n used to throw the client back to the sign-in form and wipe their session,
      // which turns a ten-second blip into "please check your email again".
      if (answer && answer.signedOut) { signedOut(); return; }
      if (!answer || answer.ok !== true) {
        show("list");
        status.textContent = "";
        el("acct-projects").innerHTML = "";
        var problem = document.createElement("li");
        problem.className = "acct__fine";
        problem.textContent = "Could not load your projects just now. Refresh in a moment, "
          + "or email santi@santi.co.za if it keeps happening.";
        el("acct-projects").appendChild(problem);
        return;
      }
      state.projects = answer.projects || [];
      // Also on a returning visit, not only straight after clicking the sign-in link:
      // a page that cannot say who you are looks like a page you are not signed in to.
      el("acct-who").textContent = state.email || "";
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
        var bits = [];
        if (project.total) bits.push(project.done + " of " + project.total + " milestones done");
        if (project.next) {
          bits.push((project.nextWaitingOn === "you" ? "over to you: " : "next: ") + project.next);
        }
        if (project.end) bits.push("finishes " + pretty(project.end));
        meta.textContent = bits.join(" · ") ||
          (project.briefStatus === "Awaiting" ? "brief still needed" : "brief received");
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

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function pretty(iso) {
    if (!iso) return "";
    var parts = String(iso).split("-");
    return Number(parts[2]) + " " + MONTHS[Number(parts[1]) - 1];
  }

  // The date lives in a real dialog rather than an inline field: moving a date is a
  // decision with consequences for everything behind it, and that deserves a moment's
  // pause and a sentence of explanation, not a picker that fires on change.
  function moveControl(task) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "acct__move";
    button.textContent = "Need a different date?";
    button.addEventListener("click", function () { askForDate(task); });
    return button;
  }

  function askForDate(task) {
    var dialog = el("acct-move");
    el("acct-move-title").textContent = "Move: " + task.subject;
    el("acct-move-date").value = task.start || "";
    el("acct-move-note").textContent = "";
    state.moving = task;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "open");
  }

  function closeDialog() {
    var dialog = el("acct-move");
    if (dialog.close) dialog.close(); else dialog.removeAttribute("open");
    state.moving = null;
  }

  el("acct-move-cancel").addEventListener("click", closeDialog);
  el("acct-move-save").addEventListener("click", function () {
    var note = el("acct-move-note");
    var wanted = el("acct-move-date").value;
    if (!wanted) { note.textContent = "Pick a date first."; return; }
    note.textContent = "Moving…";
    post("/account/move", { project: state.current.id, step: state.moving.subject, date: wanted }, true)
      .then(function (answer) {
        if (!answer || answer.ok !== true) {
          note.textContent = (answer && answer.error) || "That date did not work.";
          return;
        }
        closeDialog();
        openProject(state.current.id);
      });
  });

  // A plain bar per step across the project's own span. Weekends are not drawn as gaps -
  // the dates already skip them, and pretending to render a calendar grid on a phone is
  // how this becomes unreadable.
  function renderTimeline(data) {
    var tasks = (data.tasks || []).filter(function (t) { return t.start && t.end; });
    var list = el("acct-gantt");
    list.innerHTML = "";
    if (!tasks.length) {
      el("acct-span").textContent = "The plan is drawn up overnight — check back tomorrow.";
      return;
    }
    var first = tasks.reduce(function (a, t) { return t.start < a ? t.start : a; }, tasks[0].start);
    var last = tasks.reduce(function (a, t) { return t.end > a ? t.end : a; }, tasks[0].end);
    var day = 86400000;
    var from = Date.parse(first + "T00:00:00Z");
    var span = Math.max(day, Date.parse(last + "T00:00:00Z") - from + day);
    el("acct-span").textContent = pretty(first) + " to " + pretty(last) + " — as it stands today.";

    tasks.forEach(function (task) {
      var li = document.createElement("li");
      var row = document.createElement("div");
      row.className = "row";

      var label = document.createElement("span");
      label.className = "label";
      label.textContent = task.subject;

      var track = document.createElement("span");
      track.className = "track";
      var bar = document.createElement("span");
      bar.className = "bar" + (task.done ? " bar--done" : task.waitingOn === "you" ? " bar--you" : "");
      var startAt = Date.parse(task.start + "T00:00:00Z") - from;
      var length = Date.parse(task.end + "T00:00:00Z") - Date.parse(task.start + "T00:00:00Z") + day;
      bar.style.left = (startAt / span) * 100 + "%";
      bar.style.width = (length / span) * 100 + "%";
      bar.title = pretty(task.start) + " – " + pretty(task.end);
      track.appendChild(bar);

      row.appendChild(label);
      row.appendChild(track);
      var when = document.createElement("div");
      when.className = "when";
      when.textContent = pretty(task.start) + " – " + pretty(task.end);
      li.appendChild(row);
      li.appendChild(when);
      list.appendChild(li);
    });
  }

  // Slots come from the server every time the project is opened: the calendar changes
  // under you, and a stale list means offering a time that is already gone.
  function loadSlots() {
    var holder = el("acct-slots");
    holder.innerHTML = "";
    return post("/account/slots", { project: state.current.id }, true).then(function (answer) {
      var slots = (answer && answer.slots) || [];
      if (!slots.length) {
        holder.textContent = "Nothing open in the next three weeks — email santi@santi.co.za and "
          + "we will make room.";
        return;
      }
      slots.slice(0, 8).forEach(function (slot) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = weekday(slot.date) + " " + pretty(slot.date) + ", " + slot.time;
        button.addEventListener("click", function () { choose(slot, button); });
        holder.appendChild(button);
      });
    });
  }

  var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  function weekday(iso) { return DAYS[new Date(iso + "T00:00:00Z").getUTCDay()]; }

  // Two stages on purpose: a single click used to book the call outright, which gave
  // nobody a chance to say what it was about - and a call with no agenda is a call that
  // starts with "so, what did you want to discuss?".
  function choose(slot, button) {
    state.slot = slot;
    Array.prototype.forEach.call(document.querySelectorAll("#acct-slots button"), function (other) {
      other.className = other === button ? "booked" : "";
    });
    el("acct-chosen").textContent = weekday(slot.date) + " " + pretty(slot.date) + ", " + slot.time;
    el("acct-booking").hidden = false;
    el("acct-book-note").textContent = "";
    el("acct-note").focus();
  }

  el("acct-book-cancel").addEventListener("click", function () {
    state.slot = null;
    el("acct-booking").hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll("#acct-slots button"), function (b) {
      b.className = "";
    });
  });

  el("acct-book-go").addEventListener("click", function () {
    var note = el("acct-book-note");
    if (!state.slot) { note.textContent = "Pick a time first."; return; }
    if (!(el("acct-note").value || "").trim()) {
      note.textContent = "Tell us what to cover first — even one line.";
      el("acct-note").focus();
      return;
    }
    book(state.slot);
  });

  function book(slot) {
    var note = el("acct-book-note");
    note.textContent = "Booking " + slot.start + "…";
    post("/account/book", {
      project: state.current.id,
      slot: slot.start,
      email: state.email || "",
      note: (el("acct-note").value || "").trim()
    }, true).then(function (answer) {
      if (!answer || answer.ok !== true) {
        note.textContent = (answer && answer.error) || "That did not book. Email santi@santi.co.za.";
        loadSlots();
        return;
      }
      state.slot = null;
      el("acct-booking").hidden = true;
      el("acct-note").value = "";
      note.textContent = "Booked for " + slot.start + ". A confirmation is on its way by email.";
      loadSlots();
    });
  }

  // What a client can actually DO about a step, and where that lives on the page. Only
  // their own steps get an action - ours are information, and offering a button that does
  // nothing is worse than offering none.
  var STEP_ACTIONS = {
    "Brief received": { label: "Fill in your brief", target: "acct-brief-form" },
    "Brand assets received": { label: "Upload your files", target: "acct-upload" },
    "Access and credentials received": { label: "Upload access notes", target: "acct-upload" },
    "Kickoff booked": { label: "Book the call", target: "acct-slots" },
    "Direction approved": { label: "Book a call to approve", target: "acct-slots" },
    "Review": { label: "Book a call to review", target: "acct-slots" }
  };

  function openStep(index, options) {
    var tasks = (state.current || {}).tasks || [];
    var task = tasks[index];
    if (!task) return;
    state.step = index;
    if (!options || options.push !== false) {
      writeRoute("#/p/" + encodeURIComponent(state.current.id) + "/m/" + (index + 1));
    }
    document.title = task.subject + " | Santi Universe";

    Array.prototype.forEach.call(el("acct-rail").children, function (li, position) {
      li.setAttribute("aria-current", String(position === index));
    });

    el("acct-step-count").textContent = "Milestone " + (index + 1) + " of " + tasks.length
      + (task.done ? " · done" : task.waitingOn === "you" ? " · over to you" : " · with us");
    el("acct-step-title").textContent = task.subject;
    el("acct-step-detail").textContent = task.detail || "";
    el("acct-step-when").textContent = task.start
      ? (task.start === task.end ? pretty(task.start) : pretty(task.start) + " – " + pretty(task.end))
      : task.done ? "" : "Not scheduled yet.";

    var actions = el("acct-step-actions");
    actions.innerHTML = "";
    var action = !task.done && task.waitingOn === "you" && STEP_ACTIONS[task.subject];
    if (action) {
      var go = document.createElement("button");
      go.type = "button";
      go.className = "btn btn--accent";
      go.textContent = action.label;
      go.addEventListener("click", function () {
        var target = el(action.target);
        var scrollTo = target.closest(".acct__block") || target;
        scrollTo.scrollIntoView({ behavior: "smooth", block: "start" });
        if (action.target === "acct-upload") setTimeout(function () { target.click(); }, 400);
      });
      actions.appendChild(go);
    }
    if (!task.done && task.waitingOn === "you") actions.appendChild(moveControl(task));

    el("acct-step-prev").disabled = index === 0;
    el("acct-step-next").disabled = index === tasks.length - 1;
  }

  // Nothing hides any more - closing a milestone means selecting the one that matters,
  // which is the first thing still open.
  function closeStep(options) {
    document.title = "Your projects | Santi Universe";
    if (state.current && (!options || options.push !== false)) {
      writeRoute("#/p/" + encodeURIComponent(state.current.id));
    }
    var tasks = (state.current || {}).tasks || [];
    var first = tasks.findIndex(function (task) { return !task.done; });
    openStep(first < 0 ? 0 : first, { push: false });
  }

  el("acct-step-prev").addEventListener("click", function () { openStep(state.step - 1); });
  el("acct-step-next").addEventListener("click", function () { openStep(state.step + 1); });

  // Four columns, in the order a client cares about: what is on them, what is on us,
  // what is done, and what they have asked for that nobody has agreed to yet. The last
  // one is deliberately its own column - putting requests among the milestones would
  // imply someone had accepted them.
  function renderBoard(data) {
    var columns = [
      { key: "you", title: "Over to you", cards: [] },
      { key: "us", title: "With us", cards: [] },
      { key: "done", title: "Done", cards: [] },
      { key: "asked", title: "You asked for", cards: [] }
    ];
    (data.tasks || []).forEach(function (task, index) {
      var column = task.done ? columns[2] : (task.waitingOn === "you" ? columns[0] : columns[1]);
      column.cards.push({ task: task, index: index });
    });
    (data.requests || []).forEach(function (request) {
      columns[3].cards.push({ request: request });
    });

    var holder = el("acct-kanban");
    holder.innerHTML = "";
    columns.forEach(function (column) {
      var wrap = document.createElement("div");
      wrap.className = "acct__col" + (column.key === "you" ? " acct__col--you" : "");
      var title = document.createElement("h3");
      title.textContent = column.title + " (" + column.cards.length + ")";
      wrap.appendChild(title);

      if (!column.cards.length) {
        var empty = document.createElement("p");
        empty.className = "acct__col--empty";
        empty.textContent = column.key === "asked" ? "Nothing asked for yet."
          : column.key === "you" ? "Nothing needed from you right now." : "Nothing here.";
        wrap.appendChild(empty);
      }

      column.cards.forEach(function (entry) {
        var card = document.createElement("div");
        card.className = "acct__card"
          + (entry.request ? "" : entry.task.done ? " acct__card--done"
            : entry.task.waitingOn === "you" ? " acct__card--you" : "");
        var name = document.createElement("strong");
        name.textContent = entry.request ? entry.request.subject : entry.task.subject;
        card.appendChild(name);

        var meta = document.createElement("span");
        meta.className = "date";
        if (entry.request) {
          meta.textContent = "With Santi — he will come back to you";
        } else if (entry.task.start) {
          meta.textContent = entry.task.start === entry.task.end ? pretty(entry.task.start)
            : pretty(entry.task.start) + " – " + pretty(entry.task.end);
        } else {
          meta.textContent = entry.task.done ? "Done" : "Not scheduled yet";
        }
        card.appendChild(meta);

        if (!entry.request) {
          card.addEventListener("click", function () { setView("list"); openStep(entry.index); });
        }
        wrap.appendChild(card);
      });
      holder.appendChild(wrap);
    });
  }

  function setView(name) {
    el("acct-steps").hidden = name !== "list";
    el("acct-timeline").hidden = name !== "timeline";
    el("acct-board").hidden = name !== "board";
    el("acct-view-list").setAttribute("aria-pressed", String(name === "list"));
    el("acct-view-time").setAttribute("aria-pressed", String(name === "timeline"));
    el("acct-view-board").setAttribute("aria-pressed", String(name === "board"));
    if (name === "timeline" && state.current) renderTimeline(state.current);
    if (name === "board" && state.current) renderBoard(state.current);
  }

  // What the plan makes of the date they asked for. Quoted, never charged: the fee and
  // the discount are a conversation, and this page is where that conversation starts.
  function renderVerdict(data) {
    var box = el("acct-verdict");
    var verdict = data.verdict || {};
    if (!data.target || !verdict.message) { box.hidden = true; return; }
    box.innerHTML = "";
    var head = document.createElement("strong");
    head.textContent = verdict.status === "rush" ? "Your date is tighter than our plan"
      : verdict.status === "relaxed" ? "You have given us room — and that earns a discount"
      : "Your date and our plan agree";
    var body = document.createElement("span");
    body.textContent = verdict.message + " You asked for " + pretty(data.target)
      + "; the plan currently finishes " + pretty(data.plannedEnd) + ".";
    box.appendChild(head);
    box.appendChild(body);
    box.hidden = false;
  }

  // The rail IS the list: every milestone visible on the left, the selected one open on
  // the right. One view instead of a list that hides itself to show a panel - a client
  // should never lose sight of where they are in the whole thing to read one part of it.
  function renderSteps(tasks) {
    var rail = el("acct-rail");
    rail.innerHTML = "";
    tasks.forEach(function (task, index) {
      var li = document.createElement("li");
      li.setAttribute("aria-current", String(index === state.step));

      var dot = document.createElement("span");
      dot.className = "dot" + (task.done ? " dot--done" : task.waitingOn === "you" ? " dot--you" : "");
      dot.textContent = task.done ? "✓" : String(index + 1);

      var body = document.createElement("div");
      var name = document.createElement("strong");
      name.textContent = task.subject;
      var state_ = document.createElement("span");
      state_.textContent = task.done ? "Done"
        : task.waitingOn === "you" ? "Over to you"
        : task.waitingOn === "us" ? "With us" : "Together";
      if (!task.done && task.start) state_.textContent += " · " + pretty(task.start);
      body.appendChild(name);
      body.appendChild(state_);

      li.appendChild(dot);
      li.appendChild(body);
      li.addEventListener("click", function () { openStep(index); });
      rail.appendChild(li);
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
      // The deadline question is a real date, because the planner reads it and answers
      // it with a rush fee or a discount. Native picker, no library.
      var field = document.createElement(question.type === "date" ? "input" : "textarea");
      if (question.type === "date") field.type = "date";
      field.id = "aq-" + question.key;
      if (field.tagName === "TEXTAREA") field.rows = 3;
      wrap.appendChild(label);
      wrap.appendChild(field);
      // Writing help, on the questions where prose is actually wanted. Never on the date.
      if (question.type !== "date") wrap.appendChild(improveControl(question, field));
      holder.appendChild(wrap);
    });
  }

  // The suggestion is shown BESIDE their words, never dropped on top of them: it is help
  // with the writing, and the client decides whether it is an improvement.
  function improveControl(question, field) {
    var wrap = document.createElement("div");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "acct__move";
    button.textContent = "Improve this";
    var note = document.createElement("p");
    note.className = "acct__note";
    var box = document.createElement("div");
    box.className = "acct__suggestion";
    box.hidden = true;

    button.addEventListener("click", function () {
      var text = (field.value || "").trim();
      if (!text) { note.textContent = "Write something first and this will tidy it up."; return; }
      note.textContent = "Reading it…";
      box.hidden = true;
      post("/account/improve", {
        project: state.current.id, question: question.label, text: text
      }, true).then(function (answer) {
        if (!answer || answer.ok !== true || !answer.text) {
          note.textContent = (answer && answer.error) || "Could not do that one.";
          return;
        }
        note.textContent = "";
        box.innerHTML = "";
        var heading = document.createElement("p");
        heading.className = "acct__fine";
        heading.textContent = "A tidier version of your own words — nothing added:";
        var suggestion = document.createElement("p");
        suggestion.className = "acct__suggestiontext";
        suggestion.textContent = answer.text;
        var use = document.createElement("button");
        use.type = "button";
        use.className = "btn btn--ghost";
        use.textContent = "Use this";
        use.addEventListener("click", function () {
          field.value = answer.text;
          box.hidden = true;
          note.textContent = "Swapped in. Edit it as much as you like before sending.";
        });
        var keep = document.createElement("button");
        keep.type = "button";
        keep.className = "acct__out";
        keep.style.margin = "0 0 0 1rem";
        keep.textContent = "Keep mine";
        keep.addEventListener("click", function () { box.hidden = true; });
        box.appendChild(heading);
        box.appendChild(suggestion);
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

  function openProject(id, options) {
    if (!options || options.push !== false) writeRoute("#/p/" + encodeURIComponent(id));
    return post("/account/project", { project: id }, true).then(function (data) {
      if (!data || data.ok !== true) { loadProjects(); return; }
      state.current = data;
      el("acct-project-name").textContent = data.project;
      el("acct-progress").textContent = data.done + " of " + data.total + " milestones done";
      el("acct-bar").style.width = data.total ? Math.round((data.done / data.total) * 100) + "%" : "0";
      var fresh = newlyDone(data);
      var cheer = el("acct-cheer");
      if (fresh.length) {
        cheer.textContent = fresh.length === 1
          ? fresh[0] + " — done. " + (data.total - data.done) + " to go."
          : fresh.length + " milestones done since you were last here.";
        cheer.hidden = false;
        celebrate();
      } else {
        cheer.hidden = true;
      }

      renderVerdict(data);
      el("acct-rates").textContent = (data.rates && data.rates.message) || "";
      renderBoard(data);
      renderSteps(data.tasks || []);
      closeStep({ push: false });   // opens whichever milestone is actually next
      renderTimeline(data);
      renderBrief(data);
      renderFiles(data.files || []);
      loadSlots();
      show("project");
      window.scrollTo(0, 0);
    });
  }

  el("acct-view-list").addEventListener("click", function () { setView("list"); });
  el("acct-view-time").addEventListener("click", function () { setView("timeline"); });
  el("acct-view-board").addEventListener("click", function () { setView("board"); });
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

  el("acct-request-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var note = el("acct-request-note");
    var subject = (el("acct-request-subject").value || "").trim();
    if (!subject) { note.textContent = "Say what you need, even roughly."; return; }
    note.textContent = "Sending…";
    post("/account/ask", {
      project: state.current.id,
      subject: subject,
      detail: (el("acct-request-detail").value || "").trim()
    }, true).then(function (answer) {
      if (!answer || answer.ok !== true) {
        note.textContent = (answer && answer.error) || "That did not send. Email santi@santi.co.za.";
        return;
      }
      el("acct-request-subject").value = "";
      el("acct-request-detail").value = "";
      note.textContent = "Sent. Santi has it, and will come back to you before anything starts.";
      openProject(state.current.id);
    });
  });

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
      // Keep the hash: a client who followed a link to one milestone, signed in, and
      // landed on a bare project list would reasonably think the link was broken.
      history.replaceState(null, "", location.pathname + location.hash);
      if (!answer || answer.ok !== true) {
        signedOut();
        el("acct-signin-note").textContent =
          "That sign-in link has expired. Enter your email and we will send a fresh one.";
        return;
      }
      store(answer.token);
      state.email = answer.email || "";
      try { localStorage.setItem("santi.account.email", state.email); } catch (e) {}
      el("acct-who").textContent = state.email;
      route();
    }).catch(signedOut);
  } else if (stored()) {
    state.token = stored();
    try { state.email = localStorage.getItem("santi.account.email") || ""; } catch (e) {}
    route().catch(signedOut);
  } else {
    signedOut();
  }
})();
