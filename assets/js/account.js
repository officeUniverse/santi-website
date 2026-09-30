/* The client account.

   The milestones are the navigation. One tab per milestone, and each tab holds the thing
   you actually do at that step: the brief form lives in the Brief tab, the upload lives in
   the assets tab, the booking lives in the call tabs. A final tab covers anything else -
   asking for extra work, or a call about something that is not on the plan.

   The tools (brief, files, booking, asking) exist once in the page and are MOVED into
   whichever tab needs them, so their state and listeners survive switching tabs.

   Sign-in is a link emailed to an address ERPNext already holds; there is no password
   here. The Worker takes the customer from a signed token, never from this page, so
   nothing in this file is a security control. It is all presentation. */
(function () {
  "use strict";
  var API = "https://santi-account.zukosanti.workers.dev";
  var KEY = "santi.account.session";
  var EMAIL_KEY = "santi.account.email";
  var HELP = "help";

  var el = function (id) { return document.getElementById(id); };
  var all = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
  var views = { signin: el("acc-signin"), list: el("acc-list"), project: el("acc-project") };
  var state = { token: null, email: "", current: null, step: 0, slot: null, moving: null };

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
  function signedOut() { store(null); show("signin"); }

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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
  // #/p/PROJ-0003         the project, opened on whatever is next
  // #/p/PROJ-0003/m/4     a milestone - linkable, and the back button behaves
  // #/p/PROJ-0003/help    the "something else" tab
  function writeRoute(route) {
    var url = location.pathname + (route || "");
    if (location.pathname + location.hash !== url) history.pushState(null, "", url);
  }
  function projectRoute(suffix) { return "#/p/" + encodeURIComponent(state.current.id) + (suffix || ""); }
  function readRoute() {
    var match = /^#\/p\/([^/]+)(?:\/(help|timeline|board|billing)|\/m\/(\d+))?$/.exec(location.hash || "");
    if (!match) return null;
    return { project: decodeURIComponent(match[1]), section: match[2] || null,
             milestone: match[3] ? Number(match[3]) : null };
  }
  function route() {
    var here = readRoute();
    if (!here) return loadProjects({ push: false });
    return openProject(here.project, { push: false }).then(function () {
      if (!state.current) return;
      if (here.section === "help") selectTab(HELP, { push: false });
      else if (here.section) setView(here.section, { push: false });
      else if (here.milestone) selectTab(here.milestone - 1, { push: false });
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
      // Only the Worker saying so signs anyone out; an n8n wobble must not.
      if (answer && answer.signedOut) { signedOut(); return; }
      var list = el("acc-projects");
      list.innerHTML = "";
      el("acc-who").textContent = state.email;
      show("list");
      if (!answer || answer.ok !== true) {
        list.appendChild(make("li", "acc-muted", "Could not load your projects just now. Refresh in a moment, or email santi@santi.co.za."));
        return;
      }
      var projects = answer.projects || [];
      if (!projects.length) {
        list.appendChild(make("li", "acc-muted", "Nothing here yet — a project appears once its deposit is paid."));
        return;
      }
      // One project needs no list: go straight to it.
      if (projects.length === 1 && (!options || options.auto !== false)) return openProject(projects[0].id);
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
      render(data);
      show("project");
      // Open on what is actually next, unless the caller is about to choose.
      var keep = options && options.keep != null ? options.keep : null;
      var tasks = data.tasks || [];
      var first = tasks.findIndex(function (t) { return !t.done; });
      selectTab(keep != null ? keep : (first < 0 ? tasks.length - 1 : first),
                { push: !options || options.push !== false });
    });
  }

  function render(data) {
    el("acc-name").textContent = data.project;
    el("acc-signedin").textContent = state.email;
    el("acc-bar").style.width = data.total ? Math.round(data.done / data.total * 100) + "%" : "0";
    el("acc-progress-text").textContent = data.done + " of " + data.total + " done"
      + (data.plannedEnd ? " · finishes " + pretty(data.plannedEnd) : "");
    cheer(data);
    renderVerdict(data);
    renderVideo(data.video);
    renderTabs(data.tasks || []);
    renderTimeline(data.tasks || []);
    renderBoard(data);
    state.billing = null;          // money is fetched when someone asks for it, not before
    renderBrief(data);
    renderFiles(data.files || []);
    renderAsk(data);
  }

  /* ------------------------------------------------------------- the tab strip */
  function renderTabs(tasks) {
    strip.innerHTML = "";
    tasks.forEach(function (task, index) {
      var tab = make("button", "acc-mtab" + (task.done ? " acc-mtab--done" : task.waitingOn === "you" ? " acc-mtab--you" : ""));
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.appendChild(make("span", "acc-num", task.done ? "✓" : String(index + 1)));
      tab.appendChild(make("strong", "", task.subject));
      var status_ = make("small", "", holder(task));
      if (!task.done && task.start) {
        status_.appendChild(make("br"));
        status_.appendChild(document.createTextNode(pretty(task.start)));
      }
      tab.appendChild(status_);
      tab.addEventListener("click", function () { selectTab(index); });
      strip.appendChild(tab);
    });
    var help = make("button", "acc-mtab acc-mtab--help");
    help.type = "button";
    help.setAttribute("role", "tab");
    help.appendChild(make("span", "acc-num", "+"));
    help.appendChild(make("strong", "", "Something else?"));
    var asked = ((state.current && state.current.requests) || []).length;
    help.appendChild(make("small", "", asked ? asked + " request" + (asked === 1 ? "" : "s") + " open" : "Ask or book a call"));
    help.addEventListener("click", function () { selectTab(HELP); });
    strip.appendChild(help);
    updateArrows();
  }

  var strip = el("acc-mtabs");
  function updateArrows() {
    el("acc-left").disabled = strip.scrollLeft <= 4;
    el("acc-right").disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
  }
  el("acc-left").addEventListener("click", function () {
    strip.scrollBy({ left: -strip.clientWidth * 0.8, behavior: "smooth" });
  });
  el("acc-right").addEventListener("click", function () {
    strip.scrollBy({ left: strip.clientWidth * 0.8, behavior: "smooth" });
  });
  strip.addEventListener("scroll", updateArrows, { passive: true });
  window.addEventListener("resize", updateArrows);

  /* --------------------------------------------------- what each milestone needs */
  // Boards name milestones differently, so a milestone's tool is chosen by what it is
  // about rather than its exact title.
  function toolsFor(task) {
    var subject = task.subject.toLowerCase();
    if (/brief/.test(subject)) return ["brief"];
    if (/asset|reference|file|source|data|credential|access/.test(subject)) return ["files"];
    if (task.waitingOn === "us" || task.done) return [];
    return ["meet"];
  }

  function place(tools) {
    var slot = el("acc-slot");
    var parking = el("acc-parking");
    // Put back whatever the last tab borrowed, then lend out what this one needs.
    all("#acc-slot .acc-tool").forEach(function (tool) { parking.appendChild(tool); });
    slot.innerHTML = "";
    if (!tools.length) return;
    var holder_ = tools.length > 1 ? make("div", "acc-split") : slot;
    if (holder_ !== slot) slot.appendChild(holder_);
    tools.forEach(function (name) { holder_.appendChild(el("tool-" + name)); });
    if (tools.indexOf("meet") >= 0) loadSlots();
  }

  function selectTab(which, options) {
    showView("milestones");
    var tasks = (state.current && state.current.tasks) || [];
    var tabs = all("#acc-mtabs .acc-mtab");
    var isHelp = which === HELP;
    var index = isHelp ? tasks.length : which;
    var task = isHelp ? null : tasks[which];
    if (!isHelp && !task) return;
    state.step = index;

    tabs.forEach(function (tab, position) { tab.setAttribute("aria-selected", String(position === index)); });
    // Bring the open tab into view within the strip itself. scrollIntoView also moves the
    // page, and on a phone the active milestone was left sitting off to the right.
    if (tabs[index]) {
      var offset = tabs[index].getBoundingClientRect().left - strip.getBoundingClientRect().left;
      strip.scrollTo({ left: strip.scrollLeft + offset - 12, behavior: "smooth" });
    }

    var panel = el("acc-panel");
    var tag = el("acc-tag");
    var when = el("acc-when");
    when.innerHTML = "";

    if (isHelp) {
      panel.className = "acc-panel";
      tag.className = "acc-tag";
      tag.textContent = "Anything else";
      el("acc-title").textContent = "Something not on the plan?";
      el("acc-detail").textContent = "Ask for extra work, or book a call about anything at all. "
        + "Santi reads everything and comes back to you before anything starts.";
      place(["ask", "meet"]);
      document.title = "Something else | Santi Universe";
    } else {
      var yours = !task.done && task.waitingOn === "you";
      panel.className = "acc-panel" + (yours ? " acc-panel--you" : "");
      tag.className = "acc-tag" + (task.done ? " acc-tag--done" : yours ? " acc-tag--you" : "");
      tag.textContent = holder(task);
      el("acc-title").textContent = task.subject;
      el("acc-detail").textContent = task.waitingOn === "us" && !task.done
        ? (task.detail || "") + " Nothing is needed from you — you will see it ticked here when it is done."
        : (task.detail || "");
      if (task.done) when.appendChild(make("span", "", "Done ✓"));
      else if (task.start) when.appendChild(make("span", "", (yours ? "By " + pretty(task.end) : span(task))));
      if (yours) {
        var more = make("button", "acc-link", "Need more time?");
        more.type = "button";
        more.addEventListener("click", function () { askForDate(task); });
        when.appendChild(more);
      }
      place(toolsFor(task));
      document.title = task.subject + " | Santi Universe";
    }

    el("acc-count").textContent = isHelp ? "" : "Milestone " + (index + 1) + " of " + tasks.length;
    el("acc-prev").disabled = index === 0;
    el("acc-next").disabled = isHelp;
    el("acc-next").textContent = index === tasks.length - 1 ? "Something else? →" : "Next →";

    if (!options || options.push !== false) {
      writeRoute(projectRoute(isHelp ? "/" + HELP : "/m/" + (index + 1)));
    }
  }

  el("acc-prev").addEventListener("click", function () {
    selectTab(state.step - 1);
  });
  el("acc-next").addEventListener("click", function () {
    var tasks = (state.current && state.current.tasks) || [];
    selectTab(state.step + 1 >= tasks.length ? HELP : state.step + 1);
  });

  /* --------------------------------------------------------------------- views */
  // Four ways to look at one project, one at a time. Milestones is where work gets done;
  // the other three are for seeing the whole thing at once.
  function showView(name) {
    all("[data-view]").forEach(function (button) {
      button.setAttribute("aria-selected", String(button.getAttribute("data-view") === name));
    });
    all("[data-viewpanel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-viewpanel") !== name;
    });
  }
  function setView(name, options) {
    if (name === "milestones") {
      var tasks = (state.current && state.current.tasks) || [];
      var first = tasks.findIndex(function (t) { return !t.done; });
      return selectTab(first < 0 ? Math.max(0, tasks.length - 1) : first, options);
    }
    showView(name);
    document.title = name.charAt(0).toUpperCase() + name.slice(1) + " | Santi Universe";
    if (name === "billing") loadBilling();
    if (state.current && (!options || options.push !== false)) writeRoute(projectRoute("/" + name));
  }
  all("[data-view]").forEach(function (button) {
    button.addEventListener("click", function () { setView(button.getAttribute("data-view")); });
  });

  function openMilestone(index) {
    selectTab(index);
    el("acc-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------------------------------------------ timeline */
  // A real timeline: bars placed on a date axis, month marks along the top, and a line
  // for today. Positions are proportional to calendar days, so a weekend gap between two
  // milestones shows as a gap - which is the truth about when work happens.
  function dayNumber(iso) { return Date.parse(iso + "T00:00:00Z") / 86400000; }

  function renderTimeline(tasks) {
    var box = el("acc-tl");
    box.innerHTML = "";
    var dated = tasks.map(function (t, i) { return { task: t, index: i }; })
      .filter(function (e) { return e.task.start && e.task.end; });
    if (!dated.length) {
      box.appendChild(make("p", "acc-muted", "The plan is drawn up overnight — check back tomorrow."));
      return;
    }
    var first = Math.min.apply(null, dated.map(function (e) { return dayNumber(e.task.start); }));
    var last = Math.max.apply(null, dated.map(function (e) { return dayNumber(e.task.end); }));
    // Pull today into view when it is not long before the first milestone: "your next
    // thing is three weeks away" is exactly what a timeline is for.
    var todayNumber = Math.floor(Date.now() / 86400000);
    if (todayNumber < first && first - todayNumber <= 60) first = todayNumber;
    first -= 2; last += 3;
    var spanDays = Math.max(1, last - first);
    var at = function (day) { return ((day - first) / spanDays) * 100 + "%"; };

    var inner = make("div", "acc-tl-inner");

    // month marks
    var axisRow = make("div", "acc-tl-row");
    axisRow.appendChild(make("span", "acc-muted", ""));
    var axis = make("div", "acc-tl-axis");
    var cursor = new Date(first * 86400000);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    while (cursor.getTime() / 86400000 <= last) {
      var d = cursor.getTime() / 86400000;
      // The month the range opens in is labelled at the left edge, not skipped.
      if (d < first) d = first;
      {
        var mark = make("span", "acc-tl-month", MONTHS[cursor.getUTCMonth()] + " " + cursor.getUTCFullYear());
        mark.style.left = at(d);
        axis.appendChild(mark);
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    axisRow.appendChild(axis);
    inner.appendChild(axisRow);

    var grid = make("div", "acc-tl-grid");
    var todayDay = Math.floor(Date.now() / 86400000);
    dated.forEach(function (entry) {
      var task = entry.task;
      var row = make("div", "acc-tl-row");
      var label = make("button", "acc-tl-label", task.subject);
      label.type = "button";
      label.appendChild(make("small", "", holder(task) + " · " + span(task)));
      label.addEventListener("click", function () { openMilestone(entry.index); });
      var track = make("div", "acc-tl-track");
      var bar = make("span", "acc-tl-bar" + (task.done ? " acc-tl-bar--done"
        : task.waitingOn === "you" ? " acc-tl-bar--you" : task.waitingOn === "both" ? " acc-tl-bar--both" : ""));
      bar.style.left = at(dayNumber(task.start));
      bar.style.width = "calc(" + ((dayNumber(task.end) - dayNumber(task.start) + 1) / spanDays * 100) + "% )";
      bar.title = task.subject + " — " + span(task);
      bar.addEventListener("click", function () { openMilestone(entry.index); });
      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      grid.appendChild(row);
    });
    inner.appendChild(grid);

    if (todayDay >= first && todayDay <= last) {
      // Today's line runs down the tracks only, not through the labels.
      var overlay = make("div", "acc-tl-row");
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.alignItems = "stretch";   // the lane must be as tall as the rows
      overlay.appendChild(make("span"));
      var lane = make("div");
      lane.style.position = "relative";
      lane.style.height = "100%";
      var line = make("div", "acc-tl-today");
      line.style.left = at(todayDay);
      line.appendChild(make("span", "", "TODAY"));
      lane.appendChild(line);
      overlay.appendChild(lane);
      grid.style.position = "relative";
      grid.appendChild(overlay);
    }

    box.appendChild(inner);
    var legend = make("div", "acc-legend");
    [["Waiting on you", "var(--gold)"], ["With us", "rgba(127,156,245,.55)"],
     ["Together", "transparent;border:2px solid rgba(255,255,255,.55)"], ["Done", "rgba(255,255,255,.18)"]]
      .forEach(function (pair) {
        var item = make("span");
        var swatch = make("i");
        swatch.setAttribute("style", "background:" + pair[1]);
        item.appendChild(swatch);
        item.appendChild(document.createTextNode(pair[0]));
        legend.appendChild(item);
      });
    box.appendChild(legend);
  }

  /* --------------------------------------------------------------------- board */
  function renderBoard(data) {
    var box = el("acc-kanban");
    box.innerHTML = "";
    var columns = [
      { key: "you", title: "Over to you", items: [] },
      { key: "us", title: "With us", items: [] },
      { key: "done", title: "Done", items: [] },
      { key: "asked", title: "You asked for", items: [] }
    ];
    (data.tasks || []).forEach(function (task, index) {
      var column = task.done ? columns[2] : task.waitingOn === "you" ? columns[0] : columns[1];
      column.items.push({ task: task, index: index });
    });
    (data.requests || []).forEach(function (request) { columns[3].items.push({ request: request }); });

    columns.forEach(function (column) {
      var col = make("section", "acc-col" + (column.key === "you" ? " acc-col--you" : ""));
      var head = make("h3");
      head.appendChild(make("span", "", column.title));
      head.appendChild(make("span", "", String(column.items.length)));
      col.appendChild(head);
      if (!column.items.length) {
        col.appendChild(make("small", "acc-muted", column.key === "you" ? "Nothing needed from you right now."
          : column.key === "asked" ? "Nothing asked for — use Something else? to ask." : "Nothing here."));
      }
      column.items.forEach(function (item) {
        if (item.request) {
          var ask = make("div", "acc-kcard acc-kcard--ask");
          ask.appendChild(make("strong", "", item.request.subject));
          ask.appendChild(make("small", "", item.request.status === "With Santi"
            ? "With Santi — he will come back to you" : item.request.status));
          col.appendChild(ask);
          return;
        }
        var task = item.task;
        var card = make("button", "acc-kcard" + (task.done ? " acc-kcard--done"
          : task.waitingOn === "you" ? " acc-kcard--you" : ""));
        card.type = "button";
        card.appendChild(make("strong", "", task.subject));
        card.appendChild(make("small", "", task.done ? "Done" : (span(task) || "Not scheduled yet")));
        card.addEventListener("click", function () { openMilestone(item.index); });
        col.appendChild(card);
      });
      box.appendChild(col);
    });
  }

  /* ------------------------------------------------------------------- billing */
  // Fetched only when the Billing view is opened: money has no business loading on
  // every visit, and it is the one view that reads the books.
  function rands(value) {
    return Number(value || 0).toLocaleString("en-ZA", { style: "currency", currency: "ZAR" });
  }

  function loadBilling() {
    if (!state.current) return;
    var box = el("acc-billing");
    if (state.billing) return renderBilling(state.billing);
    box.innerHTML = "";
    box.appendChild(make("p", "acc-muted", "Loading your billing…"));
    post("/account/billing", { project: state.current.id }, true).then(function (answer) {
      if (!answer || answer.ok !== true) {
        box.innerHTML = "";
        box.appendChild(make("p", "acc-muted", "Could not load billing just now. Try again in a moment, or email santi@santi.co.za."));
        return;
      }
      state.billing = answer;
      renderBilling(answer);
    });
  }

  function renderBilling(bill) {
    var box = el("acc-billing");
    box.innerHTML = "";
    if (!bill.ready) {
      box.appendChild(make("p", "acc-muted", bill.message));
      return;
    }

    var tiles = make("div", "acc-money");
    [["Project total", rands(bill.total), bill.lines.length + (bill.lines.length === 1 ? " item" : " items")],
     ["Paid so far", rands(bill.paid), bill.percentPaid + "% of the total"],
     [bill.stage === "deposit-paid" ? "Still to come" : "Balance due", rands(bill.outstanding),
      bill.stage === "deposit-paid" ? "Invoiced at handover"
        : bill.nextDue ? "Due " + pretty(bill.nextDue) : "Nothing outstanding"]]
      .forEach(function (tile, position) {
        var div = make("div", position === 2 && bill.outstanding > 0 && bill.stage === "invoiced" ? "acc-due-tile" : "");
        div.appendChild(make("span", "", tile[0]));
        div.appendChild(make("strong", "", tile[1]));
        div.appendChild(make("small", "", tile[2]));
        tiles.appendChild(div);
      });
    box.appendChild(tiles);

    var bar = make("div", "acc-bar");
    var fill = make("i");
    fill.style.width = bill.percentPaid + "%";
    bar.appendChild(fill);
    box.appendChild(bar);
    var note = make("p", "acc-muted", bill.message);
    note.style.marginTop = ".8rem";
    box.appendChild(note);

    function ledger(title, headings, rows, empty) {
      var section = make("section", "acc-ledger");
      section.appendChild(make("h3", "", title));
      if (!rows.length) {
        section.appendChild(make("p", "acc-muted", empty));
        return section;
      }
      var table = make("table");
      var head = make("tr");
      headings.forEach(function (h, i) { head.appendChild(make("th", i >= headings.length - 1 || h.num ? "num" : "", h.label || h)); });
      table.appendChild(head);
      rows.forEach(function (cells) {
        var tr = make("tr");
        cells.forEach(function (cell, i) { tr.appendChild(make("td", i === cells.length - 1 ? "num" : "", cell)); });
        table.appendChild(tr);
      });
      section.appendChild(table);
      return section;
    }

    box.appendChild(ledger("What you bought", ["Item", "Qty", "Amount"],
      bill.lines.map(function (l) { return [l.description, String(l.qty), rands(l.amount)]; }),
      "No items on the order."));
    box.appendChild(ledger("Payments received", ["Date", "Reference", "Amount"],
      bill.payments.map(function (p) { return [pretty(p.date), p.reference, rands(p.amount)]; }),
      "No payments yet."));
    box.appendChild(ledger("Invoices", ["Invoice", "Date", "Due", "Status", "Outstanding"],
      bill.invoices.map(function (i) { return [i.number, pretty(i.date), pretty(i.due), i.status, rands(i.outstanding)]; }),
      "No invoice yet — the balance is invoiced at handover, with your deposit already taken off."));
  }

  /* ------------------------------------------------------------------- extras */
  // Only news is celebrated: what the client saw last time is kept in their browser and
  // compared, so a milestone gets confetti once, and never for anyone who asked their
  // system for reduced motion.
  function cheer(data) {
    var key = "santi.account.done." + data.id;
    var done = (data.tasks || []).filter(function (t) { return t.done; }).map(function (t) { return t.subject; });
    var before = null;
    try { before = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    try { localStorage.setItem(key, JSON.stringify(done)); } catch (e) {}
    var fresh = before ? done.filter(function (s) { return before.indexOf(s) < 0; }) : [];
    el("acc-cheer").hidden = !fresh.length;
    if (!fresh.length) return;
    el("acc-cheer").textContent = fresh.length === 1 ? "✓ " + fresh[0] + " — done."
      : "✓ " + fresh.length + " milestones done since you were last here.";
    celebrate();
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

  // Hidden until something is filmed. What may be framed is the server's decision.
  function renderVideo(video) {
    var holder_ = el("acc-video");
    holder_.innerHTML = "";
    holder_.hidden = !(video && video.src);
    if (holder_.hidden) return;
    if (video.kind === "file") {
      var player = make("video");
      player.src = video.src;
      player.controls = true;
      player.preload = "metadata";
      if (video.poster) player.poster = video.poster;
      holder_.appendChild(player);
      return;
    }
    var frame = make("iframe");
    frame.src = video.src;
    frame.title = video.title || "Welcome video";
    frame.loading = "lazy";
    frame.allow = "encrypted-media; picture-in-picture; fullscreen";
    frame.setAttribute("allowfullscreen", "allowfullscreen");
    frame.setAttribute("referrerpolicy", "no-referrer");
    holder_.appendChild(frame);
  }

  /* --------------------------------------------------------------- move a date */
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
    var keep = state.step;
    post("/account/move", { project: state.current.id, step: state.moving.subject, date: wanted }, true)
      .then(function (answer) {
        if (!answer || answer.ok !== true) { note.textContent = (answer && answer.error) || "That date did not work."; return; }
        closeDialog();
        openProject(state.current.id, { push: false, keep: keep });
      });
  });

  /* --------------------------------------------------------------- brief tool */
  function renderBrief(data) {
    var submitted = data.briefStatus && data.briefStatus !== "Awaiting";
    el("acc-brief-open").hidden = submitted;
    el("acc-brief-done").hidden = !submitted;
    if (submitted) return;
    var box = el("acc-questions");
    box.innerHTML = "";
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
      box.appendChild(wrap);
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
      openProject(state.current.id, { push: false, keep: state.step });
    });
  });

  /* --------------------------------------------------------------- files tool */
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
    var keep = state.step;
    function next() {
      if (!queue.length) {
        note.textContent = failed.length
          ? "Not sent: " + failed.join(", ") + ". Email them to santi@santi.co.za instead."
          : "Received — filed on your project.";
        return openProject(state.current.id, { push: false, keep: keep });
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

  /* ---------------------------------------------------------- booking tool */
  // Slots are fetched fresh whenever the tool is shown: the calendar moves, and a stale
  // list offers a time that is already gone.
  function loadSlots() {
    if (!state.current) return;
    var box = el("acc-slots");
    box.innerHTML = "";
    el("acc-booking").hidden = true;
    state.slot = null;
    post("/account/slots", { project: state.current.id }, true).then(function (answer) {
      var slots = (answer && answer.slots) || [];
      if (!slots.length) {
        box.appendChild(make("p", "acc-muted", "Nothing open in the next three weeks — email santi@santi.co.za and we will make room."));
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
        box.appendChild(button);
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
    var chosen = state.slot;
    post("/account/book", { project: state.current.id, slot: chosen.start, email: state.email, note: agenda }, true)
      .then(function (answer) {
        if (!answer || answer.ok !== true) { note.textContent = (answer && answer.error) || "That did not book."; loadSlots(); return; }
        el("acc-agenda").value = "";
        loadSlots();
        el("acc-book-note").textContent = "Booked for " + weekday(chosen.date) + " " + pretty(chosen.date)
          + " at " + chosen.time + ". A confirmation is on its way.";
      });
  });

  /* -------------------------------------------------------------- asking tool */
  function renderAsk(data) {
    el("acc-rates").textContent = (data.rates && data.rates.message) || "";
    var list = el("acc-requests");
    list.innerHTML = "";
    (data.requests || []).forEach(function (request) {
      var li = make("li");
      li.appendChild(document.createTextNode(request.subject));
      li.appendChild(make("small", "", request.status === "With Santi"
        ? "With Santi — he will come back to you before anything starts" : request.status));
      list.appendChild(li);
    });
  }

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
        openProject(state.current.id, { push: false, keep: HELP }).then(function () {
          el("acc-ask-note").textContent = "Sent. Santi has it and will come back to you before anything starts.";
        });
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
