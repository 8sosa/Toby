// Planning helpers for tasks: subtasks, time estimates, quick reschedule, "waiting on",
// a week planner with daily load, and filling free time from Today's timeline.

export function createPlanner(X, H) {
  const { S, save, esc, pad, ymd, today, parseYmd, addDays, newId, DOW, MON, fmtDate, relDay, fmtTime } = X;
  const $ = (s) => document.querySelector(s);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const dur = (m) => (m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m");
  const toMin = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60);
  const EST = [[0, "No estimate"], [15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"], [90, "1½ hours"], [120, "2 hours"], [180, "3 hours"], [240, "4 hours"]];
  const workday = () => Object.assign({ start: "08:00", end: "18:00" }, S.settings.workday || {});

  /* ---------- task sheet extras ---------- */
  let subDraft = [], editingId = null;
  function taskExtras(it) {
    editingId = it.id || null;
    subDraft = (it.sub || []).map((x) => ({ ...x }));
    const t = today(), sat = (() => { let d = t; while (parseYmd(d).getDay() !== 6) d = addDays(d, 1); return d; })(), mon = (() => { let d = addDays(t, 1); while (parseYmd(d).getDay() !== 1) d = addDays(d, 1); return d; })();
    const chips = [["Today", t], ["Tomorrow", addDays(t, 1)], ["Weekend", sat], ["Next week", mon], ["No date", ""]];
    const people = S.people.items.filter((p) => p.name).map((p) => `<option value="${esc(p.name)}">`).join("");
    return `<div class="date-chips">${chips.map(([l, d]) => `<button type="button" class="chip${(it.date || "") === d ? " acc" : ""}" data-act="tDateChip" data-d="${d}">${l}</button>`).join("")}</div>
      <div class="grid2"><label class="lbl">Time needed<select class="field" id="tEst">${EST.map(([v, l]) => `<option value="${v}"${(it.est || 0) === v ? " selected" : ""}>${l}</option>`).join("")}</select></label><label class="lbl">Waiting on<input class="field" id="tWait" list="tPeople" value="${esc((it.waiting && it.waiting.who) || "")}" placeholder="Someone else’s turn?" autocomplete="off"><datalist id="tPeople">${people}</datalist></label></div>
      <div><h3 style="margin:2px 0 6px">Checklist</h3><div class="list" id="tSubs">${subsHtml()}</div><div class="row" style="margin-top:6px"><input class="field" id="tSubIn" placeholder="Add a step" autocomplete="off" enterkeyhint="done"><button type="button" class="btn" data-act="tSubAdd">Add</button></div></div>`;
  }
  const subsHtml = () => subDraft.map((x) => `<div class="item sub-row" style="align-items:center"><button type="button" class="check small${x.done ? " on" : ""}" data-act="tSubToggle" data-id="${x.id}" aria-label="${x.done ? "Mark not done" : "Mark done"}">${X.ICON.check}</button><div class="body"><div class="t${x.done ? " muted" : ""}"${x.done ? ' style="text-decoration:line-through"' : ""}>${esc(x.text)}</div></div><button type="button" class="icon-btn" data-act="tSubDel" data-id="${x.id}" aria-label="Remove step">×</button></div>`).join("");
  function syncSubs() {
    const el = $("#tSubs"); if (el) el.innerHTML = subsHtml();
    if (editingId) { const t = S.tasks.items.find((x) => x.id === editingId); if (t) { t.sub = subDraft.map((x) => ({ ...x })); save("tasks"); } }
  }
  function readExtras(prev) {
    const est = +(($("#tEst") || {}).value || 0);
    const who = (($("#tWait") || {}).value || "").trim();
    const waiting = who ? { who, since: prev && prev.waiting && prev.waiting.who === who ? prev.waiting.since : today() } : null;
    return { est, sub: subDraft.map((x) => ({ ...x })), waiting };
  }
  function taskMeta(it) {
    const m = [];
    if (it.sub && it.sub.length) m.push(`<span class="chip">☑ ${it.sub.filter((x) => x.done).length}/${it.sub.length}</span>`);
    if (it.est) m.push(`<span class="chip">${dur(it.est)}</span>`);
    if (it.waiting && it.waiting.who && !it.done) m.push(`<span class="chip hi">Waiting on ${esc(it.waiting.who)}</span>`);
    return m;
  }

  /* ---------- load: planned vs free ---------- */
  function dayLoad(d) {
    const tasks = S.tasks.items.filter((x) => !x.done && x.date === d && !(x.waiting && x.waiting.who));
    const planned = tasks.reduce((a, x) => a + (x.est || 0), 0);
    const unestimated = tasks.filter((x) => !x.est).length;
    const wd = workday(), ws = toMin(wd.start), we = toMin(wd.end);
    const isToday = d === today();
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const from = isToday ? Math.max(ws, nowM) : ws;
    let busy = 0;
    H.scheduleItems(d).filter((x) => x.kind !== "task").forEach((x) => { const a = Math.max(x.start, from), b = Math.min(x.end, we); if (b > a) busy += b - a; });
    const free = Math.max(0, we - from - busy);
    const weekend = [0, 6].includes(parseYmd(d).getDay());
    return { planned, free: weekend ? 0 : free, unestimated, count: tasks.length, over: !weekend && planned > free, weekend, end: wd.end };
  }
  function loadBar(d) {
    const l = dayLoad(d);
    if (!l.count && (l.weekend || !l.free)) return l.weekend ? '<p class="small muted" style="margin:-2px 0 8px">Weekend</p>' : "";
    if (l.weekend) return `<p class="small muted" style="margin:-2px 0 8px">Weekend${l.planned ? " · " + dur(l.planned) + " planned" : ""}</p>`;
    const pct = l.free ? Math.min(100, (l.planned / l.free) * 100) : 100;
    return `<div class="load"><div class="load-bar"><i class="${l.over ? "over" : ""}" style="width:${pct}%"></i></div><span class="small ${l.over ? "" : "muted"}"${l.over ? ' style="color:var(--bad)"' : ""}>${l.planned ? dur(l.planned) + " planned" : "Nothing estimated"} · ${dur(l.free)} free until ${fmtTime(l.end)}${l.unestimated ? ` · ${plural(l.unestimated, "task")} without an estimate` : ""}${l.over ? " · overbooked" : ""}</span></div>`;
  }

  /* ---------- week planner ---------- */
  let weekStart = null;
  function weekView() {
    const t = today();
    if (!weekStart) weekStart = t;
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const undated = S.tasks.items.filter((x) => !x.done && !x.date && !(x.waiting && x.waiting.who)).sort((a, b) => (a.pri === "high" ? -1 : 0) - (b.pri === "high" ? -1 : 0));
    let h = `<div class="sec-h" style="margin:0"><div class="mnav"><button class="icon-btn" data-act="wkPrev" aria-label="Previous week">${X.ICON.left}</button><button class="icon-btn" data-act="wkNext" aria-label="Next week">${X.ICON.right}</button>${weekStart !== t ? '<button class="link" data-act="wkToday" style="margin-left:6px">This week</button>' : ""}</div><h2>${esc(fmtDate(days[0]))} – ${esc(fmtDate(days[6]))}</h2></div>`;
    if (undated.length) {
      h += `<section class="card"><div class="sec-h"><h2>Not scheduled</h2><span class="small muted">${undated.length}</span></div><p class="small muted" style="margin:0 0 6px">Give each a day; tap the day under it.</p><div class="list">${undated.slice(0, 8).map((x) => `<div class="item tray"><div class="body"><button class="body" data-act="editTask" data-id="${x.id}" style="padding:0"><div class="t">${esc(x.title)}</div></button><div class="day-pick">${days.map((d) => `<button class="chip" data-act="wkAssign" data-id="${x.id}" data-d="${d}">${d === t ? "Today" : DOW[parseYmd(d).getDay()]}</button>`).join("")}</div></div></div>`).join("")}</div>${undated.length > 8 ? `<p class="small muted" style="margin:6px 0 0">${undated.length - 8} more in Anytime</p>` : ""}</section>`;
    }
    for (const d of days) {
      const tasks = S.tasks.items.filter((x) => x.date === d).sort((a, b) => a.done - b.done || X.byTime(a, b));
      const sched = H.scheduleItems(d).filter((x) => x.kind !== "task");
      const allDay = H.eventsOn(d).filter((e) => e.allDay);
      h += `<section class="card week-day${d === t ? " is-today" : ""}"><div class="sec-h"><h2>${d === t ? "Today" : d === addDays(t, 1) ? "Tomorrow" : DOW[parseYmd(d).getDay()]} <span class="muted small">${parseYmd(d).getDate()} ${MON[parseYmd(d).getMonth()]}</span></h2><button class="link" data-act="wkAdd" data-d="${d}">+ Task</button></div>
        ${loadBar(d)}
        ${allDay.length || sched.length ? `<div class="wk-sched">${allDay.map((e) => `<span class="chip acc">${esc(e.title)}</span>`).join("")}${sched.map((x) => `<span class="chip">${fmtTime(fromMin(x.start))} ${esc(x.title)}</span>`).join("")}</div>` : ""}
        <div class="list">${tasks.map((x) => X.taskRow(x, false)).join("") || '<p class="small muted" style="margin:6px 0 0">No tasks.</p>'}</div></section>`;
    }
    return h;
  }

  /* ---------- waiting on ---------- */
  function waitingList() {
    const ws = S.tasks.items.filter((x) => !x.done && x.waiting && x.waiting.who).sort((a, b) => (a.waiting.since || "").localeCompare(b.waiting.since || ""));
    if (!ws.length) return '<div class="empty"><b>Nothing waiting on others.</b>When a task is in someone else’s hands, set “Waiting on” in the task so it shows up here.</div>';
    const byWho = {};
    ws.forEach((x) => (byWho[x.waiting.who] = byWho[x.waiting.who] || []).push(x));
    return Object.entries(byWho).map(([who, list]) => `<div class="group-h">${esc(who)}</div>${list.map((x) => {
      const days = Math.round((parseYmd(today()) - parseYmd(x.waiting.since || today())) / 864e5);
      return `<div class="item" style="align-items:center"><button class="check" data-act="toggleTask" data-id="${x.id}" aria-label="Mark done">${X.ICON.check}</button><button class="body" data-act="editTask" data-id="${x.id}"><div class="t">${esc(x.title)}</div><div class="m"><span${days >= 7 ? ' style="color:var(--bad)"' : ""}>Waiting ${days ? plural(days, "day") : "since today"}</span>${x.date ? `<span>Follow up ${esc(relDay(x.date).toLowerCase())}</span>` : ""}</div></button><button class="btn small-btn" data-act="waitNudge" data-id="${x.id}">Nudge</button></div>`;
    }).join("")}`).join("");
  }
  function nudge(x) {
    const p = S.people.items.find((k) => k.name && k.name.toLowerCase() === x.waiting.who.toLowerCase());
    const text = `Hi ${x.waiting.who.split(" ")[0]}, just checking in on “${x.title}”. Any update?`;
    const digits = p && p.phone ? p.phone.replace(/[^\d]/g, "").replace(/^0/, "234") : "";
    X.openSheet(`<h2>Nudge ${esc(x.waiting.who)}</h2><textarea class="field" id="nudgeText" style="min-height:90px">${esc(text)}</textarea>
      <div class="btns">${digits ? `<a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/${digits}?text=${encodeURIComponent(text)}" id="nudgeWa">WhatsApp</a>` : ""}<button class="btn${digits ? "" : " primary"}" data-act="nudgeCopy">Copy message</button><button class="btn" data-act="nudgeLater" data-id="${x.id}">Remind me in 3 days</button></div>
      ${digits ? "" : `<p class="small muted" style="margin:0">Add ${esc(x.waiting.who)}’s phone number in People to message them on WhatsApp from here.</p>`}`);
  }

  /* ---------- fill a free gap ---------- */
  function fillSheet(start, end) {
    const t = today();
    const cands = S.tasks.items.filter((x) => !x.done && !x.time && (!x.date || x.date <= t) && !(x.waiting && x.waiting.who)).sort((a, b) => (a.pri === "high" ? -1 : 0) - (b.pri === "high" ? -1 : 0) || (a.date || "9").localeCompare(b.date || "9"));
    const gap = end - start;
    X.openSheet(`<h2>Plan ${fmtTime(fromMin(start))}–${fmtTime(fromMin(end))}</h2><p class="small muted" style="margin:0">${dur(gap)} free. Pick a task to block this time for it.</p>
      <div class="list b3-pick">${cands.length ? cands.slice(0, 30).map((x) => `<div class="item"><button class="body" data-act="fillPick" data-id="${x.id}" data-s="${start}"><div class="t">${esc(x.title)}</div><div class="m">${x.est ? `<span${x.est > gap ? ' style="color:var(--bad)"' : ""}>${dur(x.est)}</span>` : "<span>No estimate</span>"}${x.pri === "high" ? '<span class="chip hi">Priority</span>' : ""}${x.date && x.date < t ? '<span style="color:var(--bad)">Overdue</span>' : ""}</div></button></div>`).join("") : '<div class="empty"><b>No open tasks to place.</b>Add one first.</div>'}</div>`);
  }

  /* ---------- actions ---------- */
  const T = (id) => S.tasks.items.find((x) => x.id === id);
  const actions = {
    tDateChip: (b) => { const el = $("#tDate"); if (el) el.value = b.dataset.d; document.querySelectorAll(".date-chips .chip").forEach((c) => c.classList.toggle("acc", c === b)); },
    tSubAdd: () => { const el = $("#tSubIn"), v = el.value.trim(); if (!v) { el.focus(); return; } subDraft.push({ id: newId(), text: v, done: false }); el.value = ""; syncSubs(); el.focus(); },
    tSubToggle: (b) => { const x = subDraft.find((k) => k.id === b.dataset.id); if (x) { x.done = !x.done; syncSubs(); } },
    tSubDel: (b) => { subDraft = subDraft.filter((k) => k.id !== b.dataset.id); syncSubs(); },
    wkPrev: () => { weekStart = addDays(weekStart || today(), -7); X.render(); },
    wkNext: () => { weekStart = addDays(weekStart || today(), 7); X.render(); },
    wkToday: () => { weekStart = today(); X.render(); },
    wkAssign: (b) => { const x = T(b.dataset.id); if (x) { x.date = b.dataset.d; save("tasks"); X.render(); X.toast("Scheduled for " + relDay(b.dataset.d).toLowerCase()); } },
    wkAdd: (b) => { X.taskSheet(null); setTimeout(() => { const d = $("#tDate"); if (d) d.value = b.dataset.d; }, 30); },
    waitNudge: (b) => { const x = T(b.dataset.id); if (x) nudge(x); },
    nudgeCopy: () => { const el = $("#nudgeText"); (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject()).then(() => X.toast("Copied"), () => { el.select(); X.toast("Selected. Use Copy from the menu."); }); },
    nudgeLater: (b) => { const x = T(b.dataset.id); if (x) { x.date = addDays(today(), 3); save("tasks"); X.closeSheet(); X.toast("Follow-up set for " + relDay(x.date).toLowerCase()); } },
    tlFill: (b) => fillSheet(+b.dataset.s, +b.dataset.e),
    fillPick: (b) => { const x = T(b.dataset.id); if (!x) return; x.date = today(); x.time = fromMin(+b.dataset.s); save("tasks"); X.closeSheet(); X.toast(`${x.title} at ${fmtTime(x.time)}`); },
  };
  function onEnter(e) {
    if (e.target.id === "tSubIn") { e.preventDefault(); actions.tSubAdd(); return true; }
    return false;
  }
  return { taskExtras, readExtras, taskMeta, dayLoad, loadBar, weekView, waitingList, actions, onEnter };
}
