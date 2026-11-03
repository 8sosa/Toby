// The Today screen: a daily briefing that changes through the day, top 3 priorities,
// a timeline with free time, quick actions, an evening wrap-up, weather and a layout you choose.

export function createToday(X, H) {
  const { S, save, esc, pad, ymd, today, parseYmd, addDays, newId, DOW, MON, fmtDate, relDay, fmtTime, money } = X;
  const $ = (s) => document.querySelector(s);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const section = (title, body, right = "", cls = "") => `<section class="card ${cls}"><div class="sec-h"><h2>${title}</h2>${right}</div>${body}</section>`;
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const toMin = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const fromMin = (m) => pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60);
  const hour = () => new Date().getHours();
  const isEvening = () => hour() >= 18 || !!wrapForced;
  let wrapForced = false;

  /* ---------- layout ---------- */
  const CARDS = [
    ["brief", "Daily briefing", "Summary, weather and progress"],
    ["quick", "Quick actions", "Task, expense, focus, note, water"],
    ["big3", "Top 3 for today", "Your most important tasks"],
    ["timeline", "Timeline", "Meetings, events and free time"],
    ["agenda", "Tasks", "Due today and overdue"],
    ["coming", "Coming up", "Bills, renewals, birthdays, catch-ups"],
    ["stats", "Numbers", "Tasks, habits and safe to spend"],
    ["habits", "Habits", "Tick off today’s habits"],
    ["journal", "Journal", "Today’s prompt"],
  ];
  const layout = () => {
    const saved = S.settings.todayLayout || [];
    const ids = saved.map((x) => x.id).filter((id) => CARDS.some((c) => c[0] === id));
    CARDS.forEach(([id]) => { if (!ids.includes(id)) ids.push(id); });
    return ids.map((id) => ({ id, on: (saved.find((x) => x.id === id) || { on: true }).on !== false }));
  };

  /* ---------- weather (Open-Meteo, free, no key) ---------- */
  const WKEY = "toby:weather";
  let WX = null, wxLoading = false;
  try { WX = JSON.parse(localStorage.getItem(WKEY) || "null"); } catch {}
  const city = () => S.settings.city || null;
  const WI = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    cloud: '<path d="M7 18h10a4 4 0 00.5-8 6 6 0 00-11.4 1.6A3.3 3.3 0 007 18z"/>',
    rain: '<path d="M7 15h10a4 4 0 00.5-8 6 6 0 00-11.4 1.6A3.3 3.3 0 007 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
    storm: '<path d="M7 14h10a4 4 0 00.5-8 6 6 0 00-11.4 1.6A3.3 3.3 0 007 14z"/><path d="M12.5 15l-2 3.5h3l-2 3.5"/>',
    haze: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  };
  const WMO = (c) => (c === 0 ? ["Clear", WI.sun] : c <= 2 ? ["Partly cloudy", WI.cloud] : c === 3 ? ["Cloudy", WI.cloud] : c <= 48 ? ["Hazy", WI.haze] : c <= 67 ? ["Rain", WI.rain] : c <= 77 ? ["Dusty", WI.haze] : c <= 82 ? ["Showers", WI.rain] : ["Thunderstorms", WI.storm]);
  async function loadWeather(force) {
    const c = city(); if (!c || wxLoading) return;
    if (!force && WX && WX.key === c.lat + "," + c.lon && Date.now() - WX.at < 60 * 60e3) return;
    wxLoading = true;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code&hourly=temperature_2m,precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`;
      const r = await fetch(u); if (!r.ok) throw 0;
      const d = await r.json();
      WX = { key: c.lat + "," + c.lon, at: Date.now(), now: d.current, hourly: d.hourly, daily: d.daily };
      try { localStorage.setItem(WKEY, JSON.stringify(WX)); } catch {}
      if (X.route() === "today") X.softRender();
    } catch { /* offline: keep the last forecast */ } finally { wxLoading = false; }
  }
  function weatherLine() {
    if (!city()) return `<button class="link" data-act="wxCity">Add your city for weather</button>`;
    if (!WX || !WX.now) return `<span class="small muted">Loading weather for ${esc(city().name)}…</span>`;
    const [label, icon] = WMO(WX.now.weather_code);
    const t = today(), h = hour();
    let rain = null;
    (WX.hourly.time || []).forEach((ts, i) => {
      if (rain || !ts.startsWith(t)) return;
      const hh = +ts.slice(11, 13);
      if (hh >= h && hh <= 21 && WX.hourly.precipitation_probability[i] >= 60) rain = { hh, p: WX.hourly.precipitation_probability[i] };
    });
    const hi = WX.daily && WX.daily.temperature_2m_max ? Math.round(WX.daily.temperature_2m_max[0]) : null;
    return `<div class="wx"><svg class="wx-i" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span><b>${Math.round(WX.now.temperature_2m)}°</b> ${esc(label)} in ${esc(city().name)}${hi != null ? ` · high ${hi}°` : ""}</span></div>${rain ? `<p class="small wx-rain">Rain likely around ${fmtTime(pad(rain.hh) + ":00")} (${rain.p}%). Plan travel around it.</p>` : ""}`;
  }

  /* ---------- briefing ---------- */
  function progress() {
    const t = today();
    const tasks = S.tasks.items.filter((x) => x.date === t);
    const doneT = tasks.filter((x) => x.done).length;
    const hs = H.dueHabits(), doneH = hs.filter((x) => X.isDone(x.id, t)).length;
    const total = tasks.length + hs.length, done = doneT + doneH;
    return { total, done, frac: total ? done / total : 0, tasks: tasks.length, doneT, habits: hs.length, doneH };
  }
  function summary() {
    const t = today(), parts = [];
    const sched = scheduleItems(t);
    const meetings = sched.filter((x) => x.kind !== "task");
    const open = S.tasks.items.filter((x) => !x.done && x.date && x.date <= t);
    const hi = open.filter((x) => x.pri === "high").length;
    const upcoming = meetings.filter((x) => x.start >= toMin(nowHM()));
    // Before noon, describe the whole day; later, only what's still ahead.
    const shown = hour() < 12 ? meetings : upcoming;
    if (shown.length) parts.push(`${plural(shown.length, "meeting or event", "meetings and events")}${hour() >= 12 ? " still ahead" : ""}${upcoming[0] ? ` (next: ${esc(upcoming[0].title)} at ${fmtTime(fromMin(upcoming[0].start))})` : ""}`);
    if (open.length) parts.push(`${plural(open.length, "task")} to do${hi ? `, ${hi} marked priority` : ""}`);
    let s = parts.length ? "You have " + parts.join(" and ") + "." : hour() >= 18 ? "Nothing left on today’s schedule." : "Nothing scheduled. A good day to get ahead on something important.";
    const dueBills = H.activeBills().filter((b) => b.due <= addDays(t, 1));
    if (dueBills.length) s += ` ${dueBills.map((b) => esc(b.name)).join(", ")} ${dueBills.length === 1 ? "is" : "are"} due ${dueBills.every((b) => b.due === addDays(t, 1)) ? "tomorrow" : "now"}.`;
    const bdays = H.allDates().filter((d) => d.md === t.slice(5));
    if (bdays.length) s += ` Today: ${bdays.map((d) => esc(d.title)).join(", ")}.`;
    const st = H.safeToSpend();
    if (st && st.perDay >= 0) s += ` Safe to spend: ${money(Math.round(st.perDay / 100) * 100)} today.`;
    return s;
  }
  function briefCard() {
    const p = progress(), R = 26, C = 2 * Math.PI * R;
    const ring = `<svg viewBox="0 0 64 64" class="day-ring" role="img" aria-label="${p.done} of ${p.total} done today"><circle cx="32" cy="32" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="6"/><circle cx="32" cy="32" r="${R}" fill="none" stroke="var(--good)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(C * p.frac).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="36" text-anchor="middle" class="ring-t">${p.done}/${p.total}</text></svg>`;
    const h = hour(), title = h < 12 ? "Your day" : h < 18 ? "The rest of today" : "This evening";
    return `<section class="card brief"><div class="brief-top">${ring}<div style="min-width:0"><h2 style="margin:0 0 4px">${title}</h2><p style="margin:0;line-height:1.5">${summary()}</p></div></div>${weatherLine()}${h >= 15 && !isEvening() ? `<button class="link" data-act="wrapNow" style="margin-top:6px">Wrap up the day early</button>` : ""}</section>`;
  }

  /* ---------- quick actions ---------- */
  function quickCard() {
    const w = (S.health.log[today()] || {}).water || 0;
    const a = [["qkTask", "Task", '<path d="M12 5v14M5 12h14"/>'], ["qkSpend", "Expense", '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/>'], ["qkFocus", "Focus", '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/>'], ["qkNote", "Note", '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8"/>'], ["qkWater", `Water ${w}`, '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>']];
    return `<div class="quick">${a.map(([act, l, ic]) => `<button class="qk" data-act="${act}"><svg viewBox="0 0 24 24">${ic}</svg><span>${l}</span></button>`).join("")}</div>`;
  }
  function spendSheet() {
    X.openSheet(`<h2>Log an expense</h2><div class="grid2"><label class="lbl">Amount<input class="field num" id="qsAmt" inputmode="decimal" placeholder="0"></label><label class="lbl">Category<select class="field" id="qsCat">${X.OUT_CATS.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label></div><input class="field" id="qsNote" placeholder="What for? (optional)"><button class="btn primary" data-act="qsSave">Add expense</button>`, (s) => s.querySelector("#qsAmt").focus());
  }

  /* ---------- top 3 ---------- */
  const big3 = () => { const b = S.tasks.big3 || {}; return b.date === today() ? (b.ids || []).map((id) => S.tasks.items.find((x) => x.id === id)).filter(Boolean) : []; };
  function big3Card() {
    const list = big3();
    const body = list.length
      ? `<div class="list">${list.map((x, i) => `<div class="item b3${x.done ? " done" : ""}"><span class="b3-n">${i + 1}</span><button class="check${x.done ? " on" : ""}" data-act="toggleTask" data-id="${x.id}" aria-label="${x.done ? "Mark not done" : "Mark done"}">${X.ICON.check}</button><button class="body" data-act="editTask" data-id="${x.id}"><div class="t">${esc(x.title)}</div></button></div>`).join("")}</div>${list.every((x) => x.done) ? '<p class="small" style="margin:8px 0 0;color:var(--good)"><b>All three done.</b> Anything else today is a bonus.</p>' : ""}`
      : `<p class="small muted" style="margin:0 0 10px">If you only got three things done today, which would make the biggest difference?</p>`;
    return section("Top 3 for today", body, `<button class="link" data-act="b3Pick">${list.length ? "Change" : "Pick"}</button>`, "big3-card");
  }
  function pickSheet(forDate) {
    const t = forDate || today();
    const cur = (S.tasks.big3 && S.tasks.big3.date === t ? S.tasks.big3.ids : []) || [];
    const cands = S.tasks.items.filter((x) => !x.done && (!x.date || x.date <= t)).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.pri === "high" ? -1 : 0) - (b.pri === "high" ? -1 : 0));
    X.openSheet(`<h2>Top 3 for ${t === today() ? "today" : "tomorrow"}</h2><p class="small muted" style="margin:0">Pick up to three. Overdue and priority tasks are listed first.</p>
      <div class="list b3-pick">${cands.length ? cands.slice(0, 40).map((x) => `<label class="item" style="align-items:center;gap:10px"><input type="checkbox" class="b3-c" value="${x.id}"${cur.includes(x.id) ? " checked" : ""}><span class="body"><span class="t">${esc(x.title)}</span><span class="m">${x.date ? `<span${x.date < today() ? ' style="color:var(--bad)"' : ""}>${esc(relDay(x.date))}</span>` : "<span>Anytime</span>"}${x.pri === "high" ? '<span class="chip hi">Priority</span>' : ""}</span></span></label>`).join("") : '<div class="empty"><b>No open tasks.</b>Add one first.</div>'}</div>
      <div class="row"><input class="field" id="b3New" placeholder="Or add a new one" autocomplete="off"><button class="btn" data-act="b3Add" data-d="${t}">Add</button></div>
      <button class="btn primary" data-act="b3Save" data-d="${t}">Save</button>`);
  }

  /* ---------- timeline with free time ---------- */
  function scheduleItems(t) {
    const out = [];
    H.eventsOn(t).forEach((e) => {
      if (e.allDay) return;
      const s = toMin(H.evTime(e)), en = e.end ? (() => { const d = new Date(e.end); return ymd(d) === t ? d.getHours() * 60 + d.getMinutes() : 24 * 60; })() : s + 60;
      out.push({ kind: "event", title: e.title, start: s, end: Math.max(en, s + 15), where: e.location || "" });
    });
    H.meetingsOn(t).forEach((m) => { if (m.time) out.push({ kind: "meeting", id: m.id, title: m.title || "Meeting", start: toMin(m.time), end: toMin(m.time) + 60, where: m.who || "" }); });
    S.tasks.items.filter((x) => x.date === t && x.time).forEach((x) => out.push({ kind: "task", id: x.id, title: x.title, start: toMin(x.time), end: toMin(x.time) + 30, done: x.done }));
    return out.sort((a, b) => a.start - b.start);
  }
  function timelineCard() {
    const t = today(), items = scheduleItems(t), allDay = H.eventsOn(t).filter((e) => e.allDay);
    const now = toMin(nowHM());
    const dayStart = Math.max(now, 8 * 60), dayEnd = Math.max(21 * 60, ...items.map((x) => x.end));
    const rows = [];
    let cursor = Math.min(dayStart, ...items.map((x) => x.start));
    let nowShown = false;
    const pushNow = () => { if (!nowShown && now < 24 * 60) { rows.push(`<div class="tl-now"><span>${fmtTime(fromMin(now))}</span><i></i></div>`); nowShown = true; } };
    for (const it of items) {
      if (!nowShown && it.start > now) pushNow();
      const gapStart = Math.max(cursor, now);
      if (it.start - gapStart >= 45 && gapStart >= dayStart - 1) rows.push(freeRow(gapStart, it.start));
      const past = it.end <= now;
      rows.push(`<div class="tl-item ${it.kind}${past ? " past" : ""}"><span class="tl-t">${fmtTime(fromMin(it.start))}</span><button class="tl-b" ${it.kind === "meeting" ? `data-act="openMeeting" data-id="${it.id}"` : it.kind === "task" ? `data-act="editTask" data-id="${it.id}"` : "disabled"}><b>${esc(it.title)}</b><span>${fmtTime(fromMin(it.start))}–${fmtTime(fromMin(it.end))}${it.where ? " · " + esc(it.where) : ""}</span></button></div>`);
      cursor = Math.max(cursor, it.end);
    }
    pushNow();
    const tailStart = Math.max(cursor, now);
    if (dayEnd - tailStart >= 45 && tailStart < dayEnd) rows.push(freeRow(tailStart, dayEnd));
    const head = allDay.length ? `<div class="chips" style="margin-bottom:8px">${allDay.map((e) => `<span class="chip acc">${esc(e.title)}</span>`).join("")}</div>` : "";
    const freeMin = rows.join("").match(/data-free="(\d+)"/g)?.reduce((a, m) => a + +m.match(/\d+/)[0], 0) || 0;
    return section("Timeline", head + `<div class="tl">${rows.join("")}</div>${!items.length ? '<p class="small muted" style="margin:6px 0 0">No meetings or timed tasks. Add a time to a task, or link a calendar in Settings.</p>' : ""}`, `<span class="small muted">${freeMin >= 60 ? `${Math.floor(freeMin / 60)}h${freeMin % 60 ? " " + (freeMin % 60) + "m" : ""} free` : ""}</span>`);
  }
  function freeRow(a, b) {
    const mins = b - a, label = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? " " + (mins % 60) + "m" : ""}` : `${mins}m`;
    return `<div class="tl-free" data-free="${mins}"><span class="tl-t"></span><div><span>Free ${fmtTime(fromMin(a))}–${fmtTime(fromMin(b))} · ${label}</span><span class="tl-acts"><button class="link" data-act="tlFill" data-s="${a}" data-e="${b}">Plan a task</button><button class="link" data-act="qkFocus">Focus</button></span></div></div>`;
  }

  /* ---------- evening wrap-up ---------- */
  function wrapCard() {
    const t = today(), tm = addDays(t, 1);
    const done = S.tasks.items.filter((x) => x.done && x.doneAt && ymd(new Date(x.doneAt)) === t);
    const left = S.tasks.items.filter((x) => !x.done && x.date && x.date <= t);
    const hsLeft = H.dueHabits().filter((x) => !X.isDone(x.id, t));
    const je = S.journal.entries.find((e) => e.date === t);
    const b3t = S.tasks.big3 && S.tasks.big3.date === tm ? S.tasks.big3.ids.length : 0;
    let h = `<p style="margin:0 0 8px">${done.length ? `You finished <b>${plural(done.length, "task")}</b> today${done.length <= 3 ? ": " + done.map((x) => esc(x.title)).join(", ") : ""}.` : "No tasks ticked off today, and that’s fine. Tomorrow’s a new start."}</p>`;
    if (left.length) h += `<div class="wrap-left"><div class="sec-h" style="margin:4px 0"><h3>Still open · ${left.length}</h3><button class="link" data-act="wrapMoveAll">Move all to tomorrow</button></div>${left.slice(0, 6).map((x) => `<div class="kv"><span>${esc(x.title)}</span><button class="link" data-act="wrapMove" data-id="${x.id}">Tomorrow</button></div>`).join("")}${left.length > 6 ? `<p class="small muted" style="margin:2px 0 0">and ${left.length - 6} more</p>` : ""}</div>`;
    if (hsLeft.length) h += `<div style="margin-top:10px"><h3 style="margin-bottom:6px">Habits left</h3><div class="hchips">${hsLeft.map((x) => `<button class="hchip" data-act="habitToday" data-id="${x.id}"><i></i>${esc(x.name)}</button>`).join("")}</div></div>`;
    h += `<div style="margin-top:12px"><h3 style="margin-bottom:6px">How was today?</h3><div class="moods mini">${X.MOODS.map((m, i) => `<button class="mood${je && je.mood === i + 1 ? " on" : ""}" data-act="wrapMood" data-v="${i + 1}">${m[0]}</button>`).join("")}</div></div>`;
    h += `<div class="btns" style="margin-top:12px"><button class="btn primary" data-act="b3PickTomorrow">${b3t ? "Change tomorrow’s top 3" : "Pick tomorrow’s top 3"}</button><a class="btn" href="#journal">Write in journal</a></div>`;
    return section("Wrap up the day", h, wrapForced ? `<button class="link" data-act="wrapClose">Close</button>` : "", "wrap-card");
  }

  /* ---------- the screen ---------- */
  function view(SECTIONS) {
    const L = layout();
    let h = H.todayTop() + SECTIONS.welcome();
    if (isEvening()) h += wrapCard();
    // Tomorrow's top 3, once chosen in the evening, become today's at midnight automatically (they're stored by date).
    for (const { id, on } of L) {
      if (!on) continue;
      if (id === "brief") h += briefCard();
      else if (id === "quick") h += quickCard();
      else if (id === "big3") h += big3Card();
      else if (id === "timeline") h += timelineCard();
      else if (id === "coming") h += H.todayCards(today());
      else if (SECTIONS[id]) h += SECTIONS[id]();
    }
    return h + `<button class="link customize" data-act="tdCustomize">Customize Today</button>`;
  }
  function customizeSheet() {
    const L = layout();
    X.openSheet(`<h2>Customize Today</h2><p class="small muted" style="margin:0">Choose which cards show and their order. The evening wrap-up appears after 6pm.</p>
      <div class="list" id="tdList">${L.map((x, i) => { const c = CARDS.find((k) => k[0] === x.id); return `<div class="item" style="align-items:center"><input type="checkbox" class="td-on" data-id="${x.id}"${x.on ? " checked" : ""} aria-label="Show ${esc(c[1])}"><div class="body"><div class="t">${esc(c[1])}</div><div class="m"><span>${esc(c[2])}</span></div></div><button class="icon-btn" data-act="tdUp" data-i="${i}" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button><button class="icon-btn" data-act="tdDown" data-i="${i}" aria-label="Move down"${i === L.length - 1 ? " disabled" : ""}>↓</button></div>`; }).join("")}</div>
      <div><h3 style="margin-bottom:6px">Weather city</h3><div class="row"><input class="field" id="wxQ" placeholder="e.g. Abuja" value="${esc((city() || {}).name || "")}" autocomplete="off"><button class="btn" data-act="wxFind">Find</button></div><div id="wxRes" class="list"></div></div>
      <button class="btn primary" data-act="closeSheet">Done</button>`);
  }
  async function findCity() {
    const q = ($("#wxQ") || {}).value || "", out = $("#wxRes"); if (!q.trim() || !out) return;
    out.innerHTML = '<p class="small muted" style="margin:6px 0 0">Searching…</p>';
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=6&language=en`);
      const d = await r.json();
      const res = d.results || [];
      out.innerHTML = res.length ? res.map((c) => `<div class="item"><button class="body" data-act="wxSet" data-lat="${c.latitude}" data-lon="${c.longitude}" data-name="${esc(c.name)}"><div class="t">${esc(c.name)}</div><div class="m"><span>${esc([c.admin1, c.country].filter(Boolean).join(", "))}</span></div></button></div>`).join("") : '<p class="small muted" style="margin:6px 0 0">No places found.</p>';
    } catch { out.innerHTML = '<p class="small" style="color:var(--bad);margin:6px 0 0">Couldn’t search right now. Check your connection.</p>'; }
  }
  function moveLayout(i, dir) {
    const L = layout(), j = i + dir; if (j < 0 || j >= L.length) return;
    [L[i], L[j]] = [L[j], L[i]]; S.settings.todayLayout = L; save("settings");
    customizeSheet(); X.render();
  }

  /* ---------- actions ---------- */
  const moveTo = (ids, d) => { ids.forEach((id) => { const x = S.tasks.items.find((k) => k.id === id); if (x) x.date = d; }); save("tasks"); };
  const actions = {
    qkTask: () => { const el = $("#qaToday"); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => el.focus(), 250); } else X.taskSheet(null); },
    qkSpend: () => spendSheet(),
    qkFocus: () => { location.hash = "focus"; },
    qkNote: () => X.noteSheet(null),
    qkWater: () => { const t = today(); const e = { ...(S.health.log[t] || {}) }; e.water = (e.water || 0) + 1; S.health.log[t] = e; save("health"); X.render(); X.toast(`${e.water} of ${S.health.waterGoal || 8} glasses`); },
    qsSave: () => {
      const amt = parseFloat(($("#qsAmt").value || "").replace(/,/g, ""));
      if (!(amt > 0)) { $("#qsAmt").focus(); return; }
      S.money.entries.push({ id: newId(), type: "out", amt, cat: $("#qsCat").value, note: $("#qsNote").value.trim(), date: today(), ts: Date.now() });
      save("money"); X.closeSheet(); X.toast("Expense added: " + money(amt)); setTimeout(H.checkLimits, 300);
    },
    b3Pick: () => pickSheet(today()),
    b3PickTomorrow: () => pickSheet(addDays(today(), 1)),
    b3Add: (b) => { const el = $("#b3New"), v = el.value.trim(); if (!v) { el.focus(); return; } const p = X.parseQuick(v); const x = X.addTask({ ...p, date: p.date || b.dataset.d }); const cur = [...document.querySelectorAll(".b3-c:checked")].map((c) => c.value); S.tasks.big3 = { date: b.dataset.d, ids: [...cur, x.id].slice(0, 3) }; save("tasks"); pickSheet(b.dataset.d); },
    b3Save: (b) => {
      const ids = [...document.querySelectorAll(".b3-c:checked")].map((c) => c.value).slice(0, 3);
      const d = b.dataset.d;
      if (d !== today()) ids.forEach((id) => { const x = S.tasks.items.find((k) => k.id === id); if (x && (!x.date || x.date < d)) x.date = d; });
      S.tasks.big3 = { date: d, ids }; save("tasks"); X.closeSheet();
      if (d !== today()) X.toast("Tomorrow’s top 3 are set. They’ll be waiting in the morning.");
    },
    ovToday: () => { const t = today(); moveTo(S.tasks.items.filter((x) => !x.done && x.date && x.date < t).map((x) => x.id), t); X.render(); X.toast("Overdue tasks moved to today"); },
    ovTomorrow: () => { const t = today(); moveTo(S.tasks.items.filter((x) => !x.done && x.date && x.date < t).map((x) => x.id), addDays(t, 1)); X.render(); X.toast("Overdue tasks moved to tomorrow"); },
    wrapNow: () => { wrapForced = true; X.render(); window.scrollTo(0, 0); },
    wrapClose: () => { wrapForced = false; X.render(); },
    wrapMove: (b) => { moveTo([b.dataset.id], addDays(today(), 1)); X.render(); },
    wrapMoveAll: () => { const t = today(); const ids = S.tasks.items.filter((x) => !x.done && x.date && x.date <= t).map((x) => x.id); moveTo(ids, addDays(t, 1)); X.render(); X.toast(`${plural(ids.length, "task")} moved to tomorrow`); },
    wrapMood: (b) => { const e = X.journalToday(); const v = +b.dataset.v; e.mood = e.mood === v ? 0 : v; e.ts = Date.now(); save("journal"); X.render(); },
    tdCustomize: () => customizeSheet(),
    tdUp: (b) => moveLayout(+b.dataset.i, -1),
    tdDown: (b) => moveLayout(+b.dataset.i, 1),
    wxCity: () => { customizeSheet(); setTimeout(() => { const q = $("#wxQ"); if (q) { q.scrollIntoView({ block: "center" }); q.focus(); } }, 300); },
    wxFind: () => findCity(),
    wxSet: (b) => { S.settings.city = { name: b.dataset.name, lat: +(+b.dataset.lat).toFixed(3), lon: +(+b.dataset.lon).toFixed(3) }; save("settings"); WX = null; loadWeather(true); X.closeSheet(); X.toast("Weather set to " + b.dataset.name); },
  };
  function onChange(e) {
    const t = e.target;
    if (t.classList && t.classList.contains("td-on")) { const L = layout(); const x = L.find((k) => k.id === t.dataset.id); if (x) x.on = t.checked; S.settings.todayLayout = L; save("settings"); X.render(); return true; }
    if (t.classList && t.classList.contains("b3-c")) { const n = document.querySelectorAll(".b3-c:checked").length; if (n > 3) { t.checked = false; X.toast("Three is the limit. Untick one first."); } return true; }
    return false;
  }
  function onEnter(e) {
    if (e.target.id === "wxQ") { e.preventDefault(); findCity(); return true; }
    if (e.target.id === "qsAmt" || e.target.id === "qsNote") { e.preventDefault(); actions.qsSave(); return true; }
    if (e.target.id === "b3New") { e.preventDefault(); $("[data-act=b3Add]").click(); return true; }
    return false;
  }
  let minuteT = null;
  function after(v) {
    clearInterval(minuteT); minuteT = null;
    if (v !== "today") return;
    loadWeather(false);
    // Keep the "now" line and briefing current while the screen is open.
    minuteT = setInterval(() => { if (X.route() === "today" && !X.isTyping() && !document.querySelector(".sheet.show")) X.render(); }, 5 * 60e3);
  }
  return { view, actions, onChange, onEnter, after, scheduleItems, stop: () => clearInterval(minuteT) };
}
