// Habits: schedules (every day, chosen days, or N times a week), counted habits with a target,
// time-of-day groups, reminders, streaks that respect the schedule, a 12-week heatmap and pausing.

export function createHabits(X, H) {
  const { S, save, esc, pad, today, parseYmd, addDays, newId, DOW, MON, fmtDate } = X;
  const $ = (s) => document.querySelector(s);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const WHEN = [["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"], ["any", "Any time"]];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const wd = (d) => parseYmd(d).getDay();
  const weekStart = (d) => addDays(d, -((wd(d) + 6) % 7)); // Monday

  const all = () => S.habits.items;
  const active = () => all().filter((h) => !h.paused);
  const isDone = (id, d) => (S.habits.log[d] || []).includes(id);
  const count = (id, d) => ((S.habits.counts || {})[d] || {})[id] || 0;
  const scheduledOn = (h, d) => (h.days && h.days.length ? h.days.includes(wd(d)) : true);
  const weekDone = (h, d) => { const s = weekStart(d); let n = 0; for (let i = 0; i < 7; i++) if (isDone(h.id, addDays(s, i))) n++; return n; };
  /** Whether the habit is expected today: on a scheduled day, or for "N a week" until the week's target is met. */
  function dueOn(h, d) {
    if (h.paused || (h.created && d < h.created.slice(0, 10))) return false;
    if (h.perWeek) return isDone(h.id, d) || weekDone(h, d) < h.perWeek;
    return scheduledOn(h, d);
  }
  const dueHabits = (d = today()) => active().filter((h) => dueOn(h, d));

  function setDone(id, d, on) {
    const a = (S.habits.log[d] || []).filter((x) => x !== id);
    if (on) a.push(id);
    if (a.length) S.habits.log[d] = a; else delete S.habits.log[d];
  }
  /** Tap on a habit: toggles it, or adds one to a counted habit. */
  function tap(id, d = today(), delta = 1) {
    const h = all().find((x) => x.id === id); if (!h) return;
    if (h.target > 1) {
      S.habits.counts = S.habits.counts || {};
      const c = { ...(S.habits.counts[d] || {}) };
      let n = (c[id] || 0) + delta;
      if (delta > 0 && (c[id] || 0) >= h.target) n = 0; // tapping a finished counter resets it
      n = Math.max(0, n);
      if (n) c[id] = n; else delete c[id];
      if (Object.keys(c).length) S.habits.counts[d] = c; else delete S.habits.counts[d];
      setDone(id, d, n >= h.target);
    } else setDone(id, d, !isDone(id, d));
    save("habits");
  }

  /* ---------- streaks and stats ---------- */
  function streaks(h) {
    const t = today();
    if (h.perWeek) {
      // Weeks in a row that hit the target (this week counts once it's met).
      let cur = 0, best = 0, run = 0, w = weekStart(t);
      const first = h.created ? weekStart(h.created.slice(0, 10)) : addDays(w, -7 * 52);
      const thisMet = weekDone(h, t) >= h.perWeek;
      for (let k = 0; w >= first && k < 104; k++, w = addDays(w, -7)) {
        const met = weekDone(h, w) >= h.perWeek;
        if (k === 0 && !met) continue;
        if (met) { run++; best = Math.max(best, run); } else { if (!cur) cur = run; run = 0; }
      }
      if (!cur) cur = run;
      return { cur, best: Math.max(best, cur), unit: "week", thisMet };
    }
    let d = t, cur = 0, counting = true, run = 0, best = 0;
    if (!isDone(h.id, d) && scheduledOn(h, d)) d = addDays(d, -1); // today isn't over yet
    for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
      if (h.created && d < h.created.slice(0, 10)) break;
      if (!scheduledOn(h, d)) continue;
      if (isDone(h.id, d)) { run++; best = Math.max(best, run); if (counting) cur = run; }
      else { counting = false; run = 0; }
    }
    return { cur, best, unit: "day" };
  }
  function rate(h, days = 30) {
    let due = 0, done = 0;
    for (let i = 0; i < days; i++) {
      const d = addDays(today(), -i);
      if (h.created && d < h.created.slice(0, 10)) break;
      if (h.paused) continue;
      if (h.perWeek ? true : scheduledOn(h, d)) { if (!h.perWeek) due++; if (isDone(h.id, d)) done++; }
    }
    if (h.perWeek) { const weeks = Math.max(1, Math.round(days / 7)); return Math.min(1, done / (h.perWeek * weeks)); }
    return due ? done / due : 0;
  }
  const scheduleText = (h) => (h.perWeek ? `${h.perWeek}× a week` : h.days && h.days.length && h.days.length < 7 ? (h.days.join() === "1,2,3,4,5" ? "Weekdays" : h.days.join() === "0,6" ? "Weekends" : h.days.map((x) => DAYS[x]).join(", ")) : "Every day");

  /* ---------- heatmap (12 weeks) ---------- */
  function heatmap(filter) {
    const t = today(), end = addDays(weekStart(t), 6), start = addDays(weekStart(t), -7 * 11);
    const cols = [];
    for (let w = 0; w < 12; w++) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, w * 7 + i);
        if (d > t) { cells.push(`<i class="hm-c future"></i>`); continue; }
        const hs = filter ? [filter] : active();
        const due = hs.filter((h) => (h.perWeek ? isDone(h.id, d) || !h.paused : dueOn(h, d)));
        const done = hs.filter((h) => isDone(h.id, d)).length;
        const r = filter ? (isDone(filter.id, d) ? 1 : scheduledOn(filter, d) && !filter.perWeek ? 0 : -1) : due.length ? done / due.length : -1;
        cells.push(`<i class="hm-c" style="--v:${r < 0 ? 0 : r.toFixed(2)}"${r < 0 ? ' data-off="1"' : ""} title="${fmtDate(d)}: ${r < 0 ? "not scheduled" : Math.round(r * 100) + "%"}"></i>`);
      }
      cols.push(`<div class="hm-col">${cells.join("")}</div>`);
    }
    const months = []; let lastM = -1;
    for (let w = 0; w < 12; w++) { const m = parseYmd(addDays(start, w * 7)).getMonth(); months.push(m !== lastM ? MON[m] : ""); lastM = m; }
    return `<div class="hm"><div class="hm-days">${["M", "", "W", "", "F", "", "S"].map((x) => `<span>${x}</span>`).join("")}</div><div><div class="hm-grid">${cols.join("")}</div><div class="hm-months">${months.map((m) => `<span>${m}</span>`).join("")}</div></div></div><div class="hm-key"><span>Less</span>${[0, 0.34, 0.67, 1].map((v) => `<i class="hm-c" style="--v:${v}"></i>`).join("")}<span>More</span></div>`;
  }

  /* ---------- screen ---------- */
  function row(h, d) {
    const done = isDone(h.id, d), st = streaks(h);
    const counter = h.target > 1;
    const c = count(h.id, d);
    return `<div class="hb-row${done ? " done" : ""}">
      ${counter ? `<div class="hb-count"><button class="icon-btn" data-act="hbMinus" data-id="${h.id}" aria-label="One less">−</button><b class="num">${c}<span class="muted">/${h.target}</span></b><button class="icon-btn" data-act="hbPlus" data-id="${h.id}" aria-label="One more">+</button></div>` : `<button class="check${done ? " on" : ""}" data-act="hbTap" data-id="${h.id}" aria-label="${done ? "Mark not done" : "Mark done"}">${X.ICON.check}</button>`}
      <button class="body" data-act="hbOpen" data-id="${h.id}"><div class="t">${esc(h.name)}${counter && h.unit ? ` <span class="muted small">${esc(h.unit)}</span>` : ""}</div><div class="m"><span class="${st.cur >= 3 ? "streak hot" : "streak"}">${st.cur ? `${st.cur}-${st.unit} streak` : "No streak yet"}</span><span>${esc(scheduleText(h))}${h.perWeek ? ` · ${weekDone(h, d)}/${h.perWeek} this week` : ""}</span>${h.remind ? `<span>Reminder ${X.fmtTime(h.remind)}</span>` : ""}</div></button></div>`;
  }
  function view() {
    const t = today(), due = dueHabits(t), doneN = due.filter((h) => isDone(h.id, t)).length;
    const notDue = active().filter((h) => !dueOn(h, t));
    const paused = all().filter((h) => h.paused);
    let html = `<section class="card"><div class="sec-h"><h2>Today</h2><button class="btn small-btn primary" data-act="hbNew">New habit</button></div>`;
    if (!all().length) html += `<div class="empty"><b>No habits yet.</b>Start with one small routine you want to keep, like reading 10 pages or drinking 8 glasses of water.</div>`;
    else {
      html += `<div class="hb-progress"><div class="meter" style="height:8px"><i style="width:${due.length ? (doneN / due.length) * 100 : 0}%;background:var(--good)"></i></div><span class="small muted">${doneN} of ${due.length} done${due.length && doneN === due.length ? " · all done today" : ""}</span></div>`;
      for (const [k, label] of WHEN) {
        const g = due.filter((h) => (h.when || "any") === k);
        if (g.length) html += `<div class="group-h">${label}</div>${g.map((h) => row(h, t)).join("")}`;
      }
      if (notDue.length) html += `<details class="hb-off"><summary class="small">Not due today · ${notDue.length}</summary>${notDue.map((h) => row(h, t)).join("")}</details>`;
    }
    html += `</section>`;
    if (active().length) {
      // Last 7 days grid
      const days = []; for (let i = 6; i >= 0; i--) days.push(addDays(t, -i));
      html += `<section class="card"><div class="sec-h"><h2>Last 7 days</h2><span class="small muted">Tap a square to log</span></div><div class="hgrid"><span></span>${days.map((d) => `<span class="dh${d === t ? " today" : ""}">${DOW[wd(d)].slice(0, 2)}<br>${parseYmd(d).getDate()}</span>`).join("")}`;
      active().forEach((h) => {
        html += `<button class="hname" data-act="hbOpen" data-id="${h.id}"><span class="t">${esc(h.name)}</span><span class="s">${esc(scheduleText(h))}</span></button>`;
        html += days.map((d) => (!h.perWeek && !scheduledOn(h, d)) || (h.created && d < h.created.slice(0, 10)) ? `<span class="dot off" aria-hidden="true"></span>` : `<button class="dot${isDone(h.id, d) ? " on" : ""}${d === t ? " today" : ""}" data-act="hbDay" data-id="${h.id}" data-d="${d}" aria-label="${esc(h.name)} on ${fmtDate(d)}"></button>`).join("");
      });
      html += `</div></section>`;
      html += `<section class="card"><div class="sec-h"><h2>12 weeks</h2><span class="small muted">All habits</span></div>${heatmap(null)}</section>`;
      html += `<section class="card"><div class="sec-h"><h2>30-day consistency</h2></div>${active().map((h) => { const r = rate(h), st = streaks(h); return `<div class="cat-row" style="grid-template-columns:minmax(0,1fr) 90px auto"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.name)}<span class="small muted"> · best ${st.best}${st.unit === "week" ? "w" : "d"}</span></span><div class="cat-bar"><i style="width:${r * 100}%;background:var(--good)"></i></div><span class="num small">${Math.round(r * 100)}%</span></div>`; }).join("")}</section>`;
    }
    if (paused.length) html += section("Paused", `<div class="list">${paused.map((h) => `<div class="item"><button class="body" data-act="hbOpen" data-id="${h.id}"><div class="t">${esc(h.name)}</div><div class="m"><span>Paused · history kept</span></div></button><button class="btn small-btn" data-act="hbResume" data-id="${h.id}">Resume</button></div>`).join("")}</div>`);
    return html + H.healthCard();
  }
  const section = (title, body) => `<section class="card"><div class="sec-h"><h2>${title}</h2></div>${body}</section>`;

  /* ---------- add / edit ---------- */
  let draftDays = null;
  function sheet(h) {
    const isNew = !h;
    h = h || { name: "", when: "any", days: [], perWeek: 0, target: 1, unit: "", remind: "" };
    const mode = h.perWeek ? "week" : h.days && h.days.length && h.days.length < 7 ? "days" : "daily";
    draftDays = h.days && h.days.length ? [...h.days] : [1, 2, 3, 4, 5];
    const st = isNew ? null : streaks(h);
    X.openSheet(`<h2>${isNew ? "New habit" : esc(h.name)}</h2>
      ${st ? `<div class="stats" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="stat"><b>${st.cur}</b><span>current ${st.unit} streak</span></div><div class="stat"><b>${st.best}</b><span>best ${st.unit} streak</span></div><div class="stat"><b>${Math.round(rate(h) * 100)}%</b><span>last 30 days</span></div></div>${heatmap(h)}` : ""}
      <input class="field" id="hbName" placeholder="e.g. Read 20 pages" value="${esc(h.name)}" autocomplete="off">
      <div class="grid2"><label class="lbl">When<select class="field" id="hbWhen">${WHEN.map(([v, l]) => `<option value="${v}"${(h.when || "any") === v ? " selected" : ""}>${l}</option>`).join("")}</select></label><label class="lbl">Remind me at<input class="field" type="time" id="hbRemind" value="${esc(h.remind || "")}"></label></div>
      <label class="lbl">How often<select class="field" id="hbMode"><option value="daily"${mode === "daily" ? " selected" : ""}>Every day</option><option value="days"${mode === "days" ? " selected" : ""}>On certain days</option><option value="week"${mode === "week" ? " selected" : ""}>A number of times a week</option></select></label>
      <div id="hbDaysBox"${mode === "days" ? "" : " hidden"}><div class="day-pick">${[1, 2, 3, 4, 5, 6, 0].map((x) => `<button type="button" class="chip${draftDays.includes(x) ? " acc" : ""}" data-act="hbDayPick" data-v="${x}">${DAYS[x]}</button>`).join("")}</div></div>
      <label class="lbl" id="hbWeekBox"${mode === "week" ? "" : " hidden"}>Times a week<select class="field" id="hbPerWeek">${[1, 2, 3, 4, 5, 6].map((n) => `<option${(h.perWeek || 3) === n ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <div class="grid2"><label class="lbl">Daily target<select class="field" id="hbTarget">${[1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 30].map((n) => `<option value="${n}"${(h.target || 1) === n ? " selected" : ""}>${n === 1 ? "Just once" : n}</option>`).join("")}</select></label><label class="lbl">Unit (optional)<input class="field" id="hbUnit" value="${esc(h.unit || "")}" placeholder="glasses, pages, mins"></label></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="hbSave" data-id="${h.id || ""}">${isNew ? "Add habit" : "Save"}</button>${isNew ? "" : `<button class="btn" data-act="${h.paused ? "hbResume" : "hbPause"}" data-id="${h.id}">${h.paused ? "Resume" : "Pause"}</button><button class="btn danger" data-act="hbDel" data-id="${h.id}">Delete</button>`}</div>
      ${isNew ? "" : `<p class="small muted" style="margin:0">Pausing keeps the history and stops reminders and streak breaks.</p>`}`, (s) => { if (isNew) s.querySelector("#hbName").focus(); });
  }

  /* ---------- actions ---------- */
  const find = (id) => all().find((x) => x.id === id);
  const actions = {
    hbNew: () => sheet(null),
    hbOpen: (b) => { const h = find(b.dataset.id); if (h) sheet(h); },
    hbTap: (b) => { tap(b.dataset.id); X.render(); },
    hbPlus: (b) => { tap(b.dataset.id, today(), 1); X.render(); },
    hbMinus: (b) => { tap(b.dataset.id, today(), -1); X.render(); },
    hbDay: (b) => { const h = find(b.dataset.id); if (!h) return; if (h.target > 1) { const on = !isDone(h.id, b.dataset.d); setDone(h.id, b.dataset.d, on); S.habits.counts = S.habits.counts || {}; const c = { ...(S.habits.counts[b.dataset.d] || {}) }; if (on) c[h.id] = h.target; else delete c[h.id]; S.habits.counts[b.dataset.d] = c; save("habits"); } else tap(h.id, b.dataset.d); X.render(); },
    hbDayPick: (b) => { const v = +b.dataset.v; draftDays = draftDays.includes(v) ? draftDays.filter((x) => x !== v) : [...draftDays, v].sort(); b.classList.toggle("acc"); },
    hbSave: (b) => {
      const name = $("#hbName").value.trim(); if (!name) { $("#hbName").focus(); return; }
      const mode = $("#hbMode").value;
      if (mode === "days" && !draftDays.length) { X.toast("Pick at least one day."); return; }
      const v = { name, when: $("#hbWhen").value, remind: $("#hbRemind").value, target: +$("#hbTarget").value, unit: $("#hbUnit").value.trim(), days: mode === "days" ? draftDays : [], perWeek: mode === "week" ? +$("#hbPerWeek").value : 0 };
      if (b.dataset.id) Object.assign(find(b.dataset.id), v); else S.habits.items.push({ id: newId(), created: today(), paused: false, ...v });
      save("habits"); X.closeSheet(); X.toast(v.remind ? `Saved. Reminder at ${X.fmtTime(v.remind)} on days it’s due.` : "Saved");
    },
    hbPause: (b) => { const h = find(b.dataset.id); if (h) { h.paused = true; save("habits"); X.closeSheet(); X.toast("Paused. Its history is kept."); } },
    hbResume: (b) => { const h = find(b.dataset.id); if (h) { h.paused = false; save("habits"); X.closeSheet(true); X.render(); } },
    hbDel: (b) => X.armDelete(b, () => { const id = b.dataset.id; S.habits.items = all().filter((x) => x.id !== id); Object.keys(S.habits.log).forEach((d) => { S.habits.log[d] = S.habits.log[d].filter((x) => x !== id); if (!S.habits.log[d].length) delete S.habits.log[d]; }); save("habits"); X.closeSheet(); }),
  };
  function onChange(e) {
    if (e.target.id === "hbMode") { const m = e.target.value; $("#hbDaysBox").hidden = m !== "days"; $("#hbWeekBox").hidden = m !== "week"; return true; }
    return false;
  }
  function onEnter(e) {
    if (e.target.id === "hbName") { e.preventDefault(); $("[data-act=hbSave]").click(); return true; }
    return false;
  }
  return { view, tap, dueHabits, isDue: dueOn, actions, onChange, onEnter, scheduleText };
}
