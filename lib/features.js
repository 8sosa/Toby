// Toby's newer sections: people & dates, meetings, projects, calendar, bills, savings,
// health, lists, weekly review, search, calendar links and Siri.
// The engine (engine.js) hands over its helpers as `X` and calls into what this returns.
import { nextDate, REPEATS, repeatLabel } from "./quick.js";
import { createImporter } from "./importer.js";

export function createFeatures(X) {
  const { S, save, esc, clone, pad, ymd, today, parseYmd, addDays, newId, DOW, MON, MONL, fmtDate, relDay, fmtTime, money, ICON, OUT_CATS } = X;
  const $ = (s) => document.querySelector(s);
  const timers = {};
  const IM = createImporter({ ...X, quick: { nextDate } });
  const later = (k, ms = 400) => { clearTimeout(timers[k]); timers[k] = setTimeout(() => save(k), ms); };
  const num = (v) => { const n = parseFloat(String(v || "").replace(/,/g, "")); return isFinite(n) ? n : NaN; };
  const daysUntil = (d) => Math.round((parseYmd(d) - parseYmd(today())) / 864e5);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const whenText = (d) => {
    const n = daysUntil(d);
    if (n < 0) return plural(-n, "day") + " overdue";
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    if (n < 7) return DOW[parseYmd(d).getDay()];
    return fmtDate(d);
  };
  const nextYearly = (md, from = today()) => {
    const [m, d] = md.split("-").map(Number);
    const fit = (y) => y + "-" + pad(m) + "-" + pad(Math.min(d, new Date(y, m, 0).getDate()));
    const y = +from.slice(0, 4);
    return fit(y) >= from ? fit(y) : fit(y + 1);
  };
  const mdLabel = (md) => { const [m, d] = md.split("-").map(Number); return d + " " + MON[m - 1]; };
  const weekStart = (d) => { const wd = (parseYmd(d).getDay() + 6) % 7; return addDays(d, -wd); };
  const section = (title, body, right = "") => `<section class="card"><div class="sec-h"><h2>${title}</h2>${right}</div>${body}</section>`;
  const empty = (b, t) => `<div class="empty"><b>${b}</b>${t}</div>`;
  const seg = (items, cur, act) => `<div class="seg" role="tablist">${items.map(([v, l]) => `<button role="tab" class="${cur === v ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
  const monthOpts = (cur) => opt("", "Month", cur) + MONL.map((m, i) => opt(pad(i + 1), m, cur)).join("");
  const dayOpts = (cur) => opt("", "Day", cur) + Array.from({ length: 31 }, (_, i) => opt(pad(i + 1), i + 1, cur)).join("");

  /* ================= calendar events (from linked calendars) ================= */
  const CAL_KEY = "toby:cal:" + X.uid;
  let CAL = { events: [], at: 0, problems: [], connected: false, loading: false, error: "" };
  try { const c = JSON.parse(localStorage.getItem(CAL_KEY) || "null"); if (c && Array.isArray(c.events)) CAL = { ...CAL, ...c, loading: false }; } catch {}
  const calLinked = () => !!String(S.settings.calendars || "").trim();
  async function refreshCal(force) {
    if (!calLinked()) { CAL = { ...CAL, events: [], connected: false, problems: [], error: "" }; return; }
    if (CAL.loading || (!force && Date.now() - CAL.at < 15 * 60e3)) return;
    CAL.loading = true;
    try {
      const r = await X.cloud.calendar.events(addDays(today(), -40), addDays(today(), 120));
      CAL = { events: r.events || [], problems: r.problems || [], connected: !!r.connected, at: Date.now(), loading: false, error: "" };
      try { localStorage.setItem(CAL_KEY, JSON.stringify({ events: CAL.events, at: CAL.at, problems: CAL.problems, connected: CAL.connected })); } catch {}
    } catch (e) {
      CAL.loading = false; CAL.error = e.message; CAL.at = Date.now(); // wait before trying again
    }
    X.softRender();
  }
  const evLocal = (e) => ymd(new Date(e.start));
  const evTime = (e) => { if (e.allDay) return ""; const d = new Date(e.start); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const eventsOn = (day) => CAL.events.filter((e) => (e.allDay ? e.start <= day && (e.end ? day < e.end : day === e.start) : evLocal(e) === day));

  /* ================= shared lookups ================= */
  const meetingsOn = (day) => S.meetings.items.filter((m) => m.date === day).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const activeBills = () => S.bills.items.filter((b) => b.active !== false && b.due);
  const allDates = () => [
    ...S.people.items.filter((p) => p.bday).map((p) => ({ kind: "bday", id: p.id, title: p.name + "’s birthday", md: p.bday, person: p })),
    ...S.people.dates.filter((o) => o.md).map((o) => ({ kind: "occ", id: o.id, title: o.title, md: o.md, year: o.year })),
  ];
  const followUpsDue = () => S.people.items.filter((p) => p.followEvery > 0 && (!p.last || addDays(p.last, p.followEvery) <= today()));
  const projectName = (id) => (S.projects.items.find((p) => p.id === id) || {}).name || "";
  const projectTasks = (id) => S.tasks.items.filter((t) => t.project === id);

  /* ================= TODAY additions ================= */
  function todaySchedule(t) {
    const rows = [
      ...eventsOn(t).map((e) => ({ time: evTime(e), html: `<div class="item"><span class="time">${e.allDay ? "All day" : fmtTime(evTime(e))}</span><div class="body"><div class="t">${esc(e.title)}</div><div class="m"><span class="chip">Calendar</span>${e.location ? `<span>${esc(e.location)}</span>` : ""}</div></div></div>` })),
      ...meetingsOn(t).map((m) => ({ time: m.time, html: `<div class="item"><span class="time">${m.time ? fmtTime(m.time) : ""}</span><button class="body" data-act="openMeeting" data-id="${m.id}"><div class="t">${esc(m.title || "Meeting")}</div><div class="m"><span class="chip acc">Meeting</span>${m.who ? `<span>${esc(m.who)}</span>` : ""}</div></button></div>` })),
    ].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    return rows.length ? `<div class="group-h">Schedule</div>${rows.map((r) => r.html).join("")}` : "";
  }

  function todayTop() {
    let h = "";
    if (X.syncMode() === "setup") {
      h += `<section class="card" style="border-color:var(--mark)"><div class="sec-h"><h2>One more setup step</h2></div><p class="small" style="margin:0">Toby has new sections that need a quick database update. In Supabase, open the SQL Editor, paste the file <b>supabase/v3.sql</b> from your Toby repo and run it. Until then, new people, bills and other items are kept on this device.</p></section>`;
    }
    return h;
  }

  function todayCards(t) {
    let h = "";
    const rv = (S.journal.reviews || []).find((r) => r.week === weekStart(t));
    const pri = rv ? (rv.priorities || []).filter((x) => x && x.trim()) : [];
    if (pri.length) {
      h += section("This week’s focus", `<ol class="focus">${pri.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>`, `<a class="link" href="#review">Review</a>`);
    }
    const bills = activeBills().filter((b) => daysUntil(b.due) <= 3).sort((a, b) => a.due.localeCompare(b.due));
    const dates = allDates().map((d) => ({ ...d, next: nextYearly(d.md, t) })).filter((d) => daysUntil(d.next) <= 7).sort((a, b) => a.next.localeCompare(b.next));
    const fu = followUpsDue();
    if (bills.length || dates.length || fu.length) {
      let body = '<div class="list">';
      bills.forEach((b) => {
        const n = daysUntil(b.due);
        body += `<div class="item" style="align-items:center"><button class="body" data-act="openBill" data-id="${b.id}"><div class="t">${esc(b.name)}</div><div class="m"><span class="chip ${n < 0 ? "bad" : n === 0 ? "hi" : ""}">${n < 0 ? "Overdue" : "Due " + whenText(b.due).toLowerCase()}</span><span>${money(b.amt)}</span></div></button><button class="btn small-btn" data-act="billPaid" data-id="${b.id}">Paid</button></div>`;
      });
      dates.forEach((d) => {
        const n = daysUntil(d.next);
        body += `<div class="item"><button class="body" data-act="${d.kind === "bday" ? "openPerson" : "openOccasion"}" data-id="${d.id}"><div class="t">${esc(d.title)}</div><div class="m"><span class="chip ${n === 0 ? "hi" : "acc"}">${n === 0 ? "Today" : whenText(d.next)}</span><span>${mdLabel(d.md)}</span></div></button></div>`;
      });
      fu.forEach((p) => {
        body += `<div class="item" style="align-items:center"><button class="body" data-act="openPerson" data-id="${p.id}"><div class="t">Catch up with ${esc(p.name)}</div><div class="m"><span>${p.last ? "Last time: " + esc(relDay(p.last)) : "Not logged yet"}</span></div></button><button class="btn small-btn" data-act="personContacted" data-id="${p.id}">Done</button></div>`;
      });
      h += section("Coming up", body + "</div>");
    }
    const prefs = X.prefs();
    const wd = new Date().getDay();
    if (!rv && prefs.reviewOn !== false && (wd === (prefs.reviewDay ?? 0) || wd === 1)) {
      h += `<a class="card review-cta" href="#review"><div><b>Weekly review</b><span class="small muted">Look back on the week and pick next week’s priorities.</span></div>${ICON.right}</a>`;
    }
    return h;
  }

  /* ================= PLAN tabs ================= */
  let planTab = "tasks", calMonth = today().slice(0, 7), calDay = today();
  const planSeg = () => seg([["tasks", "Tasks"], ["calendar", "Calendar"], ["projects", "Projects"], ["meetings", "Meetings"]], planTab, "planTab");

  function dayItems(d) {
    const tasks = S.tasks.items.filter((t) => t.date === d);
    const bills = [];
    activeBills().forEach((b) => {
      let due = b.due, guard = 0;
      while (due && due < d && b.repeat && guard++ < 400) due = nextDate(due, b.repeat, b.anchor);
      if (due === d) bills.push(b);
    });
    const dates = allDates().filter((x) => x.md === d.slice(5));
    return { tasks, events: eventsOn(d), meetings: meetingsOn(d), bills, dates };
  }

  function calendarTab() {
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1), offset = (first.getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
    const t = today();
    let cells = "";
    for (let i = 0; i < offset; i++) cells += '<span class="cal-cell blank"></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = calMonth + "-" + pad(d), it = dayItems(ds);
      const dots = [
        it.events.length || it.meetings.length ? '<i class="dot-ev"></i>' : "",
        it.tasks.some((x) => !x.done) ? '<i class="dot-task"></i>' : "",
        it.bills.length ? '<i class="dot-bill"></i>' : "",
        it.dates.length ? '<i class="dot-date"></i>' : "",
      ].join("");
      cells += `<button class="cal-cell${ds === t ? " today" : ""}${ds === calDay ? " sel" : ""}" data-act="calDay" data-d="${ds}" aria-label="${fmtDate(ds)}"><span>${d}</span><span class="dots">${dots}</span></button>`;
    }
    let h = `<section class="card"><div class="sec-h"><div class="mnav"><button class="icon-btn" data-act="calPrev" aria-label="Previous month">${ICON.left}</button><button class="icon-btn" data-act="calNext" aria-label="Next month">${ICON.right}</button></div><h2>${MONL[m - 1]} ${y}</h2></div>
      <div class="cal-grid">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => `<span class="cal-h">${x.slice(0, 2)}</span>`).join("")}${cells}</div>
      <div class="cal-key"><span><i class="dot-ev"></i>Events</span><span><i class="dot-task"></i>Tasks</span><span><i class="dot-bill"></i>Bills</span><span><i class="dot-date"></i>Birthdays</span></div></section>`;
    const it = dayItems(calDay);
    let list = "";
    it.dates.forEach((d) => (list += `<div class="item"><span class="time">All day</span><div class="body"><div class="t">${esc(d.title)}</div></div></div>`));
    it.events.forEach((e) => (list += `<div class="item"><span class="time">${e.allDay ? "All day" : fmtTime(evTime(e))}</span><div class="body"><div class="t">${esc(e.title)}</div><div class="m"><span class="chip">Calendar</span>${e.location ? `<span>${esc(e.location)}</span>` : ""}</div></div></div>`));
    it.meetings.forEach((mt) => (list += `<div class="item"><span class="time">${mt.time ? fmtTime(mt.time) : ""}</span><button class="body" data-act="openMeeting" data-id="${mt.id}"><div class="t">${esc(mt.title || "Meeting")}</div><div class="m"><span class="chip acc">Meeting</span></div></button></div>`));
    it.bills.forEach((b) => (list += `<div class="item"><span class="time"></span><button class="body" data-act="openBill" data-id="${b.id}"><div class="t">${esc(b.name)} due</div><div class="m"><span class="chip bad">Bill</span><span>${money(b.amt)}</span></div></button></div>`));
    list += it.tasks.sort(X.byTime).map((x) => X.taskRow(x, false)).join("");
    h += `<section class="card"><div class="sec-h"><h2>${esc(relDay(calDay))}</h2>${calLinked() ? `<button class="link" data-act="calRefresh">${CAL.loading ? "Refreshing…" : "Refresh"}</button>` : `<a class="link" href="#settings">Link a calendar</a>`}</div>
      <div class="row"><input class="field" id="qaDay" placeholder="Add a task for this day" autocomplete="off" enterkeyhint="done"><button class="btn primary" data-act="qaDay">Add</button></div>
      <div class="list" style="margin-top:8px">${list || empty("Nothing on this day.", "Tasks, meetings, bills and birthdays for the day you pick show here.")}</div>
      ${CAL.error ? `<p class="small" style="color:var(--bad);margin:10px 0 0">${esc(CAL.error)}</p>` : ""}</section>`;
    return h;
  }

  function projectsTab() {
    const act = S.projects.items.filter((p) => !p.archived), arch = S.projects.items.filter((p) => p.archived);
    const row = (p) => {
      const ts = projectTasks(p.id), done = ts.filter((x) => x.done).length, pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
      return `<div class="item"><button class="body" data-act="openProject" data-id="${p.id}"><div class="t" style="font-weight:500">${esc(p.name || "Untitled project")}</div>
        <div class="meter" style="height:6px;margin:8px 0 6px"><i style="width:${pct}%"></i></div>
        <div class="m"><span class="num">${done}/${ts.length} done</span>${p.due ? `<span class="chip ${daysUntil(p.due) < 0 ? "bad" : ""}">Due ${esc(fmtDate(p.due))}</span>` : ""}</div></button></div>`;
    };
    let h = `<section class="card"><div class="row"><input class="field" id="projIn" placeholder="New project or goal, e.g. Q4 launch" autocomplete="off" enterkeyhint="done"><button class="btn primary" data-act="projAdd">Add</button></div></section>`;
    h += section("Projects", `<div class="list">${act.length ? act.map(row).join("") : empty("No projects yet.", "Group related tasks under a project or goal and watch the progress bar fill.")}</div>`);
    if (arch.length) h += section("Finished", `<div class="list">${arch.map(row).join("")}</div>`);
    return h;
  }

  function meetingsTab() {
    const t = today();
    const up = S.meetings.items.filter((m) => m.date >= t || !m.date).sort((a, b) => (a.date || "9").localeCompare(b.date || "9") || (a.time || "").localeCompare(b.time || ""));
    const past = S.meetings.items.filter((m) => m.date && m.date < t).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    const row = (m) => {
      const openA = (m.actions || []).filter((a) => !a.taskId).length;
      return `<div class="item"><span class="time" style="width:58px">${m.date ? esc(m.date === t ? "Today" : MON[parseYmd(m.date).getMonth()] + " " + parseYmd(m.date).getDate()) : ""}${m.time ? "<br>" + fmtTime(m.time) : ""}</span><button class="body" data-act="openMeeting" data-id="${m.id}"><div class="t">${esc(m.title || "Meeting")}</div><div class="m">${m.who ? `<span>${esc(m.who)}</span>` : ""}${openA ? `<span class="chip hi">${plural(openA, "action")} to assign</span>` : ""}${m.project ? `<span class="chip">${esc(projectName(m.project))}</span>` : ""}</div></button></div>`;
    };
    let h = `<button class="btn primary" data-act="newMeeting" style="width:100%">New meeting</button>`;
    h += section("Upcoming", `<div class="list">${up.length ? up.map(row).join("") : empty("No meetings planned.", "Add a meeting to keep its agenda, notes and decisions together.")}</div>`);
    if (past.length) h += section("Past", `<div class="list">${past.map(row).join("")}</div>`);
    return h;
  }

  /* ================= MONEY tabs ================= */
  let moneyTab = "overview";
  const moneySeg = () => seg([["overview", "Overview"], ["bills", "Bills"], ["savings", "Savings"]], moneyTab, "moneyTab");
  const PER_MONTH = { day: 30.4, weekday: 21.7, week: 4.35, "2week": 2.17, month: 1, quarter: 1 / 3, year: 1 / 12 };

  function billsTab() {
    const bs = activeBills().sort((a, b) => a.due.localeCompare(b.due));
    const monthly = bs.filter((b) => b.repeat).reduce((s, b) => s + b.amt * (PER_MONTH[b.repeat] || 0), 0);
    const next30 = bs.filter((b) => daysUntil(b.due) <= 30).reduce((s, b) => s + b.amt, 0);
    const subs = bs.filter((b) => b.kind === "sub");
    let h = `<section class="card"><div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><b style="font-size:20px">${money(Math.round(monthly))}</b><span>a month on repeating bills</span></div><div class="stat"><b style="font-size:20px">${money(next30)}</b><span>due in the next 30 days</span></div></div>${subs.length ? `<p class="small muted" style="margin:10px 0 0">${plural(subs.length, "subscription")} costing ${money(Math.round(subs.reduce((s, b) => s + b.amt * (PER_MONTH[b.repeat] || 0), 0)))} a month.</p>` : ""}</section>`;
    h += `<button class="btn primary" data-act="newBill" style="width:100%">Add a bill or subscription</button>`;
    const row = (b) => {
      const n = daysUntil(b.due);
      return `<div class="item" style="align-items:center"><button class="body" data-act="openBill" data-id="${b.id}"><div class="t">${esc(b.name)}</div><div class="m"><span class="chip ${n < 0 ? "bad" : n <= 3 ? "hi" : ""}">${n < 0 ? "Overdue" : "Due " + whenText(b.due).toLowerCase()}</span><span>${b.repeat ? esc(repeatLabel(b.repeat)) : "One-off"}</span>${b.kind === "sub" ? '<span class="chip acc">Subscription</span>' : ""}</div></button><span class="amt">${money(b.amt)}</span><button class="btn small-btn" data-act="billPaid" data-id="${b.id}">Paid</button></div>`;
    };
    h += section("Upcoming", `<div class="list">${bs.length ? bs.map(row).join("") : empty("No bills yet.", "Add rent, internet, DSTV, school fees or subscriptions. Toby reminds you before each is due, and marking one paid logs it in your spending.")}</div>`);
    const done = S.bills.items.filter((b) => b.active === false);
    if (done.length) h += section("Paid one-offs", `<div class="list">${done.map((b) => `<div class="item"><button class="body" data-act="openBill" data-id="${b.id}"><div class="t">${esc(b.name)}</div><div class="m"><span>${money(b.amt)}</span></div></button></div>`).join("")}</div>`);
    return h;
  }

  const goalSaved = (g) => (g.log || []).reduce((s, x) => s + x.amt, 0);
  function savingsTab() {
    const gs = S.savings.items;
    const total = gs.reduce((s, g) => s + goalSaved(g), 0);
    let h = `<section class="card"><h3>Saved towards goals</h3><div class="big" style="margin-top:6px">${money(total)}</div></section>`;
    h += `<section class="card"><div class="row"><input class="field" id="goalIn" placeholder="New goal, e.g. Car fund" autocomplete="off" enterkeyhint="done"><button class="btn primary" data-act="goalAdd">Add</button></div></section>`;
    const row = (g) => {
      const saved = goalSaved(g), pct = g.target ? Math.min(100, (saved / g.target) * 100) : 0;
      let pace = "";
      if (g.deadline && g.target > saved) {
        const months = Math.max(1, (parseYmd(g.deadline) - parseYmd(today())) / (30.4 * 864e5));
        pace = `${money(Math.ceil((g.target - saved) / months))}/month to reach it by ${MON[parseYmd(g.deadline).getMonth()]} ${parseYmd(g.deadline).getFullYear()}`;
      } else if (g.target && saved >= g.target) pace = "Goal reached";
      return `<div class="item"><button class="body" data-act="openGoal" data-id="${g.id}"><div class="row" style="justify-content:space-between"><span class="t" style="font-weight:500">${esc(g.name)}</span><span class="amt">${money(saved)}${g.target ? ` <span class="muted">of ${money(g.target)}</span>` : ""}</span></div>
        <div class="meter" style="height:8px;margin:8px 0 6px"><i style="width:${pct}%;background:var(--good)"></i></div><div class="m"><span>${pace || (g.target ? Math.round(pct) + "%" : "Tap to set a target")}</span></div></button></div>`;
    };
    h += section("Goals", `<div class="list">${gs.length ? gs.map(row).join("") : empty("No savings goals yet.", "Set a target like an emergency fund, a car or a trip, and log what you put aside.")}</div>`);
    return h;
  }

  /* ================= HABITS: health ================= */
  const hlog = (d) => S.health.log[d] || {};
  function setHealth(field, v) {
    const d = today();
    const e = { ...(S.health.log[d] || {}) };
    if (v === "" || v == null || (typeof v === "number" && !isFinite(v))) delete e[field];
    else e[field] = v;
    if (Object.keys(e).length) S.health.log[d] = e;
    else delete S.health.log[d];
  }
  function healthCard() {
    const t = today(), h = hlog(t), goal = S.health.waterGoal || 8, w = h.water || 0;
    const days = []; for (let i = 13; i >= 0; i--) days.push(addDays(t, -i));
    const bars = (field, max, color, fmt) => {
      const vals = days.map((d) => hlog(d)[field] || 0);
      const top = Math.max(max, ...vals);
      return `<div class="hbars">${days.map((d, i) => `<div class="hbar" title="${fmtDate(d)}: ${vals[i] ? fmt(vals[i]) : "—"}"><i style="height:${top ? (vals[i] / top) * 100 : 0}%;background:${color}"></i><span>${DOW[parseYmd(d).getDay()][0]}</span></div>`).join("")}</div>`;
    };
    const weights = days.map((d) => hlog(d).weight).map((v, i) => (v ? { i, v } : null)).filter(Boolean);
    let weightChart = '<p class="small muted" style="margin:0">Log your weight a few times to see the trend.</p>';
    if (weights.length >= 2) {
      const vs = weights.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
      const pts = weights.map((p) => `${(p.i / 13) * 280 + 10},${70 - ((p.v - lo) / span) * 54}`).join(" ");
      const last = weights[weights.length - 1], first = weights[0], diff = last.v - first.v;
      weightChart = `<svg viewBox="0 0 300 82" class="spark" role="img" aria-label="Weight over 14 days"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${weights.map((p) => `<circle cx="${(p.i / 13) * 280 + 10}" cy="${70 - ((p.v - lo) / span) * 54}" r="3" fill="var(--accent)"/>`).join("")}</svg><div class="kv"><span class="muted">${lo}–${hi} kg</span><span class="num">${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg in 2 weeks</span></div>`;
    }
    return `<section class="card"><div class="sec-h"><h2>Health today</h2><span class="small muted">Entered by hand</span></div>
      <div class="health-row"><div><b>Water</b><span class="small muted">${w} of ${goal} glasses</span></div><div class="stepper"><button class="icon-btn" data-act="water" data-v="-1" aria-label="One glass less">−</button><span class="num">${w}</span><button class="icon-btn" data-act="water" data-v="1" aria-label="One more glass">+</button></div></div>
      <div class="meter" style="height:6px;margin:2px 0 12px"><i style="width:${Math.min(100, (w / goal) * 100)}%;background:var(--accent)"></i></div>
      <div class="grid2"><label class="lbl">Sleep last night (hours)<input class="field num" id="hSleep" inputmode="decimal" value="${h.sleep ?? ""}" placeholder="e.g. 7.5"></label><label class="lbl">Weight (kg)<input class="field num" id="hWeight" inputmode="decimal" value="${h.weight ?? ""}" placeholder="Optional"></label></div></section>
      <section class="card"><div class="sec-h"><h2>Last 14 days</h2></div>
      <h3>Water (glasses)</h3>${bars("water", goal, "var(--accent)", (v) => v + " glasses")}
      <h3 style="margin-top:14px">Sleep (hours)</h3>${bars("sleep", 8, "var(--good)", (v) => v + " h")}
      <h3 style="margin:14px 0 6px">Weight</h3>${weightChart}</section>`;
  }

  /* ================= PEOPLE ================= */
  let peopleQuery = "";
  const FOLLOW = [[0, "No reminder"], [7, "Every week"], [14, "Every 2 weeks"], [30, "Every month"], [90, "Every 3 months"], [180, "Every 6 months"]];
  function peopleList(q) {
    const ps = S.people.items.filter((p) => p.name && (!q || (p.name + " " + (p.role || "") + " " + (p.notes || "")).toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
    if (!ps.length) return empty(q ? "No one matches." : "No one here yet.", q ? "Try another name." : "Add clients, colleagues, friends and family with their birthdays and how often you want to stay in touch.");
    return ps.map((p) => `<div class="item"><span class="avatar" aria-hidden="true">${esc(p.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase())}</span><button class="body" data-act="openPerson" data-id="${p.id}"><div class="t">${esc(p.name)}</div><div class="m">${p.role ? `<span>${esc(p.role)}</span>` : ""}${p.bday ? `<span class="chip">Birthday ${mdLabel(p.bday)}</span>` : ""}${p.followEvery ? `<span class="chip acc">${esc((FOLLOW.find((f) => f[0] === p.followEvery) || ["", ""])[1])}</span>` : ""}</div></button></div>`).join("");
  }
  function peopleView() {
    const t = today();
    let h = `<section class="card"><div class="row"><input class="field" id="peopleSearch" type="search" placeholder="Search people" value="${esc(peopleQuery)}" autocomplete="off"><button class="btn primary" data-act="newPerson">Add</button></div></section>`;
    const fu = followUpsDue();
    if (fu.length) h += section("Time to catch up", `<div class="list">${fu.map((p) => `<div class="item" style="align-items:center"><button class="body" data-act="openPerson" data-id="${p.id}"><div class="t">${esc(p.name)}</div><div class="m"><span>${p.last ? "Last time: " + esc(relDay(p.last)) : "Not logged yet"}</span></div></button><button class="btn small-btn" data-act="personContacted" data-id="${p.id}">Done</button></div>`).join("")}</div>`);
    const soon = allDates().map((d) => ({ ...d, next: nextYearly(d.md, t) })).filter((d) => daysUntil(d.next) <= 30).sort((a, b) => a.next.localeCompare(b.next));
    if (soon.length) h += section("Coming up", `<div class="list">${soon.map((d) => `<div class="item"><button class="body" data-act="${d.kind === "bday" ? "openPerson" : "openOccasion"}" data-id="${d.id}"><div class="t">${esc(d.title)}${d.year ? ` <span class="muted small">(${+d.next.slice(0, 4) - d.year} years)</span>` : ""}</div><div class="m"><span class="chip ${daysUntil(d.next) === 0 ? "hi" : "acc"}">${daysUntil(d.next) === 0 ? "Today" : whenText(d.next)}</span><span>${mdLabel(d.md)}</span></div></button></div>`).join("")}</div>`);
    h += section("Everyone", `<div class="list" id="peopleList">${peopleList(peopleQuery.toLowerCase())}</div>`, `<span class="small muted num">${S.people.items.filter((p) => p.name).length}</span>`);
    h += section("Other dates", `<div class="list">${S.people.dates.length ? S.people.dates.slice().sort((a, b) => a.md.localeCompare(b.md)).map((o) => `<div class="item"><button class="body" data-act="openOccasion" data-id="${o.id}"><div class="t">${esc(o.title)}</div><div class="m"><span>${mdLabel(o.md)}${o.year ? " " + o.year : ""}</span></div></button></div>`).join("") : empty("Anniversaries and other yearly dates.", "Add them here and Toby reminds you ahead of time.")}</div><button class="btn" data-act="newOccasion" style="margin-top:10px">Add a date</button>`);
    return h;
  }

  let curPerson = null;
  function personSheet(p) {
    curPerson = p.id;
    const [bm, bd] = (p.bday || "-").split("-");
    const digits = (p.phone || "").replace(/[^\d+]/g, "");
    const quick = [
      digits ? `<a class="btn" href="tel:${esc(digits)}">Call</a>` : "",
      digits ? `<a class="btn" href="https://wa.me/${esc(digits.replace(/^\+/, "").replace(/^0/, "234"))}" target="_blank" rel="noopener">WhatsApp</a>` : "",
      p.email ? `<a class="btn" href="mailto:${esc(p.email)}">Email</a>` : "",
    ].join("");
    X.openSheet(`<h2>${p.name ? esc(p.name) : "New person"}</h2>
      ${quick ? `<div class="btns">${quick}</div>` : ""}
      <input class="field" id="psName" placeholder="Name" value="${esc(p.name)}" autocomplete="off">
      <input class="field" id="psRole" placeholder="Role, company or relationship" value="${esc(p.role || "")}" autocomplete="off">
      <div class="grid2"><label class="lbl">Phone<input class="field" id="psPhone" type="tel" value="${esc(p.phone || "")}" autocomplete="off"></label><label class="lbl">Email<input class="field" id="psEmail" type="email" value="${esc(p.email || "")}" autocomplete="off"></label></div>
      <div class="grid2"><label class="lbl">Birthday month<select class="field" id="psBM">${monthOpts(bm)}</select></label><label class="lbl">Day<select class="field" id="psBD">${dayOpts(bd)}</select></label></div>
      <label class="lbl">Remind me to keep in touch<select class="field" id="psFollow">${FOLLOW.map(([v, l]) => opt(v, l, p.followEvery || 0)).join("")}</select></label>
      <label class="lbl">Notes<textarea class="field" id="psNotes" style="min-height:90px" placeholder="Kids’ names, preferences, what you talked about">${esc(p.notes || "")}</textarea></label>
      <div><h3 style="margin-bottom:8px">Catch-ups</h3><div class="row"><input class="field" id="psLogIn" placeholder="What did you talk about? (optional)" autocomplete="off"><button class="btn" data-act="personLog">Log</button></div>
      <div class="list" id="psLog" style="margin-top:6px">${personLog(p)}</div></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="closeSheet">Done</button><button class="btn danger" data-act="delPerson" data-id="${p.id}">Delete</button></div>
      <p class="small muted" style="margin:0">Changes save as you type.</p>`,
      (s) => { if (!p.name) s.querySelector("#psName").focus(); },
      () => { const cur = S.people.items.find((x) => x.id === p.id); if (cur && !cur.name.trim()) { S.people.items = S.people.items.filter((x) => x.id !== p.id); save("people"); } curPerson = null; });
  }
  const personLog = (p) => (p.log || []).slice(-6).reverse().map((l) => `<div class="item"><div class="body"><div class="t small">${esc(relDay(l.date))}</div>${l.note ? `<div class="m">${esc(l.note)}</div>` : ""}</div></div>`).join("") || '<p class="small muted" style="margin:4px 0 0">No catch-ups logged yet.</p>';

  function occasionSheet(o) {
    const isNew = !o; o = o || { title: "", md: "", year: "", remind: 3 };
    const [m, d] = (o.md || "-").split("-");
    X.openSheet(`<h2>${isNew ? "Add a date" : "Edit date"}</h2>
      <input class="field" id="ocTitle" placeholder="e.g. Wedding anniversary" value="${esc(o.title)}">
      <div class="grid2"><label class="lbl">Month<select class="field" id="ocM">${monthOpts(m)}</select></label><label class="lbl">Day<select class="field" id="ocD">${dayOpts(d)}</select></label></div>
      <div class="grid2"><label class="lbl">Year it started (optional)<input class="field num" id="ocYear" inputmode="numeric" value="${esc(o.year || "")}" placeholder="e.g. 2018"></label><label class="lbl">Remind me<select class="field" id="ocRemind">${[[0, "On the day only"], [1, "1 day before"], [3, "3 days before"], [7, "A week before"], [14, "2 weeks before"]].map(([v, l]) => opt(v, l, o.remind ?? 3)).join("")}</select></label></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="saveOccasion" data-id="${o.id || ""}">Save</button>${isNew ? "" : `<button class="btn danger" data-act="delOccasion" data-id="${o.id}">Delete</button>`}</div>`,
      (s) => { if (isNew) s.querySelector("#ocTitle").focus(); });
  }

  /* ================= meetings / projects sheets ================= */
  let curMeeting = null;
  function meetingSheet(m) {
    curMeeting = m.id;
    const people = S.people.items.filter((p) => p.name).map((p) => `<option value="${esc(p.name)}">`).join("");
    X.openSheet(`<h2>${m.title ? "Meeting" : "New meeting"}</h2>
      <input class="field" id="mtTitle" placeholder="What’s it about?" value="${esc(m.title)}" autocomplete="off">
      <div class="grid2"><label class="lbl">Date<input class="field" type="date" id="mtDate" value="${esc(m.date)}"></label><label class="lbl">Time<input class="field" type="time" id="mtTime" value="${esc(m.time)}"></label></div>
      <label class="lbl">With<input class="field" id="mtWho" list="peopleNames" placeholder="Names, separated by commas" value="${esc(m.who || "")}" autocomplete="off"><datalist id="peopleNames">${people}</datalist></label>
      <label class="lbl">Project<select class="field" id="mtProj">${opt("", "None", m.project || "")}${S.projects.items.filter((p) => !p.archived || p.id === m.project).map((p) => opt(p.id, p.name, m.project || "")).join("")}</select></label>
      <label class="lbl">Agenda, notes and decisions<textarea class="field" id="mtNotes" style="min-height:140px" placeholder="What to cover, what was said, what was decided">${esc(m.notes || "")}</textarea></label>
      <div><h3 style="margin-bottom:8px">Action items</h3><div class="row"><input class="field" id="mtActIn" placeholder="e.g. Send revised quote to Ada" autocomplete="off" enterkeyhint="done"><button class="btn" data-act="mtAddAction">Add</button></div>
      <div class="list" id="mtActions" style="margin-top:6px">${meetingActions(m)}</div></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="closeSheet">Done</button><button class="btn danger" data-act="delMeeting" data-id="${m.id}">Delete</button></div>
      <p class="small muted" style="margin:0">Changes save as you type.</p>`,
      (s) => { if (!m.title) s.querySelector("#mtTitle").focus(); },
      () => { const cur = S.meetings.items.find((x) => x.id === m.id); if (cur && !cur.title.trim() && !(cur.notes || "").trim() && !(cur.actions || []).length) { S.meetings.items = S.meetings.items.filter((x) => x.id !== m.id); save("meetings"); } curMeeting = null; });
  }
  const meetingActions = (m) => (m.actions || []).map((a) => {
    const task = a.taskId && S.tasks.items.find((t) => t.id === a.taskId);
    return `<div class="item" style="align-items:center"><div class="body"><div class="t${task && task.done ? " muted" : ""}">${esc(a.text)}</div></div>${task ? `<span class="chip ${task.done ? "" : "acc"}">${task.done ? "Done" : "In tasks"}</span>` : `<button class="btn small-btn" data-act="mtMakeTask" data-id="${a.id}">Make task</button>`}<button class="icon-btn" data-act="mtDelAction" data-id="${a.id}" aria-label="Remove">×</button></div>`;
  }).join("") || '<p class="small muted" style="margin:4px 0 0">Turn each follow-up into a task with one tap.</p>';

  let curProject = null;
  function projectSheet(p) {
    curProject = p.id;
    const ts = projectTasks(p.id).sort((a, b) => a.done - b.done || X.byTime(a, b));
    X.openSheet(`<h2>Project</h2>
      <input class="field" id="pjName" placeholder="Project or goal name" value="${esc(p.name)}" autocomplete="off">
      <div class="grid2"><label class="lbl">Target date<input class="field" type="date" id="pjDue" value="${esc(p.due || "")}"></label><label class="lbl">Status<select class="field" id="pjArch">${opt("0", "Active", p.archived ? "1" : "0")}${opt("1", "Finished", p.archived ? "1" : "0")}</select></label></div>
      <label class="lbl">Notes<textarea class="field" id="pjNotes" style="min-height:80px" placeholder="What does done look like?">${esc(p.notes || "")}</textarea></label>
      <div><h3 style="margin-bottom:8px">Tasks</h3><div class="row"><input class="field" id="qaProj" placeholder="Add a task to this project" autocomplete="off" enterkeyhint="done"><button class="btn" data-act="qaProj">Add</button></div>
      <div class="list" id="pjTasks" style="margin-top:6px">${ts.map((t) => X.taskRow(t, true)).join("") || '<p class="small muted" style="margin:4px 0 0">No tasks yet.</p>'}</div></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="closeSheet">Done</button><button class="btn danger" data-act="delProject" data-id="${p.id}">Delete</button></div>`,
      (s) => { if (!p.name) s.querySelector("#pjName").focus(); },
      () => { curProject = null; });
  }
  function refreshProjectTasks() {
    const el = $("#pjTasks"); if (!el || !curProject) return;
    el.innerHTML = projectTasks(curProject).sort((a, b) => a.done - b.done || X.byTime(a, b)).map((t) => X.taskRow(t, true)).join("") || '<p class="small muted" style="margin:4px 0 0">No tasks yet.</p>';
  }

  /* ================= bills / goals sheets ================= */
  function billSheet(b) {
    const isNew = !b;
    b = b || { name: "", amt: "", cat: "Bills", due: today(), repeat: "month", kind: "bill", remind: 2 };
    const hist = (b.history || []).slice(-5).reverse();
    X.openSheet(`<h2>${isNew ? "New bill" : esc(b.name)}</h2>
      <input class="field" id="blName" placeholder="e.g. Rent, DSTV, Netflix" value="${esc(b.name)}" autocomplete="off">
      <div class="grid2"><label class="lbl">Amount<input class="field num" id="blAmt" inputmode="decimal" value="${esc(b.amt)}" placeholder="0"></label><label class="lbl">Next due<input class="field" type="date" id="blDue" value="${esc(b.due || today())}"></label></div>
      <div class="grid2"><label class="lbl">Repeats<select class="field" id="blRep">${opt("", "Just once", b.repeat)}${REPEATS.filter((r) => ["week", "2week", "month", "quarter", "year"].includes(r[0])).map(([v, l]) => opt(v, l, b.repeat)).join("")}</select></label><label class="lbl">Category<select class="field" id="blCat">${OUT_CATS.map((c) => opt(c, c, b.cat)).join("")}</select></label></div>
      <div class="grid2"><label class="lbl">Type<select class="field" id="blKind">${opt("bill", "Bill", b.kind)}${opt("sub", "Subscription", b.kind)}</select></label><label class="lbl">Remind me<select class="field" id="blRemind">${[[-1, "No reminder"], [0, "On the day"], [1, "1 day before"], [2, "2 days before"], [3, "3 days before"], [7, "A week before"]].map(([v, l]) => opt(v, l, b.remind ?? 2)).join("")}</select></label></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="saveBill" data-id="${b.id || ""}">${isNew ? "Add bill" : "Save"}</button>${isNew ? "" : `<button class="btn danger" data-act="delBill" data-id="${b.id}">Delete</button>`}</div>
      ${hist.length ? `<div><h3 style="margin-bottom:6px">Recent payments</h3>${hist.map((x) => `<div class="kv"><span class="muted">${esc(fmtDate(x.date))}</span><span class="num">${money(x.amt)}</span></div>`).join("")}</div>` : ""}`,
      (s) => { if (isNew) s.querySelector("#blName").focus(); });
  }
  function payBill(b) {
    const t = today();
    S.money.entries.push({ id: newId(), type: "out", amt: b.amt, cat: b.cat || "Bills", note: b.name, date: t, ts: Date.now(), bill: b.id });
    b.history = [...(b.history || []), { date: t, amt: b.amt }].slice(-24);
    if (b.repeat) { if (!b.anchor) b.anchor = +b.due.slice(8); b.due = nextDate(b.due, b.repeat, b.anchor); }
    else b.active = false;
    save("money"); save("bills");
    X.toast(`Paid ${b.name}. ${b.repeat ? "Next due " + fmtDate(b.due) + "." : "Logged in spending."}`);
  }

  function goalSheet(g) {
    const saved = goalSaved(g);
    X.openSheet(`<h2>${esc(g.name || "Goal")}</h2>
      <div class="big" style="font-size:30px">${money(saved)}${g.target ? `<span class="muted" style="font-size:16px"> of ${money(g.target)}</span>` : ""}</div>
      <div class="row"><input class="field num" id="glAmt" inputmode="decimal" placeholder="Amount" autocomplete="off"><button class="btn primary" data-act="glAdd" data-id="${g.id}">Add</button><button class="btn" data-act="glTake" data-id="${g.id}">Take out</button></div>
      <input class="field" id="glName" placeholder="Goal name" value="${esc(g.name)}">
      <div class="grid2"><label class="lbl">Target amount<input class="field num" id="glTarget" inputmode="decimal" value="${esc(g.target || "")}" placeholder="0"></label><label class="lbl">Reach it by<input class="field" type="date" id="glDeadline" value="${esc(g.deadline || "")}"></label></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="saveGoal" data-id="${g.id}">Save</button><button class="btn danger" data-act="delGoal" data-id="${g.id}">Delete</button></div>
      ${(g.log || []).length ? `<div><h3 style="margin-bottom:6px">History</h3>${g.log.slice(-8).reverse().map((x) => `<div class="kv"><span class="muted">${esc(fmtDate(x.date))}</span><span class="num" style="color:${x.amt < 0 ? "var(--bad)" : "var(--good)"}">${x.amt < 0 ? "" : "+"}${money(x.amt)}</span></div>`).join("")}</div>` : ""}`);
  }

  /* ================= LISTS ================= */
  let LISTS = null, listSel = null, listsErr = "", listsLoading = false, unwatchLists = null;
  async function loadLists(seedDefaults) {
    if (listsLoading) return;
    listsLoading = true;
    try {
      let ls = await X.cloud.lists.all();
      if (!ls.length && seedDefaults) {
        for (const [i, n] of ["Shopping", "Reading", "Watch"].entries()) await X.cloud.lists.create(n, i);
        ls = await X.cloud.lists.all();
      }
      LISTS = ls; listsErr = "";
      if (!listSel || !ls.some((l) => l.id === listSel)) listSel = ls[0] ? ls[0].id : null;
      if (!unwatchLists) { let t; unwatchLists = X.cloud.lists.watch(() => { clearTimeout(t); t = setTimeout(() => loadLists(false), 300); }); }
    } catch (e) {
      listsErr = e.message;
      if (LISTS === null) LISTS = []; // show the message instead of retrying on every screen refresh
    } finally {
      listsLoading = false;
    }
    if (X.route() === "lists") X.softRender();
  }
  const curList = () => (LISTS || []).find((l) => l.id === listSel);
  function listsView() {
    if (LISTS === null) { loadLists(true); return listsErr ? section("Lists", `<p class="small" style="color:var(--bad);margin:0">${esc(listsErr)}</p>`) : '<div class="empty">Loading your lists…</div>'; }
    let h = `<div class="chips list-tabs">${LISTS.map((l) => `<button class="chip${l.id === listSel ? " acc" : ""}" data-act="listSel" data-id="${l.id}">${esc(l.name)}${l.items.filter((i) => !i.done).length ? ` <span class="num">${l.items.filter((i) => !i.done).length}</span>` : ""}</button>`).join("")}<button class="chip" data-act="listNew">+ New list</button></div>`;
    if (listsErr) h += `<p class="small" style="color:var(--bad);margin:0">${esc(listsErr)} <button class="link" data-act="listRetry">Try again</button></p>`;
    const l = curList();
    if (!l) return h + empty("No lists yet.", "Create one for shopping, books to read or films to watch.");
    const open = l.items.filter((i) => !i.done), done = l.items.filter((i) => i.done);
    const row = (i) => `<div class="item${i.done ? " done" : ""}" style="align-items:center"><button class="check${i.done ? " on" : ""}" data-act="listToggle" data-id="${i.id}" aria-label="${i.done ? "Mark not done" : "Mark done"}">${ICON.check}</button><div class="body"><div class="t">${/^https?:\/\//.test(i.text) ? `<a href="${esc(i.text)}" target="_blank" rel="noopener">${esc(i.text.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</a>` : esc(i.text)}</div>${i.added_by ? `<div class="m"><span>Added by ${esc(i.added_by)}</span></div>` : ""}</div><button class="icon-btn" data-act="listDelItem" data-id="${i.id}" aria-label="Remove">×</button></div>`;
    h += `<section class="card"><div class="sec-h"><h2>${esc(l.name)}</h2><button class="link" data-act="listMenu">${l.share_token ? "Shared · Options" : "Share · Options"}</button></div>
      <div class="row"><input class="field" id="listIn" placeholder="Add items, separated by commas" autocomplete="off" enterkeyhint="done"><button class="btn primary" data-act="listAdd">Add</button></div>
      <div class="list" style="margin-top:8px">${open.map(row).join("") || empty("All clear.", "Nothing left on this list.")}${done.length ? `<div class="group-h">Done</div>${done.map(row).join("")}` : ""}</div>
      ${done.length ? '<div style="margin-top:12px"><button class="btn" data-act="listClear">Clear done items</button></div>' : ""}</section>`;
    h += `<p class="small muted" style="margin:0">Tip: with Siri set up, say “Add to Toby: buy milk and bread”.</p>`;
    return h;
  }
  async function listOp(fn, msg) {
    try { await fn(); await loadLists(false); if (msg) X.toast(msg); }
    catch (e) { X.toast(e.message); await loadLists(false); }
  }
  function listMenu() {
    const l = curList(); if (!l) return;
    const link = l.share_token ? location.origin + "/s/" + l.share_token : "";
    X.openSheet(`<h2>${esc(l.name)}</h2>
      <label class="lbl">Name<div class="row"><input class="field" id="listName" value="${esc(l.name)}"><button class="btn" data-act="listRename">Rename</button></div></label>
      <div><h3 style="margin-bottom:6px">Share with family</h3>${link
        ? `<p class="small muted" style="margin:0 0 8px">Anyone with this link can see, add and tick items. No account needed.</p><input class="field" id="listLink" value="${esc(link)}" readonly><div class="btns" style="margin-top:8px"><button class="btn primary" data-act="listCopy">Copy link</button><button class="btn" data-act="listUnshare">Stop sharing</button></div>`
        : `<p class="small muted" style="margin:0 0 8px">Make a link others can open to add and tick items, without an account.</p><button class="btn primary" data-act="listShare">Create a share link</button>`}</div>
      <button class="btn danger" data-act="listDelete">Delete list</button>`);
  }

  /* ================= WEEKLY REVIEW ================= */
  const reviewWeek = () => { const t = today(), wd = new Date().getDay(); return wd === 0 || wd === 6 ? weekStart(addDays(t, 7 - ((wd + 6) % 7))) : weekStart(t); };
  function reviewEntry(create) {
    const wk = reviewWeek();
    S.journal.reviews = S.journal.reviews || [];
    let r = S.journal.reviews.find((x) => x.week === wk);
    if (!r && create) { r = { week: wk, wins: "", lessons: "", priorities: ["", "", ""], ts: Date.now() }; S.journal.reviews.push(r); }
    return r;
  }
  function reviewView() {
    const t = today(), from = addDays(t, -6), days = []; for (let i = 6; i >= 0; i--) days.push(addDays(t, -i));
    const since = parseYmd(from).getTime();
    const doneTasks = S.tasks.items.filter((x) => x.done && x.doneAt >= since).sort((a, b) => b.doneAt - a.doneAt);
    const hs = S.habits.items, hDone = hs.reduce((s, x) => s + days.filter((d) => X.isDone(x.id, d)).length, 0);
    const habitPct = hs.length ? Math.round((hDone / (hs.length * 7)) * 100) : null;
    const sleeps = days.map((d) => hlog(d).sleep).filter((v) => v > 0);
    const spent = S.money.entries.filter((e) => e.type !== "in" && e.date >= from && e.date <= t).reduce((s, e) => s + e.amt, 0);
    const cats = {}; S.money.entries.filter((e) => e.type !== "in" && e.date >= from && e.date <= t).forEach((e) => (cats[e.cat] = (cats[e.cat] || 0) + e.amt));
    const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    const r = reviewEntry(false) || { wins: "", lessons: "", priorities: ["", "", ""] };
    const wk = reviewWeek();
    let h = `<p class="small muted" style="margin:0">${esc(fmtDate(from))} – ${esc(fmtDate(t))}</p>`;
    h += `<div class="stats"><div class="stat"><b>${doneTasks.length}</b><span>tasks done</span></div><div class="stat"><b>${habitPct == null ? "—" : habitPct + "%"}</b><span>habit consistency</span></div><div class="stat"><b style="font-size:18px;padding-top:6px">${money(spent)}</b><span>spent</span></div></div>`;
    h += section("Finished", doneTasks.length ? `<ul class="plain">${doneTasks.slice(0, 10).map((x) => `<li>${esc(x.title)}</li>`).join("")}${doneTasks.length > 10 ? `<li class="muted">and ${doneTasks.length - 10} more</li>` : ""}</ul>` : '<p class="small muted" style="margin:0">Nothing marked done this week.</p>');
    if (hs.length) h += section("Habits", hs.map((x) => { const n = days.filter((d) => X.isDone(x.id, d)).length; return `<div class="cat-row"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span><div class="cat-bar"><i style="width:${(n / 7) * 100}%;background:var(--good)"></i></div><span class="num small">${n}/7</span></div>`; }).join(""));
    const moods = days.map((d) => (S.journal.entries.find((e) => e.date === d) || {}).mood || 0);
    h += section("Mood and energy", `<div class="mood-strip">${days.map((d, i) => `<div><span class="small muted">${DOW[parseYmd(d).getDay()].slice(0, 2)}</span><b>${moods[i] ? X.MOODS[moods[i] - 1][0] : "—"}</b></div>`).join("")}</div>${sleeps.length ? `<p class="small muted" style="margin:10px 0 0">Average sleep ${(sleeps.reduce((a, b) => a + b, 0) / sleeps.length).toFixed(1)} hours over ${plural(sleeps.length, "night")}.</p>` : ""}`);
    const bud = S.money.budget || 0;
    const mt = X.monthTotals(t.slice(0, 7));
    const dayOfMonth = new Date().getDate(), dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    h += section("Money", `<div class="kv"><span class="muted">Spent this week</span><span class="num">${money(spent)}</span></div>${topCat ? `<div class="kv"><span class="muted">Biggest category</span><span>${esc(topCat[0])} · ${money(topCat[1])}</span></div>` : ""}${bud ? `<div class="kv"><span class="muted">Month so far</span><span class="num" style="color:${mt.out > (bud * dayOfMonth) / dim ? "var(--bad)" : "var(--good)"}">${money(mt.out)} of ${money(bud)}</span></div><p class="small muted" style="margin:4px 0 0">${mt.out > (bud * dayOfMonth) / dim ? "Spending is running ahead of your budget for this point in the month." : "You're on pace with your budget."}</p>` : ""}${S.savings.items.length ? S.savings.items.slice(0, 3).map((g) => `<div class="kv"><span class="muted">${esc(g.name)}</span><span class="num">${money(goalSaved(g))}${g.target ? " of " + money(g.target) : ""}</span></div>`).join("") : ""}`);
    const next = [];
    for (let i = 1; i <= 7; i++) {
      const d = addDays(t, i), it = dayItems(d);
      it.tasks.filter((x) => !x.done).forEach((x) => next.push([d, x.title]));
      it.meetings.forEach((x) => next.push([d, "Meeting: " + (x.title || "")]));
      it.events.forEach((x) => next.push([d, x.title]));
      it.bills.forEach((x) => next.push([d, x.name + " due (" + money(x.amt) + ")"]));
      it.dates.forEach((x) => next.push([d, x.title]));
    }
    h += section("Next 7 days", next.length ? `<div class="list">${next.slice(0, 15).map(([d, s]) => `<div class="item"><span class="time" style="width:40px">${DOW[parseYmd(d).getDay()]}</span><div class="body"><div class="t">${esc(s)}</div></div></div>`).join("")}</div>${next.length > 15 ? `<p class="small muted" style="margin:6px 0 0">and ${next.length - 15} more in Plan.</p>` : ""}` : '<p class="small muted" style="margin:0">A quiet week ahead so far.</p>');
    h += section(`Your focus for the week of ${esc(fmtDate(wk))}`, `
      <label class="lbl">What went well?<textarea class="field" id="rvWins" style="min-height:70px">${esc(r.wins)}</textarea></label>
      <label class="lbl" style="margin-top:10px">What would you change?<textarea class="field" id="rvLessons" style="min-height:70px">${esc(r.lessons)}</textarea></label>
      <div style="margin-top:12px"><h3 style="margin-bottom:6px">Top 3 priorities</h3>${[0, 1, 2].map((i) => `<input class="field" id="rvP${i}" style="margin-top:6px" placeholder="Priority ${i + 1}" value="${esc((r.priorities || [])[i] || "")}">`).join("")}</div>
      <p class="small muted" style="margin:10px 0 0" id="rvSaved">Saves as you type. Your priorities show on Today all week.</p>`);
    return h;
  }

  /* ================= MORE ================= */
  function moreView() {
    const t = today();
    const je = S.journal.entries.find((e) => e.date === t);
    const tiles = [
      ["journal", "Journal", je && (je.text || je.mood) ? "Written today" : "Not written today", '<path d="M5 3.5h11a3 3 0 013 3v14H8a3 3 0 01-3-3z"/><path d="M5 17.5a3 3 0 013-3h11M9 8h6"/>'],
      ["lists", "Lists", LISTS ? plural(LISTS.length, "list") : "Shopping, reading, watch", '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.6"/>'],
      ["review", "Weekly review", reviewEntry(false) ? "Done this week" : "Look back, plan ahead", '<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>'],
      ["notes", "Notes", plural(S.notes.items.length, "note"), '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>'],
      ["calc", "Calculator", "Split bills, VAT, % change", '<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>'],
      ["settings", "Settings", "Notifications, calendar, Siri", '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'],
    ];
    return `<div class="tiles">${tiles.map(([r, n, s, ic]) => `<a class="tile" href="#${r}"><svg viewBox="0 0 24 24">${ic}</svg><b>${n}</b><span>${esc(s)}</span></a>`).join("")}</div>
      <p class="small muted" style="margin:0">Search everything with the magnifier at the top of any screen.</p>`;
  }

  /* ================= SETTINGS extras ================= */
  let newKey = "", keyCount = null;
  function settingsCards() {
    const linked = calLinked();
    let h = section("Calendar", `<p class="small muted" style="margin:0 0 10px">Show events from Google, iCloud or Outlook calendars in Today, Plan and your morning briefing. Paste each calendar’s private iCal link on its own line.</p>
      <textarea class="field" id="setCals" style="min-height:70px;font-family:var(--f-mono);font-size:12px" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics">${esc(S.settings.calendars || "")}</textarea>
      ${linked ? `<p class="small" style="margin:8px 0 0">${CAL.error ? `<span style="color:var(--bad)">${esc(CAL.error)}</span>` : CAL.at ? `${plural(CAL.events.length, "event")} loaded ${esc(relDay(ymd(new Date(CAL.at))).toLowerCase())} at ${fmtTime(pad(new Date(CAL.at).getHours()) + ":" + pad(new Date(CAL.at).getMinutes()))}.` : "Not loaded yet."}${(CAL.problems || []).map((p) => `<br><span style="color:var(--bad)">${esc(p)}</span>`).join("")}</p><button class="btn" data-act="calRefresh" style="margin-top:8px">${CAL.loading ? "Loading…" : "Load now"}</button>` : ""}
      <details style="margin-top:10px"><summary class="small">Where do I find the link?</summary><ul class="small muted plain-steps">
        <li><b>Google Calendar</b> (on a computer): Settings → pick your calendar under “Settings for my calendars” → Integrate calendar → copy <b>Secret address in iCal format</b>.</li>
        <li><b>iCloud</b>: Calendar app → tap ⓘ next to a calendar → turn on Public Calendar → Share Link.</li>
        <li><b>Outlook</b>: Settings → Calendar → Shared calendars → Publish a calendar → copy the ICS link.</li>
        <li>Keep these links private: anyone with one can see that calendar.</li></ul></details>`);
    h += section("Siri and Shortcuts", `<p class="small muted" style="margin:0 0 10px">Add to Toby by voice or from any app’s Share button. Toby works out what you mean:</p>
      <ul class="small plain-steps" style="margin:0 0 10px"><li>“Call the bank tomorrow at 10am” → a task</li><li>“Pay rent monthly on the 1st” → a repeating task</li><li>“Buy milk, eggs and bread” → your Shopping list</li><li>“Spent 5,000 on lunch” → an expense</li><li>“Note: gate code 4471” → a note</li><li>A shared web link → your Reading list</li></ul>
      ${newKey ? `<div class="keybox"><p class="small" style="margin:0 0 6px"><b>Your key.</b> Copy it now. It won’t be shown again.</p><input class="field" id="keyOut" value="${esc(newKey)}" readonly style="font-family:var(--f-mono);font-size:12px"><button class="btn" data-act="keyCopy" style="margin-top:8px">Copy key</button></div>` : ""}
      <div class="btns"><button class="btn primary" data-act="keyCreate">${keyCount > 0 ? "Create another key" : "Create a key"}</button>${keyCount > 0 ? `<button class="btn danger" data-act="keyRevoke">Turn off all keys</button>` : ""}</div>
      ${keyCount != null && keyCount >= 0 ? `<p class="small muted" style="margin:8px 0 0">${keyCount ? plural(keyCount, "key") + " active." : "No keys yet."}</p>` : ""}
      <details style="margin-top:10px"><summary class="small">Set up the shortcut (about 3 minutes)</summary><ol class="small muted plain-steps">
        <li>Create a key above and copy it.</li>
        <li>Open the <b>Shortcuts</b> app → <b>+</b> → name it <b>Add to Toby</b>.</li>
        <li>Add the action <b>Dictate Text</b>.</li>
        <li>Add <b>Get Contents of URL</b>. URL: <code>${esc(location.origin)}/api/add</code>. Tap the arrow: Method <b>POST</b>; Headers: add <code>Authorization</code> = <code>Bearer</code> + space + your key; Request Body <b>JSON</b>: add a Text field named <code>text</code> set to <b>Dictated Text</b>.</li>
        <li>Add <b>Show Result</b> (or <b>Speak Text</b>) so Toby confirms what it added.</li>
        <li>Say “Hey Siri, Add to Toby”. For the Share Sheet, open the shortcut’s settings, turn on <b>Show in Share Sheet</b>, and use <b>Shortcut Input</b> instead of Dictated Text.</li></ol></details>`);
    return h;
  }
  async function loadKeyCount() {
    try { keyCount = (await X.cloud.keys.count()).length; } catch { keyCount = -1; } // -1: couldn't check
    if (X.route() === "settings" || X.route() === "tools") { const el = document.querySelector("[data-act=keyCreate]"); if (el) X.softRender(); }
  }

  function notifyExtras(p) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return `<div class="item" style="align-items:center"><label class="row" style="flex:1;gap:10px;min-width:0"><input type="checkbox" id="pfBillsOn"${p.billsOn !== false ? " checked" : ""}><span><span class="t" style="display:block">Bill reminders</span><span class="small muted">Before each bill is due, at briefing time</span></span></label></div>
      <div class="item" style="align-items:center"><label class="row" style="flex:1;gap:10px;min-width:0"><input type="checkbox" id="pfDatesOn"${p.datesOn !== false ? " checked" : ""}><span><span class="t" style="display:block">Birthdays and dates</span><span class="small muted">A few days ahead, at briefing time</span></span></label></div>
      <div class="item" style="align-items:center;flex-wrap:wrap"><label class="row" style="flex:1;gap:10px;min-width:0"><input type="checkbox" id="pfReviewOn"${p.reviewOn !== false ? " checked" : ""}><span><span class="t" style="display:block">Weekly review</span><span class="small muted">A nudge to look back and plan</span></span></label><div class="row" style="flex:none"><select class="field" id="pfReviewDay" style="width:auto">${days.map((d, i) => opt(i, d, p.reviewDay ?? 0)).join("")}</select><input class="field" type="time" id="pfReview" value="${esc(p.review || "18:00")}" style="width:auto"></div></div>`;
  }
  const readNotifyExtras = () => ({
    billsOn: !!($("#pfBillsOn") || {}).checked,
    datesOn: !!($("#pfDatesOn") || {}).checked,
    reviewOn: !!($("#pfReviewOn") || {}).checked,
    reviewDay: +(($("#pfReviewDay") || {}).value || 0),
    review: ($("#pfReview") || {}).value || "18:00",
  });

  /* ================= SEARCH ================= */
  function searchSheet() {
    X.openSheet(`<h2>Search</h2><input class="field" id="searchQ" type="search" placeholder="Tasks, notes, people, money…" autocomplete="off" enterkeyhint="search"><div id="searchRes" class="search-res"><p class="small muted" style="margin:0">Type at least two letters.</p></div>`, (s) => setTimeout(() => s.querySelector("#searchQ").focus(), 50));
    if (LISTS === null) loadLists(false);
  }
  function runSearch(q) {
    const el = $("#searchRes"); if (!el) return;
    q = q.trim().toLowerCase();
    if (q.length < 2) { el.innerHTML = '<p class="small muted" style="margin:0">Type at least two letters.</p>'; return; }
    const has = (...xs) => xs.some((x) => String(x || "").toLowerCase().includes(q));
    const groups = [
      ["Tasks", S.tasks.items.filter((t) => has(t.title, t.notes)).map((t) => ["editTask", t.id, t.title, t.done ? "Done" : t.date ? relDay(t.date) : "Anytime"])],
      ["People", S.people.items.filter((p) => has(p.name, p.role, p.notes, p.email, p.phone)).map((p) => ["openPerson", p.id, p.name, p.role || ""])],
      ["Meetings", S.meetings.items.filter((m) => has(m.title, m.notes, m.who, ...(m.actions || []).map((a) => a.text))).map((m) => ["openMeeting", m.id, m.title || "Meeting", m.date ? fmtDate(m.date) : ""])],
      ["Projects", S.projects.items.filter((p) => has(p.name, p.notes)).map((p) => ["openProject", p.id, p.name, p.archived ? "Finished" : "Active"])],
      ["Notes", S.notes.items.filter((n) => has(n.title, n.body)).map((n) => ["openNote", n.id, n.title || "Untitled", (n.body || "").slice(0, 60)])],
      ["Journal", S.journal.entries.filter((e) => has(e.text)).map((e) => ["openEntry", e.id, fmtDate(e.date), (e.text || "").slice(0, 60)])],
      ["Money", S.money.entries.filter((e) => has(e.note, e.cat)).sort((a, b) => b.date.localeCompare(a.date)).map((e) => ["editMoney", e.id, (e.note || e.cat) + " · " + money(e.amt), fmtDate(e.date)])],
      ["Bills", S.bills.items.filter((b) => has(b.name)).map((b) => ["openBill", b.id, b.name, money(b.amt)])],
      ["Savings", S.savings.items.filter((g) => has(g.name)).map((g) => ["openGoal", g.id, g.name, money(goalSaved(g))])],
      ["Lists", (LISTS || []).flatMap((l) => l.items.filter((i) => has(i.text)).map((i) => ["goList", l.id, i.text, l.name + (i.done ? " · done" : "")]))],
    ].filter((g) => g[1].length);
    el.innerHTML = groups.length
      ? groups.map(([name, rows]) => `<div class="group-h">${name}</div><div class="list">${rows.slice(0, 8).map(([act, id, t, m]) => `<div class="item"><button class="body" data-act="${act}" data-id="${esc(id)}"><div class="t">${esc(t)}</div>${m ? `<div class="m"><span>${esc(m)}</span></div>` : ""}</button></div>`).join("")}${rows.length > 8 ? `<p class="small muted" style="margin:4px 0 0">${rows.length - 8} more</p>` : ""}</div>`).join("")
      : '<p class="small muted" style="margin:0">Nothing found.</p>';
  }

  /* ================= INBOX (from Siri) ================= */
  let merging = false;
  async function mergeInbox() {
    if (merging) return; merging = true;
    try {
      const rows = await X.cloud.inbox.take();
      if (!rows.length) return;
      const touched = new Set();
      for (const r of rows) {
        const p = r.payload || {};
        if (r.kind === "task" && p.title && !S.tasks.items.some((t) => t.id === p.id)) { X.addTask({ ...p, id: p.id }); touched.add("tasks"); }
        else if (r.kind === "expense" && p.amt > 0 && !S.money.entries.some((e) => e.id === p.id)) { S.money.entries.push({ id: p.id || newId(), type: p.type === "in" ? "in" : "out", amt: p.amt, cat: p.cat || "Other", note: p.note || "", date: p.date || today(), ts: Date.now() }); touched.add("money"); }
        else if (r.kind === "note" && !S.notes.items.some((n) => n.id === p.id)) { S.notes.items.push({ id: p.id || newId(), title: p.title || "", body: p.body || "", pinned: false, ts: Date.now() }); touched.add("notes"); }
      }
      touched.forEach((k) => save(k));
      await X.cloud.inbox.remove(rows.map((r) => r.id));
      X.toast(rows.length === 1 ? "Added 1 item from Siri" : `Added ${rows.length} items from Siri`);
      X.softRender();
    } catch { /* inbox not set up yet or offline: try again later */ }
    finally { merging = false; }
  }

  /* ================= actions ================= */
  const P = (id) => S.people.items.find((x) => x.id === id);
  const M = (id) => S.meetings.items.find((x) => x.id === id);
  const PJ = (id) => S.projects.items.find((x) => x.id === id);
  const B = (id) => S.bills.items.find((x) => x.id === id);
  const G = (id) => S.savings.items.find((x) => x.id === id);

  const actions = {
    planTab: (b) => { planTab = b.dataset.v; X.render(); },
    moneyTab: (b) => { moneyTab = b.dataset.v; X.render(); },
    calDay: (b) => { calDay = b.dataset.d; X.render(); },
    calPrev: () => { const [y, m] = calMonth.split("-").map(Number); const d = new Date(y, m - 2, 1); calMonth = d.getFullYear() + "-" + pad(d.getMonth() + 1); X.render(); },
    calNext: () => { const [y, m] = calMonth.split("-").map(Number); const d = new Date(y, m, 1); calMonth = d.getFullYear() + "-" + pad(d.getMonth() + 1); X.render(); },
    calRefresh: () => { refreshCal(true); X.toast("Loading your calendar…"); },
    qaDay: () => {
      const el = $("#qaDay"); const raw = el.value.trim(); if (!raw) { el.focus(); return; }
      const p = X.parseQuick(raw); X.addTask({ ...p, date: p.date || calDay }); el.value = ""; X.render(); X.toast("Added for " + relDay(p.date || calDay).toLowerCase());
    },
    projAdd: () => { const el = $("#projIn"), n = el.value.trim(); if (!n) { el.focus(); return; } S.projects.items.push({ id: newId(), name: n, due: "", notes: "", archived: false, created: Date.now() }); save("projects"); X.render(); },
    openProject: (b) => { const p = PJ(b.dataset.id); if (p) projectSheet(p); },
    qaProj: () => {
      const el = $("#qaProj"), raw = el.value.trim(); if (!raw || !curProject) { el && el.focus(); return; }
      X.addTask({ ...X.parseQuick(raw), project: curProject }); el.value = ""; refreshProjectTasks();
    },
    delProject: (b) => X.armDelete(b, () => { S.projects.items = S.projects.items.filter((x) => x.id !== b.dataset.id); S.tasks.items.forEach((t) => { if (t.project === b.dataset.id) t.project = ""; }); save("projects"); save("tasks"); X.closeSheet(); X.toast("Project deleted. Its tasks were kept."); }),
    newMeeting: () => { const m = { id: newId(), title: "", date: today(), time: "", who: "", notes: "", actions: [], project: "" }; S.meetings.items.push(m); meetingSheet(m); },
    openMeeting: (b) => { const m = M(b.dataset.id); if (m) meetingSheet(m); },
    mtAddAction: () => { const m = M(curMeeting), el = $("#mtActIn"); if (!m || !el.value.trim()) { el && el.focus(); return; } m.actions = [...(m.actions || []), { id: newId(), text: el.value.trim() }]; el.value = ""; save("meetings"); $("#mtActions").innerHTML = meetingActions(m); el.focus(); },
    mtMakeTask: (b) => { const m = M(curMeeting); const a = m && (m.actions || []).find((x) => x.id === b.dataset.id); if (!a) return; const t = X.addTask({ title: a.text, project: m.project || "", notes: "From meeting: " + (m.title || "") + (m.date ? " (" + fmtDate(m.date) + ")" : "") }); a.taskId = t.id; save("meetings"); $("#mtActions").innerHTML = meetingActions(m); X.toast("Added to your tasks"); },
    mtDelAction: (b) => { const m = M(curMeeting); if (!m) return; m.actions = (m.actions || []).filter((x) => x.id !== b.dataset.id); save("meetings"); $("#mtActions").innerHTML = meetingActions(m); },
    delMeeting: (b) => X.armDelete(b, () => { S.meetings.items = S.meetings.items.filter((x) => x.id !== b.dataset.id); save("meetings"); curMeeting = null; X.closeSheet(true); X.render(); X.toast("Meeting deleted"); }),
    newPerson: () => { const p = { id: newId(), name: "", role: "", phone: "", email: "", bday: "", followEvery: 0, last: "", notes: "", log: [] }; S.people.items.push(p); personSheet(p); },
    openPerson: (b) => { const p = P(b.dataset.id); if (p) personSheet(p); },
    personLog: () => { const p = P(curPerson); if (!p) return; const el = $("#psLogIn"); p.log = [...(p.log || []), { date: today(), note: el.value.trim() }].slice(-50); p.last = today(); el.value = ""; save("people"); $("#psLog").innerHTML = personLog(p); X.toast("Catch-up logged"); },
    personContacted: (b) => { const p = P(b.dataset.id); if (!p) return; p.last = today(); p.log = [...(p.log || []), { date: today(), note: "" }].slice(-50); save("people"); X.render(); X.toast("Logged. Next reminder in " + plural(p.followEvery || 0, "day") + "."); },
    delPerson: (b) => X.armDelete(b, () => { S.people.items = S.people.items.filter((x) => x.id !== b.dataset.id); save("people"); curPerson = null; X.closeSheet(true); X.render(); X.toast("Removed"); }),
    newOccasion: () => occasionSheet(null),
    openOccasion: (b) => { const o = S.people.dates.find((x) => x.id === b.dataset.id); if (o) occasionSheet(o); },
    saveOccasion: (b) => {
      const title = $("#ocTitle").value.trim(), m = $("#ocM").value, d = $("#ocD").value;
      if (!title) { $("#ocTitle").focus(); return; }
      if (!m || !d) { X.toast("Pick the month and day."); return; }
      const v = { title, md: m + "-" + d, year: +$("#ocYear").value || "", remind: +$("#ocRemind").value };
      if (b.dataset.id) Object.assign(S.people.dates.find((x) => x.id === b.dataset.id), v); else S.people.dates.push({ id: newId(), ...v });
      save("people"); X.closeSheet();
    },
    delOccasion: (b) => X.armDelete(b, () => { S.people.dates = S.people.dates.filter((x) => x.id !== b.dataset.id); save("people"); X.closeSheet(); }),
    newBill: () => billSheet(null),
    openBill: (b) => { const x = B(b.dataset.id); if (x) billSheet(x); },
    saveBill: (b) => {
      const name = $("#blName").value.trim(), amt = num($("#blAmt").value), due = $("#blDue").value;
      if (!name) { $("#blName").focus(); return; }
      if (!(amt > 0)) { $("#blAmt").focus(); X.toast("Enter the amount."); return; }
      if (!due) { X.toast("Pick the next due date."); return; }
      const v = { name, amt, due, repeat: $("#blRep").value, cat: $("#blCat").value, kind: $("#blKind").value, remind: +$("#blRemind").value, active: true, anchor: +due.slice(8) };
      if (b.dataset.id) Object.assign(B(b.dataset.id), v); else S.bills.items.push({ id: newId(), history: [], ...v });
      save("bills"); X.closeSheet(); X.toast(b.dataset.id ? "Saved" : "Bill added");
    },
    billPaid: (b) => { const x = B(b.dataset.id); if (!x) return; payBill(x); X.render(); },
    delBill: (b) => X.armDelete(b, () => { S.bills.items = S.bills.items.filter((x) => x.id !== b.dataset.id); save("bills"); X.closeSheet(); }),
    goalAdd: () => { const el = $("#goalIn"), n = el.value.trim(); if (!n) { el.focus(); return; } const g = { id: newId(), name: n, target: 0, deadline: "", log: [] }; S.savings.items.push(g); save("savings"); el.value = ""; X.render(); goalSheet(g); },
    openGoal: (b) => { const g = G(b.dataset.id); if (g) goalSheet(g); },
    glAdd: (b) => goalMove(b.dataset.id, 1),
    glTake: (b) => goalMove(b.dataset.id, -1),
    saveGoal: (b) => { const g = G(b.dataset.id); if (!g) return; g.name = $("#glName").value.trim() || g.name; g.target = num($("#glTarget").value) > 0 ? num($("#glTarget").value) : 0; g.deadline = $("#glDeadline").value; save("savings"); X.closeSheet(); },
    delGoal: (b) => X.armDelete(b, () => { S.savings.items = S.savings.items.filter((x) => x.id !== b.dataset.id); save("savings"); X.closeSheet(); }),
    water: (b) => { const v = Math.max(0, (hlog(today()).water || 0) + +b.dataset.v); setHealth("water", v || ""); save("health"); X.render(); },
    listSel: (b) => { listSel = b.dataset.id; X.render(); },
    listRetry: () => { LISTS = null; listsErr = ""; X.render(); },
    listNew: () => X.openSheet(`<h2>New list</h2><input class="field" id="listNewName" placeholder="e.g. Groceries, Gift ideas, Books" autocomplete="off"><button class="btn primary" data-act="listCreate">Create list</button>`, (s) => s.querySelector("#listNewName").focus()),
    listCreate: () => { const n = $("#listNewName").value.trim(); if (!n) return; X.closeSheet(true); listOp(async () => { const l = await X.cloud.lists.create(n, (LISTS || []).length); listSel = l.id; }, "List created"); },
    listAdd: () => { const el = $("#listIn"), l = curList(); const items = el.value.split(/,|\n/).map((s) => s.trim()).filter(Boolean); if (!items.length || !l) { el.focus(); return; } el.value = ""; l.items.push(...items.map((t) => ({ id: "tmp" + newId(), text: t, done: false }))); X.render(); setTimeout(() => { const i = $("#listIn"); if (i) i.focus(); }, 0); listOp(() => X.cloud.lists.addItems(l.id, items)); },
    listToggle: (b) => { const l = curList(); const it = l && l.items.find((i) => i.id === b.dataset.id); if (!it || it.id.startsWith("tmp")) return; it.done = !it.done; X.render(); listOp(() => X.cloud.lists.setDone(it.id, it.done)); },
    listDelItem: (b) => { const l = curList(); if (!l) return; l.items = l.items.filter((i) => i.id !== b.dataset.id); X.render(); listOp(() => X.cloud.lists.removeItem(b.dataset.id)); },
    listClear: () => { const l = curList(); if (!l) return; l.items = l.items.filter((i) => !i.done); X.render(); listOp(() => X.cloud.lists.clearDone(l.id)); },
    listMenu: () => listMenu(),
    listRename: () => { const l = curList(), n = $("#listName").value.trim(); if (!l || !n) return; X.closeSheet(true); listOp(() => X.cloud.lists.rename(l.id, n), "Renamed"); },
    listShare: () => { const l = curList(); if (!l) return; listOp(async () => { l.share_token = await X.cloud.lists.share(l.id); }).then(() => listMenu()); },
    listUnshare: () => { const l = curList(); if (!l) return; X.closeSheet(true); listOp(() => X.cloud.lists.unshare(l.id), "The old link no longer works"); },
    listCopy: () => copyField("#listLink", "Link copied"),
    listDelete: (b) => X.armDelete(b, () => { const l = curList(); if (!l) return; X.closeSheet(true); listOp(() => X.cloud.lists.remove(l.id), "List deleted"); }),
    goList: (b) => { listSel = b.dataset.id; X.closeSheet(true); location.hash = "lists"; },
    keyCreate: async (b) => { b.disabled = true; try { newKey = await X.cloud.keys.create(); keyCount = Math.max(0, keyCount || 0) + 1; X.render(); } catch (e) { X.toast(e.message); b.disabled = false; } },
    keyCopy: () => copyField("#keyOut", "Key copied"),
    keyRevoke: (b) => X.armDeleteLabel(b, "Tap again to turn off", async () => { try { await X.cloud.keys.revokeAll(); keyCount = 0; newKey = ""; X.render(); X.toast("All keys turned off. Shortcuts using them stop working."); } catch (e) { X.toast(e.message); } }),
    search: () => searchSheet(),
  };
  function goalMove(id, sign) {
    const g = G(id), amt = num($("#glAmt").value);
    if (!g || !(amt > 0)) { $("#glAmt").focus(); return; }
    g.log = [...(g.log || []), { id: newId(), date: today(), amt: sign * amt }];
    save("savings"); X.closeSheet(true); X.render(); goalSheet(g);
    X.toast(sign > 0 ? `Added ${money(amt)} to ${g.name}` : `Took ${money(amt)} out of ${g.name}`);
  }
  function copyField(sel, msg) {
    const el = $(sel); if (!el) return;
    const fallback = () => { el.select(); X.toast("Selected. Use Copy from the menu."); };
    if (navigator.clipboard) navigator.clipboard.writeText(el.value).then(() => X.toast(msg), fallback); else fallback();
  }

  /* ================= input routing ================= */
  let rvT;
  function onInput(e) {
    const id = e.target.id, v = e.target.value;
    const p = P(curPerson), m = M(curMeeting), pj = PJ(curProject);
    const map = {
      psName: () => { p.name = v; later("people"); }, psRole: () => { p.role = v; later("people"); }, psPhone: () => { p.phone = v; later("people"); },
      psEmail: () => { p.email = v; later("people"); }, psNotes: () => { p.notes = v; later("people"); },
      mtTitle: () => { m.title = v; later("meetings"); }, mtWho: () => { m.who = v; later("meetings"); }, mtNotes: () => { m.notes = v; later("meetings"); },
      pjName: () => { pj.name = v; later("projects"); }, pjNotes: () => { pj.notes = v; later("projects"); },
      peopleSearch: () => { peopleQuery = v; const el = $("#peopleList"); if (el) el.innerHTML = peopleList(v.toLowerCase()); },
      searchQ: () => runSearch(v),
      hSleep: () => { setHealth("sleep", v === "" ? "" : num(v)); later("health", 700); },
      hWeight: () => { setHealth("weight", v === "" ? "" : num(v)); later("health", 700); },
    };
    if (map[id] && (!/^ps/.test(id) || p) && (!/^mt/.test(id) || m) && (!/^pj/.test(id) || pj)) { map[id](); return true; }
    if (/^rv(Wins|Lessons|P\d)$/.test(id)) {
      const r = reviewEntry(true);
      if (id === "rvWins") r.wins = v; else if (id === "rvLessons") r.lessons = v; else { r.priorities = r.priorities || ["", "", ""]; r.priorities[+id.slice(3)] = v; }
      r.ts = Date.now(); clearTimeout(rvT); rvT = setTimeout(() => { save("journal"); const s = $("#rvSaved"); if (s) s.textContent = "Saved. Your priorities show on Today all week."; }, 500);
      return true;
    }
    return false;
  }
  function onChange(e) {
    if (IM.onChange(e)) return true;
    const id = e.target.id, v = e.target.value;
    const p = P(curPerson), m = M(curMeeting), pj = PJ(curProject);
    if ((id === "psBM" || id === "psBD") && p) { const bm = $("#psBM").value, bd = $("#psBD").value; p.bday = bm && bd ? bm + "-" + bd : ""; save("people"); return true; }
    if (id === "psFollow" && p) { p.followEvery = +v; if (+v && !p.last) p.last = today(); save("people"); return true; }
    if ((id === "mtDate" || id === "mtTime" || id === "mtProj") && m) { m[{ mtDate: "date", mtTime: "time", mtProj: "project" }[id]] = v; save("meetings"); return true; }
    if (id === "pjDue" && pj) { pj.due = v; save("projects"); return true; }
    if (id === "pjArch" && pj) { pj.archived = v === "1"; save("projects"); return true; }
    if (id === "setCals") { S.settings.calendars = v.trim(); save("settings"); CAL.at = 0; setTimeout(() => refreshCal(true), 1200); X.toast("Saved. Loading your calendar…"); return true; }
    return false;
  }
  function onEnter(e) {
    if (IM.onEnter(e)) return true;
    const id = e.target.id;
    const map = { qaDay: "qaDay", projIn: "projAdd", qaProj: "qaProj", mtActIn: "mtAddAction", goalIn: "goalAdd", listIn: "listAdd", listNewName: "listCreate", psLogIn: "personLog" };
    if (map[id]) { e.preventDefault(); actions[map[id]]({ dataset: {}, disabled: false }); return true; }
    return false;
  }

  /* ================= lifecycle ================= */
  function after(v) {
    if ((v === "today" || v === "plan") && calLinked() && Date.now() - CAL.at > 15 * 60e3) refreshCal(false);
    if ((v === "settings" || v === "tools") && keyCount === null) loadKeyCount();
  }
  function start() {
    mergeInbox();
    try { X.cloud.inbox.watch(() => mergeInbox()); } catch {}
    if (calLinked()) refreshCal(false);
  }
  function onVisible() { mergeInbox(); if (calLinked()) refreshCal(false); }
  function stop() { Object.values(timers).forEach(clearTimeout); }
  function onTaskChanged() { refreshProjectTasks(); }

  return {
    views: { people: peopleView, more: moreView, lists: listsView, review: reviewView, import: IM.view },
    planSeg, planTab: () => planTab, setPlanTab: (t) => (planTab = t),
    planBody: () => (planTab === "calendar" ? calendarTab() : planTab === "projects" ? projectsTab() : meetingsTab()),
    moneySeg, moneyTab: () => moneyTab, setMoneyTab: (t) => (moneyTab = t),
    moneyBody: () => (moneyTab === "bills" ? billsTab() : savingsTab()),
    todayTop, todaySchedule, todayCards, healthCard, settingsCards, notifyExtras, readNotifyExtras,
    projectName, actions: { ...actions, ...IM.actions }, onInput, onChange, onEnter, after, start, stop, onVisible, onTaskChanged,
    projectOptions: (cur) => opt("", "None", cur || "") + S.projects.items.filter((p) => !p.archived || p.id === cur).map((p) => opt(p.id, p.name, cur || "")).join(""),
    repeatOptions: (cur) => REPEATS.map(([v, l]) => opt(v, l, cur || "")).join(""),
  };
}
