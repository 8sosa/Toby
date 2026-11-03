// Toby's newer sections: people & dates, meetings, projects, calendar, bills, savings,
// health, lists, weekly review, search, calendar links and Siri.
// The engine (engine.js) hands over its helpers as `X` and calls into what this returns.
import { nextDate, REPEATS, repeatLabel } from "./quick.js";
import { createImporter } from "./importer.js";
import { createTools } from "./tools.js";
import { createToday } from "./today.js";
import { createPlanner } from "./planner.js";

export function createFeatures(X) {
  const { S, save, esc, clone, pad, ymd, today, parseYmd, addDays, newId, DOW, MON, MONL, fmtDate, relDay, fmtTime, money, ICON, OUT_CATS } = X;
  const $ = (s) => document.querySelector(s);
  const timers = {};
  const IM = createImporter({ ...X, quick: { nextDate } });
  const TL = createTools(X);
  const TD = createToday(X, { todayTop: (...a) => todayTop(...a), todayCards: (...a) => todayCards(...a), eventsOn: (d) => eventsOn(d), evTime: (e) => evTime(e), meetingsOn: (d) => meetingsOn(d), safeToSpend: () => safeToSpend(), activeBills: () => activeBills(), allDates: () => allDates(), checkLimits: () => checkLimits() });
  const PL = createPlanner(X, { scheduleItems: (d) => TD.scheduleItems(d), eventsOn: (d) => eventsOn(d) });
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
    let h = TL.todayBits();
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
  const planSeg = () => seg([["tasks", "Tasks"], ["week", "Week"], ["calendar", "Calendar"], ["projects", "Projects"], ["meetings", "Meetings"]], planTab, "planTab");

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
  const moneySeg = () => seg([["overview", "Overview"], ["limits", "Limits"], ["bills", "Bills"], ["savings", "Savings"], ["debts", "Debts"], ["insights", "Insights"]], moneyTab, "moneyTab");
  const PER_MONTH = { day: 30.4, weekday: 21.7, week: 4.35, "2week": 2.17, month: 1, quarter: 1 / 3, year: 1 / 12 };

  function billsTab() {
    const bs = activeBills().sort((a, b) => a.due.localeCompare(b.due));
    const monthly = bs.filter((b) => b.repeat).reduce((s, b) => s + b.amt * (PER_MONTH[b.repeat] || 0), 0);
    const next30 = bs.filter((b) => daysUntil(b.due) <= 30).reduce((s, b) => s + b.amt, 0);
    const subs = bs.filter((b) => b.kind === "sub");
    let h = `<section class="card"><div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><b style="font-size:20px">${money(Math.round(monthly))}</b><span>a month on repeating bills</span></div><div class="stat"><b style="font-size:20px">${money(next30)}</b><span>due in the next 30 days</span></div></div>${subs.length ? `<p class="small muted" style="margin:10px 0 0">${plural(subs.length, "subscription")} costing ${money(Math.round(subs.reduce((s, b) => s + b.amt * (PER_MONTH[b.repeat] || 0), 0)))} a month.</p>` : ""}</section>`;
    h += `<button class="btn primary" data-act="newBill" style="width:100%">Add a bill or subscription</button>`;
    h += recurringCard();
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


  /* ================= MONEY: health score, daily chart, debts ================= */
  const compact = (n) => {
    const sym = S.settings.currency || "", a = Math.abs(n);
    if (a >= 1e6) return sym + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "m";
    if (a >= 1e3) return sym + Math.round(n / 1e3) + "k";
    return sym + Math.round(n);
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const debtBalance = (d) => Math.max(0, (d.amount || 0) + (d.log || []).filter((l) => l.kind === "add").reduce((s, l) => s + l.amt, 0) - (d.log || []).filter((l) => l.kind !== "add").reduce((s, l) => s + l.amt, 0));
  const openDebts = (dir) => S.debts.items.filter((d) => d.dir === dir && debtBalance(d) > 0.009);

  function monthFigures(m) {
    let income = 0, spent = 0, refunds = 0;
    for (const e of S.money.entries) {
      if (e.date.slice(0, 7) !== m) continue;
      if (e.type === "in") { if (e.cat === "Refund") refunds += e.amt; else if (X.isIncome(e)) income += e.amt; }
      else if (X.isSpend(e)) spent += e.amt;
    }
    return { income, spent: Math.max(0, spent - refunds) };
  }

  /** A 0-100 score from four parts: saving rate, staying on budget, debt load and savings buffer. */
  function healthScore(m) {
    const t = today(), { spent } = monthFigures(m);
    const inc = monthIncome(m), income = inc.total;
    const budget = S.money.budget || 0;
    const [y, mo] = m.split("-").map(Number), dim = new Date(y, mo, 0).getDate();
    const pace = m === t.slice(0, 7) ? +t.slice(8) / dim : m < t.slice(0, 7) ? 1 : 0;
    const owe = openDebts("owe").reduce((s, d) => s + debtBalance(d), 0);
    const saved = S.savings.items.reduce((s, g) => s + goalSaved(g), 0);
    const prev = [1, 2, 3].map((k) => { const d = new Date(y, mo - 1 - k, 1); return monthFigures(d.getFullYear() + "-" + pad(d.getMonth() + 1)).spent; }).filter((v) => v > 0);
    const avgSpend = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : spent || 1;
    const rate = income > 0 ? (income - spent) / income : null;
    const parts = [
      { key: "save", label: "Saving", max: 35, pts: rate == null ? 0 : 35 * clamp01(rate / 0.2), text: rate == null ? "No income logged this month" : rate >= 0 ? `Keeping ${Math.round(rate * 100)}% of income` : `Spending ${Math.round(-rate * 100)}% more than income`, tip: rate == null ? "Log or import this month's income to see how much you keep." : "Aim to keep at least 20% of what comes in." },
      { key: "budget", label: "Budget", max: 25, pts: !budget ? 12.5 : pace === 0 ? 25 : 25 * clamp01(1 - (spent / (budget * pace) - 1) / 0.5), text: !budget ? "No budget set" : `${Math.round((spent / budget) * 100)}% of budget used${pace < 1 ? `, ${Math.round(pace * 100)}% of the month gone` : ""}`, tip: !budget ? "Set a monthly budget to track your pace." : "Spending is ahead of your budget pace. Look at the spike days below." },
      { key: "debt", label: "Debt", max: 25, pts: !owe ? 25 : income > 0 ? 25 * clamp01(1 - (owe / income - 0.5) / 2.5) : 0, text: owe ? `${money(Math.round(owe))} owed${income > 0 ? `, ${(owe / income).toFixed(1)}× this month’s income` : ""}` : "No debts", tip: "Paying down what you owe lifts this the fastest." },
      { key: "buffer", label: "Buffer", max: 15, pts: 15 * clamp01(saved / (avgSpend * 3)), text: `${(saved / avgSpend).toFixed(1)} months of spending saved`, tip: "Build savings towards 3 months of spending." },
    ];
    const score = Math.round(parts.reduce((s, p) => s + p.pts, 0));
    const weakest = parts.slice().sort((a, b) => a.pts / a.max - b.pts / b.max)[0];
    const status = score >= 80 ? ["Healthy", "good"] : score >= 60 ? ["Okay", "acc"] : score >= 40 ? ["Needs attention", "hi"] : ["Under strain", "bad"];
    return { score, parts, weakest, status, income, spent, budget, owe, expected: inc.expected };
  }

  function financeHealthCard(m) {
    const h = healthScore(m);
    const s = salary();
    const salaryLine = `<div class="kv" style="margin-top:4px"><span class="muted">${s && s.amount ? `Salary ${money(s.amount)} on the ${ord(+s.payday)}${h.expected ? " · counted as expected this month" : ""}` : "Add your monthly salary for a more accurate score"}</span><button class="link" data-act="openSalary">${s && s.amount ? "Edit" : "Add salary"}</button></div>`;
    if (!h.income && !h.spent && !h.owe) return section("Financial health", `<p class="small muted" style="margin:0">Log some spending, import a statement or add your salary to see your score.</p>${salaryLine}`);
    const rows = [["Income", h.income], ["Budget", h.budget], ["Spent", h.spent], ["Debt owed", h.owe]];
    const max = Math.max(...rows.map((r) => r[1]), 1);
    const R = 34, C = 2 * Math.PI * R, frac = h.score / 100;
    const ring = `<svg viewBox="0 0 84 84" class="score-ring" role="img" aria-label="Financial health score ${h.score} out of 100"><circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="8"/><circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--${h.status[1] === "good" ? "good" : h.status[1] === "bad" ? "bad" : h.status[1] === "hi" ? "mark" : "accent"})" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" class="score-num">${h.score}</text></svg>`;
    return `<section class="card"><div class="sec-h"><h2>Financial health</h2><span class="chip ${h.status[1]}">${h.status[0]}</span></div>
      <div class="health-top">${ring}<div><p style="margin:0;font-size:15px"><b>${h.score} out of 100</b></p><p class="small muted" style="margin:2px 0 0">${esc(h.weakest.tip)}</p></div></div>
      <div class="health-parts">${h.parts.map((p) => `<div class="hp"><div class="hp-h"><span>${p.label}</span><span class="num">${Math.round(p.pts)}/${p.max}</span></div><div class="meter" style="height:5px"><i style="width:${(p.pts / p.max) * 100}%"></i></div><span class="small muted">${esc(p.text)}</span></div>`).join("")}</div>
      <div class="fin-bars">${rows.map(([l, v]) => `<div class="cat-row"><span>${l}</span><div class="cat-bar"><i style="width:${(v / max) * 100}%;${l === "Spent" && h.income && v > h.income ? "background:var(--bad)" : l === "Income" ? "background:var(--good)" : l === "Debt owed" ? "background:var(--mark)" : ""}"></i></div><span class="amt">${v ? money(Math.round(v)) : "—"}</span></div>`).join("")}</div>
      ${salaryLine}
      <p class="small muted" style="margin:6px 0 0">The score updates as you log or import transactions, debts and savings.</p></section>`;
  }

  let chartMode = "daily", chartDay = null, chartMonth = null;
  function spendSeries(m) {
    const [y, mo] = m.split("-").map(Number), dim = new Date(y, mo, 0).getDate();
    const vals = Array(dim).fill(0), byDay = Array.from({ length: dim }, () => []);
    for (const e of S.money.entries) if (X.isSpend(e) && e.date.slice(0, 7) === m) { vals[+e.date.slice(8) - 1] += e.amt; byDay[+e.date.slice(8) - 1].push(e); }
    const t = today(), last = m === t.slice(0, 7) ? +t.slice(8) : m < t.slice(0, 7) ? dim : 0;
    return { dim, vals, byDay, last };
  }
  function niceStep(max) { const raw = max / 3, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / mag; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag; }

  function spendChart(m) {
    if (chartMonth !== m) { chartMonth = m; chartDay = null; }
    const { dim, vals, byDay, last } = spendSeries(m);
    const total = vals.reduce((a, b) => a + b, 0);
    const toggle = `<div class="seg seg-sub mini" role="tablist">${[["daily", "Each day"], ["total", "Running total"]].map(([v, l]) => `<button role="tab" class="${chartMode === v ? "on" : ""}" data-act="chartMode" data-v="${v}">${l}</button>`).join("")}</div>`;
    if (!total) return section("Spending by day", empty("No spending this month.", "Log expenses or import a statement to see your daily pattern."));
    const n = Math.max(1, last);
    const daily = vals.slice(0, n);
    const running = []; daily.reduce((s, v, i) => (running[i] = s + v), 0);
    const series = chartMode === "daily" ? daily : running;
    const budget = S.money.budget || 0;
    const W = 340, Hh = 170, L = 44, Rr = 10, T = 16, B = 24;
    const top = Math.max(...series, chartMode === "total" ? budget : 0, 1);
    const step = niceStep(top), yMax = Math.ceil(top / step) * step;
    const x = (i) => L + (dim > 1 ? (i / (dim - 1)) * (W - L - Rr) : 0);
    const y = (v) => T + (1 - v / yMax) * (Hh - T - B);
    const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const grid = [];
    for (let v = 0; v <= yMax + 0.1; v += step) grid.push(`<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end" class="axis">${compact(v)}</text>`);
    const ticks = [1, 8, 15, 22, dim].map((d) => `<text x="${x(d - 1)}" y="${Hh - 6}" text-anchor="middle" class="axis">${d}</text>`).join("");
    // Spikes: days well above the month's typical day.
    const mean = daily.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const spikes = daily.map((v, i) => ({ v, i })).filter((p) => p.v > mean + 1.5 * sd && p.v > mean * 1.8).sort((a, b) => b.v - a.v).slice(0, 3);
    let marks = "";
    if (chartMode === "daily") {
      // Mark every spike; label only the biggest so labels never collide.
      marks = spikes.map((p, k) => `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="4.5" class="spike"/>${k === 0 ? `<text x="${x(p.i) + 8}" y="${y(p.v) + 4}" text-anchor="start" class="spike-label">${compact(p.v)} on ${p.i + 1}${["st", "nd", "rd"][((p.i + 1) % 10) - 1] && ![11, 12, 13].includes(p.i + 1) ? ["st", "nd", "rd"][((p.i + 1) % 10) - 1] : "th"}</text>` : ""}`).join("");
    } else if (budget) {
      marks = `<line x1="${L}" x2="${W - Rr}" y1="${y(budget)}" y2="${y(budget)}" class="ref"/><text x="${W - Rr}" y="${y(budget) - 5}" text-anchor="end" class="axis">Budget ${compact(budget)}</text><line x1="${x(0)}" y1="${y(0)}" x2="${x(dim - 1)}" y2="${y(budget)}" class="pace"/>`;
    }
    const area = `${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`;
    const svg = `<svg viewBox="0 0 ${W} ${Hh}" class="line-chart" id="spendSvg" data-ymax="${yMax}" data-top="${T}" data-bottom="${Hh - B}" role="img" aria-label="${chartMode === "daily" ? "Spending each day" : "Running total of spending"} in ${MONL[+m.slice(5) - 1]}">
      ${grid.join("")}${ticks}<polygon points="${area}" class="area"/><polyline points="${pts}" class="line"/>${marks}
      ${chartDay != null ? `<line x1="${x(chartDay)}" x2="${x(chartDay)}" y1="${T}" y2="${Hh - B}" class="xh"/><circle cx="${x(chartDay)}" cy="${y(series[chartDay] || 0)}" r="4" class="dot"/>` : ""}
      <line id="xhLine" class="xh" x1="0" x2="0" y1="${T}" y2="${Hh - B}" visibility="hidden"/><circle id="xhDot" class="dot" r="4" cx="0" cy="0" visibility="hidden"/>
      <rect x="${L}" y="${T}" width="${W - L - Rr}" height="${Hh - T - B}" fill="transparent" id="spendHit" data-dim="${dim}" data-n="${n}"/></svg>`;
    let summary = "";
    if (spikes.length) {
      const p = spikes[0], es = byDay[p.i].slice().sort((a, b) => b.amt - a.amt);
      summary = `<p class="small" style="margin:8px 0 0"><b>Biggest day:</b> ${esc(fmtDate(m + "-" + pad(p.i + 1)))}, ${money(Math.round(p.v))}${es[0] ? ` (${esc(es[0].note || es[0].cat)} ${compact(es[0].amt)})` : ""}. A typical day is ${money(Math.round(mean))}.</p>`;
    } else summary = `<p class="small muted" style="margin:8px 0 0">No unusual spikes. A typical day is ${money(Math.round(mean))}.</p>`;
    let dayList = "";
    if (chartDay != null && byDay[chartDay]) {
      const es = byDay[chartDay].slice().sort((a, b) => b.amt - a.amt);
      dayList = `<div class="day-detail"><div class="sec-h" style="margin:12px 0 4px"><h3>${esc(fmtDate(m + "-" + pad(chartDay + 1)))} · ${money(Math.round(vals[chartDay]))}</h3><button class="link" data-act="chartClear">Close</button></div>${es.length ? `<div class="list">${es.slice(0, 8).map((e) => `<div class="item"><button class="body" data-act="editMoney" data-id="${e.id}" style="display:flex;justify-content:space-between;gap:10px"><span class="t">${esc(e.note || e.cat)}<span class="m"><span>${esc(e.cat)}</span></span></span><span class="amt">${money(e.amt)}</span></button></div>`).join("")}</div>${es.length > 8 ? `<p class="small muted" style="margin:4px 0 0">and ${es.length - 8} more</p>` : ""}` : '<p class="small muted" style="margin:0">No spending that day.</p>'}</div>`;
    }
    return `<section class="card"><div class="sec-h"><h2>Spending by day</h2></div>${toggle}<div class="chart-wrap" id="spendWrap">${svg}<div class="chart-tip" id="spendTip" hidden></div></div>${summary}${dayList}<p class="small muted" style="margin:6px 0 0">Tap the chart to see a day’s spending.</p></section>`;
  }
  function wireChart(m) {
    const hit = $("#spendHit"), svg = $("#spendSvg"), tip = $("#spendTip"), wrap = $("#spendWrap");
    if (!hit || !svg) return;
    const { dim, vals, last } = spendSeries(m);
    const n = Math.max(1, last);
    const running = []; vals.slice(0, n).reduce((s, v, i) => (running[i] = s + v), 0);
    const series = chartMode === "daily" ? vals.slice(0, n) : running;
    const box = svg.viewBox.baseVal, L = 44, Rr = 10;
    const dayAt = (ev) => {
      const r = svg.getBoundingClientRect();
      const vx = ((ev.clientX - r.left) / r.width) * box.width;
      return Math.max(0, Math.min(n - 1, Math.round(((vx - L) / (box.width - L - Rr)) * (dim - 1))));
    };
    const show = (ev) => {
      const i = dayAt(ev), xh = $("#xhLine"), dot = $("#xhDot");
      const gTop = +svg.dataset.top, g0 = +svg.dataset.bottom;
      const cx = L + (i / (dim - 1)) * (box.width - L - Rr);
      const yMax = parseFloat(svg.dataset.ymax || "0");
      xh.setAttribute("x1", cx); xh.setAttribute("x2", cx); xh.setAttribute("visibility", "visible");
      dot.setAttribute("cx", cx); dot.setAttribute("cy", g0 - (series[i] / yMax) * (g0 - gTop)); dot.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(fmtDate(m + "-" + pad(i + 1)))}</b><span>${chartMode === "daily" ? "Spent" : "So far"} ${money(Math.round(series[i]))}</span>`;
      const r = wrap.getBoundingClientRect(), px = (cx / box.width) * r.width;
      tip.style.left = Math.max(4, Math.min(r.width - tip.offsetWidth - 4, px - tip.offsetWidth / 2)) + "px";
    };
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", () => { tip.hidden = true; $("#xhLine").setAttribute("visibility", "hidden"); $("#xhDot").setAttribute("visibility", "hidden"); });
    hit.addEventListener("click", (ev) => { chartDay = dayAt(ev); X.render(); });
  }

  function debtsTab() {
    const owe = openDebts("owe"), owed = openDebts("owed");
    const sumOf = (a) => a.reduce((s, d) => s + debtBalance(d), 0);
    let h = `<section class="card"><div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><b style="font-size:20px">${money(Math.round(sumOf(owe)))}</b><span>you owe</span></div><div class="stat"><b style="font-size:20px">${money(Math.round(sumOf(owed)))}</b><span>owed to you</span></div></div></section>`;
    h += `<button class="btn primary" data-act="newDebt" style="width:100%">Log a loan or debt</button>`;
    const row = (d) => {
      const bal = debtBalance(d), total = (d.amount || 0) + (d.log || []).filter((l) => l.kind === "add").reduce((s, l) => s + l.amt, 0);
      const paid = Math.max(0, total - bal), pct = total ? (paid / total) * 100 : 0;
      const n = d.due ? daysUntil(d.due) : null;
      return `<div class="item"><button class="body" data-act="openDebt" data-id="${d.id}"><div class="row" style="justify-content:space-between"><span class="t" style="font-weight:500">${esc(d.name)}</span><span class="amt">${money(Math.round(bal))}</span></div>
        <div class="meter" style="height:6px;margin:8px 0 6px"><i style="width:${pct}%;background:var(--good)"></i></div>
        <div class="m"><span>${money(Math.round(paid))} of ${money(Math.round(total))} ${d.dir === "owe" ? "repaid" : "received back"}</span>${n != null ? `<span class="chip ${n < 0 ? "bad" : n <= 7 ? "hi" : ""}">${n < 0 ? "Overdue" : "Due " + whenText(d.due).toLowerCase()}</span>` : ""}</div></button></div>`;
    };
    h += section("You owe", `<div class="list">${owe.length ? owe.map(row).join("") : empty("Nothing owed.", "Log loans from apps like EaseMoni or FairMoney, money borrowed from friends, or credit you're paying off.")}</div>`);
    h += section("Owed to you", `<div class="list">${owed.length ? owed.map(row).join("") : empty("No one owes you.", "Log money you've lent so you remember to collect it.")}</div>`);
    const settled = S.debts.items.filter((d) => debtBalance(d) <= 0.009);
    if (settled.length) h += section("Settled", `<div class="list">${settled.map((d) => `<div class="item"><button class="body" data-act="openDebt" data-id="${d.id}"><div class="t">${esc(d.name)}</div><div class="m"><span class="chip good">Paid off</span><span>${money(d.amount)}</span></div></button></div>`).join("")}</div>`);
    return h;
  }

  function debtSheet(d) {
    const isNew = !d;
    d = d || { name: "", dir: "owe", amount: "", date: today(), due: "", note: "", log: [] };
    const bal = isNew ? 0 : debtBalance(d);
    X.openSheet(`<h2>${isNew ? "Log a loan or debt" : esc(d.name)}</h2>
      ${isNew ? "" : `<div class="big" style="font-size:30px">${money(Math.round(bal))}<span class="muted" style="font-size:15px"> ${d.dir === "owe" ? "left to repay" : "still owed to you"}</span></div>
      <div class="row"><input class="field num" id="dbAmt" inputmode="decimal" placeholder="Amount" autocomplete="off"><button class="btn primary" data-act="dbPay" data-id="${d.id}">${d.dir === "owe" ? "Repaid" : "Received"}</button><button class="btn" data-act="dbAdd" data-id="${d.id}">${d.dir === "owe" ? "Borrowed more" : "Lent more"}</button></div>`}
      <div class="seg">${[["owe", "I owe"], ["owed", "Owed to me"]].map(([v, l]) => `<button class="${d.dir === v ? "on" : ""}" data-act="dbDir" data-v="${v}">${l}</button>`).join("")}</div>
      <input class="field" id="dbName" placeholder="${d.dir === "owe" ? "Lender, e.g. EaseMoni or Tunde" : "Who owes you?"}" value="${esc(d.name)}" autocomplete="off">
      <div class="grid2"><label class="lbl">Amount<input class="field num" id="dbTotal" inputmode="decimal" value="${esc(d.amount)}" placeholder="0"></label><label class="lbl">Date<input class="field" type="date" id="dbDate" value="${esc(d.date)}"></label></div>
      <div class="grid2"><label class="lbl">Due by (optional)<input class="field" type="date" id="dbDue" value="${esc(d.due || "")}"></label><label class="lbl">Note<input class="field" id="dbNote" value="${esc(d.note || "")}" placeholder="Interest, terms…"></label></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="saveDebt" data-id="${d.id || ""}">${isNew ? "Save" : "Save changes"}</button>${isNew ? "" : `<button class="btn danger" data-act="delDebt" data-id="${d.id}">Delete</button>`}</div>
      ${(d.log || []).length ? `<div><h3 style="margin-bottom:6px">History</h3>${d.log.slice(-10).reverse().map((l) => `<div class="kv"><span class="muted">${esc(fmtDate(l.date))} · ${l.kind === "add" ? (d.dir === "owe" ? "Borrowed" : "Lent") : d.dir === "owe" ? "Repaid" : "Received"}</span><span class="num">${money(l.amt)}</span></div>`).join("")}</div>` : ""}`,
      (s) => { if (isNew) s.querySelector("#dbName").focus(); });
    debtDraftDir = d.dir;
  }
  let debtDraftDir = "owe";


  /* ================= MONEY: salary and the summary for Claude ================= */
  const salary = () => S.money.salary || null;
  const ord = (n) => n + ([11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  const monthStr = (y, m0) => { const d = new Date(y, m0, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  const monthName = (m) => MON[+m.slice(5) - 1] + " " + m.slice(0, 4);

  /** On payday, add the salary to Money once (if turned on). */
  function autoSalary() {
    const s = salary(); if (!s || !(s.amount > 0) || !s.auto) return;
    const t = today(), m = t.slice(0, 7), [y, mo] = m.split("-").map(Number);
    const day = Math.min(s.payday || 25, new Date(y, mo, 0).getDate());
    if (+t.slice(8) < day || s.lastAuto === m) return;
    const has = S.money.entries.some((e) => e.type === "in" && e.date.slice(0, 7) === m && (e.cat === "Salary" || e.autoSalary));
    s.lastAuto = m;
    if (!has) {
      S.money.entries.push({ id: newId(), type: "in", amt: s.amount, cat: "Salary", note: s.source ? "Salary · " + s.source : "Salary", date: m + "-" + pad(day), ts: Date.now(), autoSalary: true });
      X.toast("Payday: added your salary to Money");
    }
    save("money");
  }

  function salarySheet() {
    const s = salary() || { amount: "", payday: 25, auto: true, source: "" };
    X.openSheet(`<h2>Monthly salary</h2>
      <p class="small muted" style="margin:0">Toby counts this as your income for each month where no salary has been logged yet, so your health score is right even before you import a statement.</p>
      <div class="grid2"><label class="lbl">Take-home amount<input class="field num" id="slAmt" inputmode="decimal" value="${esc(s.amount)}" placeholder="0"></label><label class="lbl">Payday<select class="field" id="slDay">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${+s.payday === i + 1 ? " selected" : ""}>${i + 1}${[1, 21, 31].includes(i + 1) ? "st" : [2, 22].includes(i + 1) ? "nd" : [3, 23].includes(i + 1) ? "rd" : "th"} of the month</option>`).join("")}</select></label></div>
      <input class="field" id="slSrc" placeholder="Employer (optional)" value="${esc(s.source || "")}">
      <label class="row small" style="gap:8px"><input type="checkbox" id="slAuto"${s.auto !== false ? " checked" : ""}> Add it to Money automatically on payday</label>
      <label class="row small" style="gap:8px"><input type="checkbox" id="slPast"${!s.since ? " checked" : ""}> Also count it for past months where no salary was logged (useful when it’s paid into an account you haven’t imported)</label>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="saveSalary">Save</button>${salary() ? '<button class="btn danger" data-act="delSalary">Remove</button>' : ""}</div>`, (el) => { if (!s.amount) el.querySelector("#slAmt").focus(); });
  }

  /** Logged income for the month, plus the expected salary when none was logged. */
  function monthIncome(m) {
    let logged = 0, hasSalary = false;
    for (const e of S.money.entries) {
      if (e.type !== "in" || e.date.slice(0, 7) !== m || e.cat === "Refund" || !X.isIncome(e)) continue;
      logged += e.amt;
      if (e.cat === "Salary" || e.autoSalary) hasSalary = true;
    }
    const s = salary();
    const expected = s && s.amount > 0 && !hasSalary && (!s.since || m >= s.since) ? s.amount : 0;
    return { logged, expected, total: logged + expected };
  }

  let exMonths = 3, exHide = false;
  function buildSummary() {
    const t = today(), [ty, tm] = t.split("-").map(Number);
    const months = []; for (let k = exMonths - 1; k >= 0; k--) months.push(monthStr(ty, tm - 1 - k));
    const inRange = (e) => e.date.slice(0, 7) >= months[0] && e.date.slice(0, 7) <= months[months.length - 1];
    const es = S.money.entries.filter(inRange);
    const cur = S.settings.currency || "";
    const f = (n) => (n < 0 ? "−" : "") + cur + Math.abs(Math.round(n)).toLocaleString("en-US");
    const payeeKey = (note, cat, dir) => (note || cat).replace(dir === "in" ? /^From\s+/i : /^To\s+/i, "").replace(/\s·.*$/, "").replace(/(\s*-\s*\d+|\s+\d{2,})$/, "").replace(/\s+(limited|ltd|plc)\b/gi, "").trim();
    const lines = [];
    lines.push(`# My finances: ${monthName(months[0])} to ${monthName(months[months.length - 1])}`);
    lines.push(`Exported from my Toby app on ${fmtDate(t)}. Currency: ${cur || "local"}. Transfers between my own accounts are already excluded.`);
    lines.push("");
    lines.push("## Setup");
    const s = salary();
    lines.push(`- Monthly take-home salary: ${s && s.amount ? f(s.amount) + ` (paid around the ${ord(+(s.payday || 25))})` : "not set"}`);
    lines.push(`- Monthly budget: ${S.money.budget ? f(S.money.budget) : "not set"}`);
    const lastFull = monthStr(ty, tm - 2);
    for (const [label, m] of [["last full month, " + monthName(lastFull), lastFull], ["this month so far", t.slice(0, 7)]]) {
      const h = healthScore(m);
      lines.push(`- Health score (${label}): ${h.score}/100, ${h.status[0]}. ${h.parts.map((p) => `${p.label} ${Math.round(p.pts)}/${p.max}: ${p.text}`).join("; ")}.`);
    }
    lines.push("");
    lines.push("## Month by month");
    lines.push("| Month | Income | Spent | Net | Budget used |");
    lines.push("|---|---|---|---|---|");
    for (const m of months) {
      const inc = monthIncome(m), sp = monthFigures(m).spent;
      lines.push(`| ${monthName(m)}${m === t.slice(0, 7) ? " (so far)" : ""} | ${f(inc.total)}${inc.expected ? " (incl. expected salary)" : ""} | ${f(sp)} | ${f(inc.total - sp)} | ${S.money.budget ? Math.round((sp / S.money.budget) * 100) + "%" : "-"} |`);
    }
    lines.push("");
    const outs = es.filter(X.isSpend);
    const totalOut = outs.reduce((a, e) => a + e.amt, 0) || 1;
    const cats = {}; outs.forEach((e) => X.catSplit(e).forEach(([c, a]) => (cats[c] = (cats[c] || 0) + a)));
    lines.push("## Spending by category");
    lines.push("| Category | Total | Per month | Share |");
    lines.push("|---|---|---|---|");
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, v]) => lines.push(`| ${c} | ${f(v)} | ${f(v / exMonths)} | ${Math.round((v / totalOut) * 100)}% |`));
    lines.push("");
    // Who the money goes to.
    const payees = {};
    outs.forEach((e) => { const k = payeeKey(e.note, e.cat, "out"); payees[k] = payees[k] || { n: 0, v: 0, cat: e.cat }; payees[k].n++; payees[k].v += e.amt; });
    let personNo = 0;
    const named = {};
    const nameOf = (k, cat) => (!exHide || cat !== "Transfers" ? k : (named[k] = named[k] || "Person " + ++personNo));
    lines.push("## Where the money goes (top 15 payees)");
    lines.push("| Payee | Times | Total | Category |");
    lines.push("|---|---|---|---|");
    Object.entries(payees).sort((a, b) => b[1].v - a[1].v).slice(0, 15).forEach(([k, p]) => lines.push(`| ${nameOf(k, p.cat)} | ${p.n} | ${f(p.v)} | ${p.cat} |`));
    lines.push("");
    const ins = es.filter((e) => X.isIncome(e) && e.cat !== "Refund");
    if (ins.length) {
      const src = {}; ins.forEach((e) => { const k = payeeKey(e.note, e.cat, "in"); src[k] = src[k] || { n: 0, v: 0, cat: e.cat }; src[k].n++; src[k].v += e.amt; });
      lines.push("## Money coming in (top 10 sources)");
      lines.push("| Source | Times | Total | Category |");
      lines.push("|---|---|---|---|");
      Object.entries(src).sort((a, b) => b[1].v - a[1].v).slice(0, 10).forEach(([k, p]) => lines.push(`| ${exHide && p.cat === "Transfer" ? nameOf(k, "Transfers") : k} | ${p.n} | ${f(p.v)} | ${p.cat} |`));
      lines.push("");
    }
    // Spike days.
    const byDay = {}; outs.forEach((e) => (byDay[e.date] = (byDay[e.date] || 0) + e.amt));
    const days = Object.entries(byDay).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (days.length) {
      lines.push("## Biggest spending days");
      days.forEach(([d, v]) => {
        const top = outs.filter((e) => e.date === d).sort((a, b) => b.amt - a.amt)[0];
        lines.push(`- ${fmtDate(d)} ${d.slice(0, 4)}: ${f(v)} (largest: ${nameOf(payeeKey(top.note, top.cat, "out"), top.cat)} ${f(top.amt)})`);
      });
      lines.push("");
    }
    const bills = S.bills.items.filter((b) => b.active !== false);
    if (bills.length) {
      lines.push("## Bills and subscriptions");
      bills.forEach((b) => lines.push(`- ${b.name}: ${f(b.amt)}${b.repeat ? ", " + repeatLabel(b.repeat).toLowerCase() : ", one-off"}${b.kind === "sub" ? " (subscription)" : ""}, next due ${fmtDate(b.due)}`));
      lines.push("");
    }
    if (S.debts.items.length) {
      lines.push("## Loans and debts");
      S.debts.items.forEach((d) => lines.push(`- ${d.dir === "owe" ? "I owe" : "Owed to me by"} ${exHide && d.dir === "owed" ? "a person" : d.name}: ${f(debtBalance(d))} left of ${f(d.amount)}${d.due ? `, due ${fmtDate(d.due)}` : ""}${d.note ? ` (${d.note})` : ""}`));
      lines.push("");
    }
    if (S.savings.items.length) {
      lines.push("## Savings goals");
      S.savings.items.forEach((g) => lines.push(`- ${g.name}: ${f(goalSaved(g))} saved${g.target ? " of " + f(g.target) : ""}${g.deadline ? ", target date " + fmtDate(g.deadline) : ""}`));
      lines.push("");
    }
    const charges = outs.filter((e) => e.cat === "Charges").reduce((a, e) => a + e.amt, 0);
    if (charges) lines.push(`Bank charges in this period: ${f(charges)}.`);
    lines.push("");
    lines.push("Please look at this with me: where is my money going, what stands out, and what should I change first to improve my finances?");
    return lines.join("\n");
  }

  function exportSheet() {
    X.openSheet(`<h2>Talk it through with Claude</h2>
      <p class="small muted" style="margin:0">Toby builds a summary of your money: income, spending by category, who you pay most, spike days, bills, debts and savings. Copy it and paste it into a chat with Claude.</p>
      <div class="grid2"><label class="lbl">Period<select class="field" id="exMonths">${[[1, "This month"], [3, "Last 3 months"], [6, "Last 6 months"], [12, "Last 12 months"]].map(([v, l]) => `<option value="${v}"${exMonths === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="row small" style="gap:8px;align-self:end;padding-bottom:12px"><input type="checkbox" id="exHide"${exHide ? " checked" : ""}> Hide people’s names</label></div>
      <textarea class="field" id="exText" readonly style="min-height:260px;font-family:var(--f-mono);font-size:11.5px;line-height:1.45">${esc(buildSummary())}</textarea>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="exCopy">Copy summary</button><button class="btn" data-act="exSave">Save as file</button></div>`);
  }


  /* ================= MONEY: limits, safe to spend, payday plan ================= */
  const curMonth = () => today().slice(0, 7);
  const limits = () => S.money.limits || {};
  const limitTotal = () => Object.values(limits()).reduce((a, b) => a + (b || 0), 0);
  function catSpend(m) {
    const c = {};
    for (const e of S.money.entries) if (X.isSpend(e) && e.date.slice(0, 7) === m) X.catSplit(e).forEach(([k, a]) => (c[k] = (c[k] || 0) + a));
    return c;
  }
  const monthProgress = (m) => { const t = today(), [y, mo] = m.split("-").map(Number), dim = new Date(y, mo, 0).getDate(); return m === t.slice(0, 7) ? +t.slice(8) / dim : m < t.slice(0, 7) ? 1 : 0; };
  const levelOf = (spent, lim) => (!lim ? "" : spent >= lim ? "over" : spent >= lim * 0.8 ? "near" : "ok");
  const LEVEL_TXT = { over: "Over limit", near: "Close to limit", ok: "On track" };

  function whereItWent(m, cats) {
    const lim = limits();
    const pairs = Array.isArray(cats) ? cats : Object.entries(cats);
    const rows = pairs.concat(Object.keys(lim).filter((c) => lim[c] && !pairs.some((x) => x[0] === c)).map((c) => [c, 0])).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return "";
    const mx = Math.max(...rows.map(([c, v]) => Math.max(v, lim[c] || 0)), 1);
    const body = rows.map(([c, v]) => {
      const l = lim[c] || 0, lv = levelOf(v, l);
      return `<div class="lim-row"><div class="lim-h"><span>${esc(c)}</span><span class="amt">${money(Math.round(v))}${l ? `<span class="muted"> / ${compact(l)}</span>` : ""}</span></div>
        <div class="lim-bar"><i class="${lv}" style="width:${(Math.min(v, mx) / mx) * 100}%"></i>${l ? `<b style="left:${(l / mx) * 100}%" title="Limit ${money(l)}"></b>` : ""}</div>
        ${lv && lv !== "ok" ? `<span class="lim-tag ${lv}">${LEVEL_TXT[lv]}</span>` : ""}</div>`;
    }).join("");
    return section("Where it went", body, `<button class="link" data-act="moneyTab" data-v="limits">${Object.keys(lim).length ? "Edit limits" : "Set limits"}</button>`);
  }

  function limitsTab() {
    const m = curMonth(), cats = catSpend(m), lim = limits(), prog = monthProgress(m);
    const s = salary(), total = limitTotal();
    const avg = {}; const months = [1, 2, 3].map((k) => { const [y, mo] = m.split("-").map(Number); return monthStr(y, mo - 1 - k); });
    months.forEach((mm) => Object.entries(catSpend(mm)).forEach(([c, v]) => (avg[c] = (avg[c] || 0) + v / 3)));
    let h = `<section class="card"><p class="small muted" style="margin:0 0 10px">Give each category a monthly limit. Bars turn amber at 80% and red past the limit, and Toby notifies you once for each.</p>
      <div class="kv"><span>Limits add up to</span><b class="num">${money(total)}</b></div>
      ${s && s.amount ? `<div class="kv"><span class="muted">Salary ${money(s.amount)}</span><span class="num" style="color:${s.amount - total < 0 ? "var(--bad)" : "var(--good)"}">${s.amount - total < 0 ? money(total - s.amount) + " over salary" : money(s.amount - total) + " left for saving and debts"}</span></div>` : ""}
      <div class="btns" style="margin-top:10px">${total && total !== S.money.budget ? `<button class="btn primary" data-act="limitsToBudget">Use ${compact(total)} as my monthly budget</button>` : ""}<button class="btn" data-act="limitsSuggest">Suggest from my last 3 months</button></div></section>`;
    h += `<section class="card"><div class="sec-h"><h2>${MONL[+m.slice(5) - 1]}</h2><span class="small muted">${Math.round(prog * 100)}% of the month gone</span></div>`;
    h += X.OUT_CATS.filter((c) => c !== "Lending").map((c) => {
      const v = cats[c] || 0, l = lim[c] || 0, lv = levelOf(v, l), pace = l ? v / (l * Math.max(prog, 0.03)) : 0;
      return `<div class="lim-edit"><div class="lim-h"><span>${esc(c)}</span><span class="small muted">${money(Math.round(v))} spent${avg[c] ? ` · usually ${compact(avg[c])}` : ""}</span></div>
        <div class="row"><input class="field num lim-in" id="lim-${esc(c)}" data-cat="${esc(c)}" inputmode="decimal" placeholder="No limit" value="${l || ""}"><span class="lim-tag ${lv || ""}" style="min-width:96px;text-align:center">${l ? (lv === "ok" ? (pace > 1.1 ? "Fast pace" : "On track") : LEVEL_TXT[lv]) : "—"}</span></div>
        ${l ? `<div class="lim-bar"><i class="${lv}" style="width:${Math.min(100, (v / l) * 100)}%"></i><b style="left:${Math.min(100, prog * 100)}%" title="Where you'd be at an even pace"></b></div>` : ""}</div>`;
    }).join("");
    h += `<p class="small muted" style="margin:10px 0 0">The thin mark on each bar shows where you’d be if you spent evenly through the month.</p></section>`;
    return h;
  }

  function checkLimits() {
    const m = curMonth(), cats = catSpend(m), lim = limits();
    S.money.limitAlerts = S.money.limitAlerts || {};
    let changed = false, msg = "";
    for (const [c, l] of Object.entries(lim)) {
      if (!l) continue;
      const v = cats[c] || 0, lv = v >= l ? 100 : v >= l * 0.8 ? 80 : 0, key = m + ":" + c;
      if (lv && (S.money.limitAlerts[key] || 0) < lv) {
        S.money.limitAlerts[key] = lv; changed = true;
        msg = lv === 100 ? `${c} is over its limit: ${money(Math.round(v))} of ${money(l)}` : `${c} is at ${Math.round((v / l) * 100)}% of its limit`;
      }
    }
    if (changed) { save("money"); X.toast(msg); }
  }

  function nextPayday() {
    const s = salary(), t = today(), [y, mo] = t.split("-").map(Number);
    const fit = (yy, mm, d) => { const dim = new Date(yy, mm, 0).getDate(); return yy + "-" + pad(mm) + "-" + pad(Math.min(d, dim)); };
    if (!s || !s.amount) return fit(y, mo, 31);
    const thisMonth = fit(y, mo, s.payday || 25);
    if (thisMonth >= t) return thisMonth;
    const nm = new Date(y, mo, 1);
    return fit(nm.getFullYear(), nm.getMonth() + 1, s.payday || 25);
  }
  const cashAccounts = () => (S.money.accounts || []).filter((a) => a.kind !== "savings");
  function safeToSpend() {
    const t = today(), pay = nextPayday(), days = Math.max(1, daysUntil(pay) + 1);
    const due = [];
    activeBills().forEach((b) => { if (b.due >= t && b.due <= pay) due.push({ name: b.name, amt: b.amt, due: b.due, kind: "bill" }); });
    openDebts("owe").forEach((d) => { if (d.due && d.due <= pay) due.push({ name: d.name, amt: debtBalance(d), due: d.due, kind: "debt" }); });
    const dueSum = due.reduce((a, x) => a + x.amt, 0);
    const accts = cashAccounts(), fresh = accts.length && accts.every((a) => a.asOf && daysUntil(a.asOf) >= -3);
    let left, basis;
    if (fresh) { left = accts.reduce((a, x) => a + (x.balance || 0), 0) - dueSum; basis = "balance"; }
    else {
      const budget = S.money.budget || limitTotal() || (salary() && salary().amount) || 0;
      if (!budget) return null;
      const spent = monthFigures(curMonth()).spent;
      left = budget - spent - due.filter((x) => x.kind === "bill").reduce((a, x) => a + x.amt, 0);
      basis = "budget";
    }
    const clash = due.filter((x) => x.kind === "debt" && x.due < pay);
    return { perDay: left / days, left, days, pay, due, basis, clash };
  }
  function safeCard() {
    const st = safeToSpend();
    if (!st) return "";
    const warn = st.clash.length ? `<div class="warn small"><b>Due before payday:</b> ${st.clash.map((x) => `${esc(x.name)} ${money(Math.round(x.amt))} on ${esc(fmtDate(x.due))}`).join(", ")}. Your salary arrives ${esc(fmtDate(st.pay))}, so set this money aside now.</div>` : "";
    return `<section class="card"><div class="sec-h"><h2>Safe to spend</h2><span class="small muted">until ${esc(fmtDate(st.pay))}</span></div>
      <div class="big" style="color:${st.perDay < 0 ? "var(--bad)" : "var(--ink)"}">${st.perDay < 0 ? "Over by " + money(Math.round(-st.left)) : money(Math.round(st.perDay / 100) * 100) + '<span class="muted" style="font-size:16px"> a day</span>'}</div>
      <p class="small muted" style="margin:6px 0 0">${st.perDay < 0 ? "You’ve already passed what’s available until payday." : `${money(Math.round(st.left))} for the next ${plural(st.days, "day")}`}, ${st.basis === "balance" ? "from your account balances" : "from your monthly budget"}${(() => { const counted = st.basis === "balance" ? st.due : st.due.filter((x) => x.kind === "bill"); return counted.length ? `, after ${money(Math.round(counted.reduce((a, x) => a + x.amt, 0)))} of ${st.basis === "balance" ? "bills and repayments" : "bills"} due before payday` : ""; })()}.</p>${warn}</section>`;
  }

  // Payday plan and side-gig split
  function pendingPayday() {
    const done = S.money.planned || {};
    return S.money.entries.filter((e) => e.type === "in" && e.cat === "Salary" && daysUntil(e.date) >= -10 && daysUntil(e.date) <= 0 && !done[e.id]).sort((a, b) => b.date.localeCompare(a.date))[0];
  }
  function pendingGig() {
    const done = S.money.planned || {};
    return S.money.entries.filter((e) => e.type === "in" && e.cat === "Business" && daysUntil(e.date) >= -14 && !done[e.id]).sort((a, b) => b.date.localeCompare(a.date))[0];
  }
  const rebuildGoal = () => S.savings.items.find((g) => /rebuild/i.test(g.name)) || S.savings.items.find((g) => !g.target || goalSaved(g) < g.target) || null;
  function paydayCard() {
    const e = pendingPayday();
    if (e) {
      const nextPay = (() => { const [y, mo] = e.date.split("-").map(Number); const d = new Date(y, mo, Math.min(31, (salary() || {}).payday || +e.date.slice(8))); return ymd(d); })();
      const bills = activeBills().filter((b) => b.due >= e.date && b.due <= nextPay).reduce((a, b) => a + b.amt, 0);
      const debts = openDebts("owe").filter((d) => !d.due || d.due <= nextPay).reduce((a, d) => a + debtBalance(d), 0);
      const save15 = Math.round((e.amt * 0.15) / 1000) * 1000;
      const debtPart = Math.min(debts, Math.max(0, e.amt - bills - save15));
      const spend = Math.max(0, e.amt - bills - debtPart - save15);
      const g = rebuildGoal();
      return `<section class="card plan-card"><div class="sec-h"><h2>Payday plan</h2><span class="small muted">${money(e.amt)} arrived ${esc(relDay(e.date).toLowerCase())}</span></div>
        <p class="small muted" style="margin:0 0 10px">Give every naira a job before spending starts. Change any amount.</p>
        ${[["pp-bills", "Bills due this month", bills], ["pp-debts", "Loan repayments", debtPart], ["pp-save", "Savings" + (g ? " → " + g.name : ""), save15], ["pp-spend", "Spending for the month", spend]].map(([id, l, v]) => `<div class="plan-row"><span>${esc(l)}</span><input class="field num" id="${id}" inputmode="decimal" value="${Math.round(v)}"></div>`).join("")}
        <label class="row small" style="gap:8px;margin-top:8px"><input type="checkbox" id="ppBudget" checked> Make the spending amount this month’s budget</label>
        <div class="btns" style="margin-top:10px"><button class="btn primary" data-act="ppApply" data-id="${e.id}">Apply plan</button><button class="btn" data-act="ppSkip" data-id="${e.id}">Not now</button></div></section>`;
    }
    const gig = pendingGig();
    if (gig) {
      const half = Math.round(gig.amt / 2 / 100) * 100, g = rebuildGoal(), debt = openDebts("owe").sort((a, b) => (a.due || "9").localeCompare(b.due || "9"))[0];
      return `<section class="card plan-card"><div class="sec-h"><h2>Side gig money</h2><span class="small muted">${money(gig.amt)} ${esc(relDay(gig.date).toLowerCase())}</span></div>
        <p class="small" style="margin:0 0 10px">Your rule: half goes to work for you. Where should ${money(half)} go?</p>
        <div class="btns">${debt ? `<button class="btn primary" data-act="gigDebt" data-id="${gig.id}" data-debt="${debt.id}">Toward ${esc(debt.name)}</button>` : ""}${g ? `<button class="btn${debt ? "" : " primary"}" data-act="gigSave" data-id="${gig.id}" data-goal="${g.id}">Into ${esc(g.name)}</button>` : `<button class="btn" data-act="goalNewRebuild">Create “Rebuild savings”</button>`}<button class="btn" data-act="ppSkip" data-id="${gig.id}">Skip</button></div></section>`;
    }
    return "";
  }

  /* ================= MONEY: insights ================= */
  let insightRange = 3;
  function netWorthCard() {
    const accts = S.money.accounts || [];
    const cash = accts.reduce((a, x) => a + (x.balance || 0), 0);
    const owed = openDebts("owed").reduce((a, d) => a + debtBalance(d), 0), owe = openDebts("owe").reduce((a, d) => a + debtBalance(d), 0);
    const nw = cash + owed - owe;
    return `<section class="card"><div class="sec-h"><h2>Net worth</h2><button class="link" data-act="acctNew">Add account</button></div>
      <div class="big" style="color:${nw < 0 ? "var(--bad)" : "var(--ink)"}">${nw < 0 ? "−" : ""}${money(Math.abs(Math.round(nw)))}</div>
      <p class="small muted" style="margin:4px 0 10px">Accounts ${money(Math.round(cash))} + owed to you ${money(Math.round(owed))} − you owe ${money(Math.round(owe))}</p>
      <div class="list">${accts.length ? accts.map((a) => `<div class="item"><button class="body" data-act="acctEdit" data-id="${a.id}" style="display:flex;justify-content:space-between;gap:10px"><span class="t">${esc(a.name)}<span class="m"><span>${a.kind === "savings" ? "Savings · " : ""}${a.asOf ? "as of " + esc(relDay(a.asOf).toLowerCase()) : "no date"}</span></span></span><span class="amt">${money(Math.round(a.balance || 0))}</span></button></div>`).join("") : empty("No accounts yet.", "Add your OPay, Access and savings balances, or import a statement and Toby fills them in.")}</div></section>`;
  }

  function trendsCard() {
    const t = today(), [y, mo] = t.split("-").map(Number);
    const months = []; for (let k = 5; k >= 0; k--) months.push(monthStr(y, mo - 1 - k));
    const data = months.map((m) => ({ m, inc: monthIncome(m).total, out: monthFigures(m).spent }));
    if (!data.some((d) => d.inc || d.out)) return section("Last 6 months", empty("Not enough history yet.", "Import statements or keep logging and trends appear here."));
    const W = 340, Hh = 170, L = 44, R = 6, T = 12, B = 22;
    const top = Math.max(...data.map((d) => Math.max(d.inc, d.out)), 1), step = niceStep(top), yMax = Math.ceil(top / step) * step;
    const y0 = (v) => T + (1 - v / yMax) * (Hh - T - B);
    const gw = (W - L - R) / months.length, bw = Math.min(16, (gw - 10) / 2);
    let g = "";
    for (let v = 0; v <= yMax + 0.1; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y0(v)}" y2="${y0(v)}" class="grid"/><text x="${L - 6}" y="${y0(v) + 3.5}" text-anchor="end" class="axis">${compact(v)}</text>`;
    const bar = (x, v, cls, label) => { const h = Math.max(0, y0(0) - y0(v)); const r = Math.min(4, bw / 2, h); return `<path class="${cls}" d="M${x},${y0(0)} V${y0(v) + r} Q${x},${y0(v)} ${x + r},${y0(v)} H${x + bw - r} Q${x + bw},${y0(v)} ${x + bw},${y0(v) + r} V${y0(0)} Z"><title>${label}</title></path>`; };
    data.forEach((d, i) => {
      const cx = L + gw * i + gw / 2;
      g += bar(cx - bw - 1, d.inc, "bar-in", `${monthName(d.m)} income ${money(Math.round(d.inc))}`) + bar(cx + 1, d.out, d.out > d.inc ? "bar-out over" : "bar-out", `${monthName(d.m)} spent ${money(Math.round(d.out))}`);
      g += `<text x="${cx}" y="${Hh - 6}" text-anchor="middle" class="axis">${MON[+d.m.slice(5) - 1]}</text>`;
    });
    const short = data.filter((d) => d.out > d.inc && d.inc).length;
    // Category trend table.
    const cats = {}; months.forEach((m) => Object.entries(catSpend(m)).forEach(([c, v]) => { cats[c] = cats[c] || {}; cats[c][m] = v; }));
    const topCats = Object.entries(cats).map(([c, mv]) => [c, Object.values(mv).reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1]).slice(0, 7).map((x) => x[0]);
    const cmax = Math.max(1, ...topCats.flatMap((c) => months.map((m) => cats[c][m] || 0)));
    const table = `<div class="trend-table" role="table"><div class="tr th" role="row"><span></span>${months.map((m) => `<span>${MON[+m.slice(5) - 1]}</span>`).join("")}</div>${topCats.map((c) => `<div class="tr" role="row"><span class="tc">${esc(c)}</span>${months.map((m) => { const v = cats[c][m] || 0; return `<span class="cell" style="--a:${(v / cmax).toFixed(2)}" title="${esc(c)} ${monthName(m)}: ${money(Math.round(v))}">${v ? compact(v) : "–"}</span>`; }).join("")}</div>`).join("")}</div>`;
    return `<section class="card"><div class="sec-h"><h2>Last 6 months</h2></div>
      <div class="legend"><span><i class="sw in"></i>Income</span><span><i class="sw out"></i>Spending</span><span><i class="sw over"></i>Spent more than income</span></div>
      <svg viewBox="0 0 ${W} ${Hh}" class="line-chart" role="img" aria-label="Income and spending for the last 6 months">${g}</svg>
      <p class="small" style="margin:6px 0 0">${short ? `You spent more than you earned in ${plural(short, "month")} of the last 6.` : "You stayed within your income every month."}</p>
      <h3 style="margin:16px 0 6px">Spending by category</h3>${table}</section>`;
  }

  const PERSON_CATS = [["Transfers", "Not sorted"], ["Family", "Family & support"], ["Bills", "Rent & home"], ["Work", "Business"], ["Lending", "Lent (owed back)"], ["Other", "Gifts & other"]];
  function transfersCard() {
    const t = today(), [y, mo] = t.split("-").map(Number);
    const from = monthStr(y, mo - insightRange) + "-01";
    const people = {};
    for (const e of S.money.entries) {
      if (e.type === "in" || e.date < from) continue;
      if (!/^To\s/i.test(e.note || "") || !["Transfers", "Family", "Lending", "Other", "Bills", "Work"].includes(e.cat)) continue;
      const who = X.payeeOf(e), k = X.ruleKey(who); if (!k) continue;
      const p = (people[k] = people[k] || { who, n: 0, v: 0, cats: {} });
      p.n++; p.v += e.amt; p.cats[e.cat] = (p.cats[e.cat] || 0) + 1;
    }
    const list = Object.entries(people).sort((a, b) => b[1].v - a[1].v);
    const total = list.reduce((a, [, p]) => a + p.v, 0);
    const byCat = {}; list.forEach(([, p]) => { const c = Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0][0]; byCat[c] = (byCat[c] || 0) + p.v; });
    const rangeSeg = `<div class="seg seg-sub mini">${[[1, "This month"], [3, "3 months"], [6, "6 months"]].map(([v, l]) => `<button class="${insightRange === v ? "on" : ""}" data-act="insRange" data-v="${v}">${l}</button>`).join("")}</div>`;
    if (!list.length) return section("Transfers to people", rangeSeg + empty("No transfers to people.", "Payments to individuals show here once you log or import them."));
    return `<section class="card"><div class="sec-h"><h2>Transfers to people</h2><span class="amt">${money(Math.round(total))}</span></div>${rangeSeg}
      <div class="chips" style="margin-bottom:8px">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span class="chip${c === "Transfers" ? " hi" : ""}">${esc((PERSON_CATS.find((x) => x[0] === c) || [c, c])[1])} ${compact(v)}</span>`).join("")}</div>
      <p class="small muted" style="margin:0 0 6px">Sort each person once; it applies to all their payments and future imports. “Lent” keeps it out of spending.</p>
      <div class="list">${list.slice(0, 25).map(([k, p]) => { const main = Object.entries(p.cats).sort((a, b) => b[1] - a[1])[0][0]; return `<div class="item" style="align-items:center"><div class="body"><div class="t">${esc(p.who)}</div><div class="m"><span>${plural(p.n, "payment")}</span><span class="amt">${money(Math.round(p.v))}</span></div></div><select class="field person-cat" data-key="${esc(k)}" aria-label="What these payments are">${PERSON_CATS.map(([v, l]) => `<option value="${v}"${v === main ? " selected" : ""}>${l}</option>`).join("")}</select></div>`; }).join("")}</div>
      ${list.length > 25 ? `<p class="small muted" style="margin:6px 0 0">and ${list.length - 25} more people</p>` : ""}</section>`;
  }
  function insightsTab() { return netWorthCard() + trendsCard() + transfersCard(); }

  function acctSheet(a) {
    const isNew = !a; a = a || { name: "", balance: "", kind: "bank", asOf: today() };
    X.openSheet(`<h2>${isNew ? "Add account" : esc(a.name)}</h2>
      <input class="field" id="acName" placeholder="e.g. OPay Wallet, Access, Cash" value="${esc(a.name)}">
      <div class="grid2"><label class="lbl">Balance now<input class="field num" id="acBal" inputmode="decimal" value="${esc(a.balance)}" placeholder="0"></label><label class="lbl">Type<select class="field" id="acKind"><option value="bank"${a.kind !== "savings" ? " selected" : ""}>Everyday</option><option value="savings"${a.kind === "savings" ? " selected" : ""}>Savings</option></select></label></div>
      <p class="small muted" style="margin:0">Everyday balances power “Safe to spend” when they’re less than 3 days old. Importing a statement updates them for you.</p>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="acctSave" data-id="${a.id || ""}">Save</button>${isNew ? "" : `<button class="btn danger" data-act="acctDel" data-id="${a.id}">Delete</button>`}</div>`, (s) => { s.querySelector(isNew ? "#acName" : "#acBal").focus(); });
  }

  /* ================= MONEY: regular payments found in your history ================= */
  function recurringFound() {
    const t = today(), [y, mo] = t.split("-").map(Number);
    const from = monthStr(y, mo - 5) + "-01";
    const groups = {};
    for (const e of S.money.entries) {
      if (!X.isSpend(e) || e.date < from || e.cat === "Charges") continue;
      const who = X.payeeOf(e), k = X.ruleKey(who); if (!k) continue;
      (groups[k] = groups[k] || { who, es: [] }).es.push(e);
    }
    const billKeys = new Set(S.bills.items.map((b) => X.ruleKey(b.name)));
    const dismissed = S.money.notRecurring || {};
    const out = [];
    for (const [k, g] of Object.entries(groups)) {
      if (billKeys.has(k) || dismissed[k]) continue;
      const months = new Set(g.es.map((e) => e.date.slice(0, 7)));
      if (months.size < 3) continue;
      const amts = g.es.map((e) => e.amt).sort((a, b) => a - b), med = amts[Math.floor(amts.length / 2)];
      const steady = g.es.filter((e) => Math.abs(e.amt - med) <= med * 0.15);
      const steadyMonths = new Set(steady.map((e) => e.date.slice(0, 7)));
      if (steadyMonths.size < 3 || steady.length > steadyMonths.size * 2) continue; // several a month = shopping, not a bill
      const days = steady.map((e) => +e.date.slice(8)).sort((a, b) => a - b), day = days[Math.floor(days.length / 2)];
      out.push({ k, who: g.who, amt: med, day, months: steadyMonths.size, cat: steady[0].cat });
    }
    return out.sort((a, b) => b.amt - a.amt).slice(0, 8);
  }
  function recurringCard() {
    const r = recurringFound();
    if (!r.length) return "";
    return section("Looks like regular payments", `<p class="small muted" style="margin:0 0 6px">Found in your transactions: similar amounts, around the same day, at least 3 months running.</p><div class="list">${r.map((x) => `<div class="item" style="align-items:center"><div class="body"><div class="t">${esc(x.who)}</div><div class="m"><span>about ${money(Math.round(x.amt))} around the ${ord(x.day)}</span><span>${x.months} months</span></div></div><button class="btn small-btn" data-act="recAdd" data-k="${esc(x.k)}">Add as bill</button><button class="icon-btn" data-act="recNo" data-k="${esc(x.k)}" aria-label="Not a bill">×</button></div>`).join("")}</div>`);
  }

  /* ================= transaction editor extras ================= */
  function entryExtras(en) {
    let h = "";
    if (en.type !== "in") {
      const sp = en.splits || [];
      h += `<details class="split"${sp.length ? " open" : ""}><summary class="small">Split across categories</summary><div id="spRows">${sp.map((x) => splitRow(x.cat, x.amt)).join("")}</div><button class="link" data-act="spAdd">+ Add a part</button><p class="small muted" style="margin:4px 0 0">Whatever isn’t split stays in the main category.</p></details>`;
      const who = X.payeeOf(en);
      if (en.cat !== "Lending" && who && /^To\s/i.test(en.note || "")) h += `<button class="btn" data-act="markLent" data-id="${en.id}">This was a loan to ${esc(who)}</button>`;
    } else if (en.cat !== "Repayment" && openDebts("owed").length) {
      h += `<button class="btn" data-act="markRepaid" data-id="${en.id}">This repays money I lent</button>`;
    }
    return h;
  }
  const splitRow = (cat, amt) => `<div class="row sp-row" style="margin-top:6px"><select class="field sp-cat">${X.OUT_CATS.map((c) => `<option${c === cat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select><input class="field num sp-amt" inputmode="decimal" placeholder="Amount" value="${amt || ""}"></div>`;
  function readSplits() {
    const rows = [...document.querySelectorAll(".sp-row")];
    if (!rows.length) return null;
    return rows.map((r) => ({ cat: r.querySelector(".sp-cat").value, amt: num(r.querySelector(".sp-amt").value) })).filter((x) => x.amt > 0);
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
  function billSheet(b, pre) {
    const isNew = !b;
    b = b || { name: "", amt: "", cat: "Bills", due: today(), repeat: "month", kind: "bill", remind: 2, ...(pre || {}) };
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
    const spent = S.money.entries.filter((e) => X.isSpend(e) && e.date >= from && e.date <= t).reduce((s, e) => s + e.amt, 0);
    const cats = {}; S.money.entries.filter((e) => X.isSpend(e) && e.date >= from && e.date <= t).forEach((e) => X.catSplit(e).forEach(([c, a]) => (cats[c] = (cats[c] || 0) + a)));
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
    return TL.moreView({ lists: LISTS ? plural(LISTS.length, "list") : "Shopping, reading, watch", review: reviewEntry(false) ? "Done this week" : "Look back, plan ahead" });
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
    h += section("Log spending automatically", `<p class="small muted" style="margin:0 0 10px">Two ways to get OPay and bank transactions into Toby without typing. Both need a Toby key from the Siri card below. Toby skips transfers to your own accounts, and a later statement import won’t add them twice.</p>
      <details><summary class="small">Share an OPay receipt (after any transfer or payment)</summary><ol class="small muted plain-steps">
        <li>In Shortcuts, tap <b>+</b> and name it <b>Log receipt to Toby</b>.</li>
        <li>Tap the <b>ⓘ</b> button, turn on <b>Show in Share Sheet</b>, and set it to receive only <b>Images</b>.</li>
        <li>Add <b>Extract Text from Image</b> (input: Shortcut Input).</li>
        <li>Add <b>Get Contents of URL</b> set up like your Add to Toby shortcut, with <code>text</code> set to <b>Text from Image</b>.</li>
        <li>Add <b>Show Notification</b> with <b>Contents of URL</b>.</li>
        <li>In OPay, after a transaction tap <b>Share Receipt</b> → <b>Share as image</b> → <b>Log receipt to Toby</b>.</li></ol></details>
      <details style="margin-top:8px"><summary class="small">Log bank SMS alerts automatically</summary><ol class="small muted plain-steps">
        <li>In Shortcuts, open <b>Automation</b> → <b>+</b> → <b>Message</b>.</li>
        <li>Set <b>Sender</b> to your bank’s alert name (for example AccessBank) and choose <b>Run Immediately</b>.</li>
        <li>Add <b>Get Contents of URL</b> like your Add to Toby shortcut, with <code>text</code> set to <b>Shortcut Input</b> (the message).</li>
        <li>Optional: add <b>Show Notification</b> with Contents of URL to see what was logged.</li>
        <li>Every debit or credit alert now lands in Money on its own.</li></ol></details>`);
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
      ["Documents", TL.searchDocs(has)],
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
      if (touched.has("money")) setTimeout(checkLimits, 2500);
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
    limitsToBudget: () => { S.money.budget = limitTotal(); save("money"); X.render(); X.toast("Monthly budget set to " + money(S.money.budget)); },
    limitsSuggest: () => {
      const m = curMonth(), [y, mo] = m.split("-").map(Number), avg = {};
      [1, 2, 3].forEach((k) => Object.entries(catSpend(monthStr(y, mo - 1 - k))).forEach(([c, v]) => (avg[c] = (avg[c] || 0) + v / 3)));
      const next = { ...limits() };
      Object.entries(avg).forEach(([c, v]) => { if (c !== "Lending" && !next[c] && v > 0) next[c] = Math.max(5000, Math.round((v * 0.85) / 5000) * 5000); });
      S.money.limits = next; save("money"); X.render(); X.toast("Suggested limits: 15% under your recent average. Adjust any of them.");
    },
    ppApply: (b) => {
      const v = (id) => num(($("#" + id) || {}).value) || 0, saveAmt = v("pp-save"), spend = v("pp-spend");
      if (saveAmt > 0) { let g = rebuildGoal(); if (!g) { g = { id: newId(), name: "Savings", target: 0, deadline: "", log: [] }; S.savings.items.push(g); } g.log = [...(g.log || []), { id: newId(), date: today(), amt: saveAmt }]; save("savings"); }
      if ($("#ppBudget") && $("#ppBudget").checked && spend > 0) S.money.budget = spend;
      S.money.planned = { ...(S.money.planned || {}), [b.dataset.id]: true }; save("money"); X.render();
      X.toast(saveAmt > 0 ? `Plan set. ${money(saveAmt)} added to savings.` : "Plan set.");
    },
    ppSkip: (b) => { S.money.planned = { ...(S.money.planned || {}), [b.dataset.id]: true }; save("money"); X.render(); },
    gigSave: (b) => { const e = S.money.entries.find((x) => x.id === b.dataset.id), g = G(b.dataset.goal); if (!e || !g) return; const half = Math.round(e.amt / 2 / 100) * 100; g.log = [...(g.log || []), { id: newId(), date: today(), amt: half }]; S.money.planned = { ...(S.money.planned || {}), [e.id]: true }; save("savings"); save("money"); X.render(); X.toast(`${money(half)} added to ${g.name}`); },
    gigDebt: (b) => { const e = S.money.entries.find((x) => x.id === b.dataset.id), d = S.debts.items.find((x) => x.id === b.dataset.debt); if (!e || !d) return; const half = Math.min(debtBalance(d), Math.round(e.amt / 2 / 100) * 100); d.log = [...(d.log || []), { id: newId(), date: today(), amt: half, kind: "pay" }]; S.money.planned = { ...(S.money.planned || {}), [e.id]: true }; save("debts"); save("money"); X.render(); X.toast(`Logged ${money(half)} toward ${d.name}. ${money(Math.round(debtBalance(d)))} left.`); },
    goalNewRebuild: () => { const g = { id: newId(), name: "Rebuild savings", target: 0, deadline: "", log: [] }; S.savings.items.push(g); save("savings"); X.render(); goalSheet(g); },
    insRange: (b) => { insightRange = +b.dataset.v; X.render(); },
    acctNew: () => acctSheet(null),
    acctEdit: (b) => { const a = (S.money.accounts || []).find((x) => x.id === b.dataset.id); if (a) acctSheet(a); },
    acctSave: (b) => {
      const name = $("#acName").value.trim(), bal = num($("#acBal").value);
      if (!name) { $("#acName").focus(); return; }
      if (!isFinite(bal)) { $("#acBal").focus(); X.toast("Enter the balance."); return; }
      S.money.accounts = S.money.accounts || [];
      const v = { name, balance: bal, kind: $("#acKind").value, asOf: today() };
      if (b.dataset.id) Object.assign(S.money.accounts.find((x) => x.id === b.dataset.id), v); else S.money.accounts.push({ id: newId(), ...v });
      save("money"); X.closeSheet();
    },
    acctDel: (b) => X.armDelete(b, () => { S.money.accounts = (S.money.accounts || []).filter((x) => x.id !== b.dataset.id); save("money"); X.closeSheet(); }),
    recAdd: (b) => {
      const r = recurringFound().find((x) => x.k === b.dataset.k); if (!r) return;
      const t = today(), [y, mo] = t.split("-").map(Number);
      let due = y + "-" + pad(mo) + "-" + pad(Math.min(r.day, new Date(y, mo, 0).getDate()));
      if (due < t) { const n = new Date(y, mo, 1); due = n.getFullYear() + "-" + pad(n.getMonth() + 1) + "-" + pad(Math.min(r.day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate())); }
      billSheet(null, { name: r.who, amt: Math.round(r.amt), due, repeat: "month", cat: r.cat === "Transfers" ? "Bills" : r.cat });
    },
    recNo: (b) => { S.money.notRecurring = { ...(S.money.notRecurring || {}), [b.dataset.k]: 1 }; save("money"); X.render(); },
    spAdd: () => { const el = $("#spRows"); if (el) el.insertAdjacentHTML("beforeend", splitRow("Food", "")); },
    markLent: (b) => {
      const e = S.money.entries.find((x) => x.id === b.dataset.id); if (!e) return;
      const who = X.payeeOf(e), k = X.ruleKey(who);
      e.cat = "Lending";
      const d = openDebts("owed").find((x) => X.ruleKey(x.name) === k);
      if (d) d.log = [...(d.log || []), { id: newId(), date: e.date, amt: e.amt, kind: "add" }];
      else S.debts.items.push({ id: newId(), name: who, dir: "owed", amount: e.amt, date: e.date, due: "", note: "", log: [] });
      save("money"); save("debts"); X.closeSheet(); X.toast(`${money(e.amt)} moved to Debts: ${who} owes you`);
    },
    markRepaid: (b) => {
      const e = S.money.entries.find((x) => x.id === b.dataset.id); if (!e) return;
      const k = X.ruleKey(X.payeeOf(e)), list = openDebts("owed"), match = list.find((d) => X.ruleKey(d.name) === k);
      if (match) return applyRepay(e, match);
      X.openSheet(`<h2>Who is repaying?</h2><div class="list">${list.map((d) => `<div class="item"><button class="body" data-act="repayPick" data-id="${e.id}" data-debt="${d.id}" style="display:flex;justify-content:space-between"><span class="t">${esc(d.name)}</span><span class="amt">${money(Math.round(debtBalance(d)))}</span></button></div>`).join("")}</div>`);
    },
    repayPick: (b) => { const e = S.money.entries.find((x) => x.id === b.dataset.id), d = S.debts.items.find((x) => x.id === b.dataset.debt); if (e && d) applyRepay(e, d); },
    openSalary: () => salarySheet(),
    saveSalary: () => {
      const amount = num($("#slAmt").value);
      if (!(amount > 0)) { $("#slAmt").focus(); X.toast("Enter your take-home amount."); return; }
      const prev = salary();
      S.money.salary = { amount, payday: +$("#slDay").value, auto: $("#slAuto").checked, source: $("#slSrc").value.trim(), since: $("#slPast").checked ? "" : (prev && prev.since) || today().slice(0, 7), lastAuto: prev && prev.lastAuto };
      autoSalary(); save("money"); X.closeSheet(); X.toast("Salary saved");
    },
    delSalary: (b) => X.armDeleteLabel(b, "Tap again to remove", () => { delete S.money.salary; save("money"); X.closeSheet(); }),
    openExport: (b, e) => { if (e) e.preventDefault(); exportSheet(); },
    exCopy: () => copyField("#exText", "Copied. Paste it into a chat with Claude."),
    exSave: async () => {
      const text = $("#exText").value, name = "toby-money-summary-" + today() + ".md";
      try {
        const file = new File([text], name, { type: "text/markdown" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Money summary" }); return; }
        const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (err) { if (!err || err.name !== "AbortError") X.toast("Couldn't save the file. Use Copy instead."); }
    },
    chartMode: (b) => { chartMode = b.dataset.v; X.render(); },
    chartClear: () => { chartDay = null; X.render(); },
    newDebt: () => debtSheet(null),
    openDebt: (b) => { const d = S.debts.items.find((x) => x.id === b.dataset.id); if (d) debtSheet(d); },
    dbDir: (b) => { debtDraftDir = b.dataset.v; document.querySelectorAll("[data-act=dbDir]").forEach((x) => x.classList.toggle("on", x.dataset.v === debtDraftDir)); },
    saveDebt: (b) => {
      const name = $("#dbName").value.trim(), amount = num($("#dbTotal").value);
      if (!name) { $("#dbName").focus(); return; }
      if (!(amount > 0)) { $("#dbTotal").focus(); X.toast("Enter the amount."); return; }
      const v = { name, amount, dir: debtDraftDir, date: $("#dbDate").value || today(), due: $("#dbDue").value, note: $("#dbNote").value.trim() };
      if (b.dataset.id) Object.assign(S.debts.items.find((x) => x.id === b.dataset.id), v); else S.debts.items.push({ id: newId(), log: [], ...v });
      save("debts"); X.closeSheet(); X.toast("Saved");
    },
    dbPay: (b) => debtMove(b.dataset.id, "pay"),
    dbAdd: (b) => debtMove(b.dataset.id, "add"),
    delDebt: (b) => X.armDelete(b, () => { S.debts.items = S.debts.items.filter((x) => x.id !== b.dataset.id); save("debts"); X.closeSheet(); }),
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
  function applyRepay(e, d) {
    e.cat = "Repayment";
    d.log = [...(d.log || []), { id: newId(), date: e.date, amt: Math.min(e.amt, debtBalance(d)), kind: "pay" }];
    save("money"); save("debts"); X.closeSheet();
    const bal = debtBalance(d);
    X.toast(bal <= 0.009 ? `${d.name} has paid you back in full` : `${d.name} still owes ${money(Math.round(bal))}`);
  }
  function debtMove(id, kind) {
    const d = S.debts.items.find((x) => x.id === id), amt = num($("#dbAmt").value);
    if (!d || !(amt > 0)) { $("#dbAmt").focus(); return; }
    d.log = [...(d.log || []), { id: newId(), date: today(), amt, kind }];
    save("debts"); X.closeSheet(true); X.render(); debtSheet(d);
    const bal = debtBalance(d);
    X.toast(bal <= 0.009 ? `${d.name} is fully paid off` : `${money(Math.round(bal))} left`);
  }
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
    if (TL.onInput(e)) return true;
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
    if (TL.onChange(e)) return true;
    if (TD.onChange(e)) return true;
    const id = e.target.id, v = e.target.value;
    if (e.target.classList && e.target.classList.contains("lim-in")) {
      const c = e.target.dataset.cat, val = num(v);
      S.money.limits = { ...limits() };
      if (val > 0) S.money.limits[c] = val; else delete S.money.limits[c];
      save("money"); setTimeout(() => { X.softRender(); checkLimits(); }, 0); return true;
    }
    if (e.target.classList && e.target.classList.contains("person-cat")) {
      const k = e.target.dataset.key, cat = v;
      const es = S.money.entries.filter((x) => x.type !== "in" && /^To\s/i.test(x.note || "") && X.ruleKey(X.payeeOf(x)) === k);
      es.forEach((x) => { x.cat = cat; });
      S.money.rules = { ...(S.money.rules || {}), [k]: cat };
      let note = `${plural(es.length, "payment")} updated`;
      if (cat === "Lending" && es.length && !openDebts("owed").some((d) => X.ruleKey(d.name) === k)) {
        S.debts.items.push({ id: newId(), name: X.payeeOf(es[0]), dir: "owed", amount: es.reduce((a, x) => a + x.amt, 0), date: es[0].date, due: "", note: "From transfers sorted as lent. Adjust if some was repaid.", log: [] });
        save("debts"); note += ". Added to Debts as money owed to you; adjust it there if some was repaid";
      }
      save("money"); X.render(); X.toast(note); return true;
    }
    if (id === "exMonths" || id === "exHide") { if (id === "exMonths") exMonths = +v; else exHide = e.target.checked; const ta = $("#exText"); if (ta) ta.value = buildSummary(); return true; }
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
    if (TD.onEnter(e)) return true;
    if (PL.onEnter(e)) return true;
    const id = e.target.id;
    const map = { qaDay: "qaDay", projIn: "projAdd", qaProj: "qaProj", mtActIn: "mtAddAction", goalIn: "goalAdd", listIn: "listAdd", listNewName: "listCreate", psLogIn: "personLog" };
    if (map[id]) { e.preventDefault(); actions[map[id]]({ dataset: {}, disabled: false }); return true; }
    return false;
  }

  /* ================= lifecycle ================= */
  function after(v) {
    TL.after(v);
    TD.after(v);
    if (v === "money" && moneyTab === "overview" && X.moneyMonth) wireChart(X.moneyMonth());
    if ((v === "today" || v === "plan") && calLinked() && Date.now() - CAL.at > 15 * 60e3) refreshCal(false);
    if ((v === "settings" || v === "tools") && keyCount === null) loadKeyCount();
  }
  function start() {
    autoSalary();
    mergeInbox();
    try { X.cloud.inbox.watch(() => mergeInbox()); } catch {}
    if (calLinked()) refreshCal(false);
  }
  function onVisible() { autoSalary(); mergeInbox(); if (calLinked()) refreshCal(false); }
  function stop() { Object.values(timers).forEach(clearTimeout); TL.stop(); TD.stop(); }
  function onTaskChanged() { refreshProjectTasks(); }

  return {
    views: { people: peopleView, more: moreView, lists: listsView, review: reviewView, import: IM.view, ...TL.views },
    toolTitles: TL.titles,
    planSeg, planTab: () => planTab, setPlanTab: (t) => (planTab = t),
    planBody: () => (planTab === "calendar" ? calendarTab() : planTab === "projects" ? projectsTab() : planTab === "week" ? PL.weekView() : meetingsTab()),
    taskExtras: (it) => PL.taskExtras(it), readTaskExtras: (prev) => PL.readExtras(prev), taskMeta: (it) => PL.taskMeta(it), waitingList: () => PL.waitingList(), loadBar: (d) => PL.loadBar(d),
    moneySeg, moneyTab: () => moneyTab, setMoneyTab: (t) => (moneyTab = t),
    moneyBody: () => (moneyTab === "bills" ? billsTab() : moneyTab === "debts" ? debtsTab() : moneyTab === "limits" ? limitsTab() : moneyTab === "insights" ? insightsTab() : savingsTab()),
    whereItWent, checkLimits, safeToSpend,
    moneyCharts: (m) => (m === curMonth() ? paydayCard() + safeCard() : "") + financeHealthCard(m) + spendChart(m) + `<a class="card review-cta" href="#" data-act="openExport"><div><b>Talk it through with Claude</b><span class="small muted">Export a summary of your finances to discuss and get advice.</span></div>${ICON.right}</a>`,
    todayTop, todaySchedule, todayCards, healthCard, settingsCards, notifyExtras, readNotifyExtras,
    todayView: (sections) => TD.view(sections),
    projectName, actions: { ...actions, ...IM.actions, ...TL.actions, ...TD.actions, ...PL.actions }, onInput, entryExtras, readSplits, onChange, onEnter, after, start, stop, onVisible, onTaskChanged,
    projectOptions: (cur) => opt("", "None", cur || "") + S.projects.items.filter((p) => !p.archived || p.id === cur).map((p) => opt(p.id, p.name, cur || "")).join(""),
    repeatOptions: (cur) => REPEATS.map(([v, l]) => opt(v, l, cur || "")).join(""),
  };
}
