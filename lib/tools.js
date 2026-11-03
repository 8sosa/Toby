// Toby's toolbox (More tab): focus timer, documents & renewals, countdowns, money calculators,
// converters, world clock and QR codes. Shares the engine's helpers through `X`.

export function createTools(X) {
  const { S, save, esc, pad, ymd, today, parseYmd, addDays, newId, DOW, MON, MONL, fmtDate, relDay, money } = X;
  const $ = (s) => document.querySelector(s);
  const num = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : NaN; };
  const daysUntil = (d) => Math.round((parseYmd(d) - parseYmd(today())) / 864e5);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const section = (title, body, right = "") => `<section class="card"><div class="sec-h"><h2>${title}</h2>${right}</div>${body}</section>`;
  const empty = (b, t) => `<div class="empty"><b>${b}</b>${t}</div>`;
  const seg = (items, cur, act) => `<div class="seg" role="tablist">${items.map(([v, l]) => `<button role="tab" class="${cur === v ? "on" : ""}" data-act="${act}" data-v="${v}">${l}</button>`).join("")}</div>`;
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
  const fmtN = (n, d = 2) => (isFinite(n) ? (+n.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
  const cur = () => S.settings.currency || "";
  const m0 = (n) => (isFinite(n) ? (n < 0 ? "−" : "") + cur() + Math.abs(Math.round(n)).toLocaleString("en-US") : "—");

  /* ================= FOCUS TIMER ================= */
  const FKEY = "toby:focus:" + X.uid;
  let timer = null, tick = null, wakeLock = null;
  try { timer = JSON.parse(localStorage.getItem(FKEY) || "null"); } catch { timer = null; }
  const fset = () => Object.assign({ work: 25, brk: 5 }, S.focus.prefs || {});
  const persist = () => { try { timer ? localStorage.setItem(FKEY, JSON.stringify(timer)) : localStorage.removeItem(FKEY); } catch {} };
  const remaining = () => (timer ? Math.max(0, timer.end - (timer.paused ? timer.pausedAt : Date.now())) : 0);
  const mmss = (ms) => { const s = Math.ceil(ms / 1000); return pad(Math.floor(s / 60)) + ":" + pad(s % 60); };
  async function lockScreen(on) {
    try {
      if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { wakeLock = null; }
  }
  function startTimer(kind) {
    const f = fset(), mins = kind === "break" ? f.brk : f.work;
    timer = { kind, mins, start: Date.now(), end: Date.now() + mins * 60e3, label: ($("#fcLabel") || {}).value || (timer && timer.label) || "", project: ($("#fcProj") || {}).value || (timer && timer.project) || "", paused: false };
    persist(); runTick(); lockScreen(true); X.render();
  }
  function finishTimer(done) {
    if (!timer) return;
    if (timer.kind === "work") {
      const mins = done ? timer.mins : Math.round((Date.now() - timer.start) / 60e3);
      if (mins >= 1) {
        S.focus.sessions = [...(S.focus.sessions || []), { id: newId(), date: today(), mins, label: timer.label, project: timer.project, ts: Date.now() }].slice(-1000);
        save("focus");
      }
      if (done) {
        try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
        notify("Focus session done", `${plural(mins, "minute")}${timer.label ? " on " + timer.label : ""}. Time for a ${fset().brk}-minute break.`);
        X.toast(`Nice work: ${plural(mins, "minute")} of focus`);
      }
    } else if (done) {
      notify("Break's over", "Ready for the next session?");
    }
    timer = null; persist(); clearInterval(tick); tick = null; lockScreen(false);
  }
  async function notify(title, body) {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(title, { body, icon: "/icon-192.png", tag: "focus" });
    } catch {}
  }
  function runTick() {
    clearInterval(tick);
    tick = setInterval(() => {
      if (!timer) { clearInterval(tick); return; }
      if (!timer.paused && remaining() <= 0) { finishTimer(true); X.softRender(); return; }
      const el = $("#fcTime"); if (el) el.textContent = mmss(remaining());
      const ring = $("#fcRing"); if (ring) ring.style.setProperty("--p", (1 - remaining() / (timer.mins * 60e3)).toFixed(4));
      document.title = timer.paused ? "Toby" : mmss(remaining()) + " · " + (timer.kind === "work" ? "Focus" : "Break");
    }, 500);
  }
  if (timer) runTick();

  function focusView() {
    const f = fset(), t = today();
    const ss = S.focus.sessions || [];
    const todayMins = ss.filter((x) => x.date === t).reduce((a, x) => a + x.mins, 0);
    const week = []; for (let i = 6; i >= 0; i--) week.push(addDays(t, -i));
    const perDay = week.map((d) => ss.filter((x) => x.date === d).reduce((a, x) => a + x.mins, 0));
    const max = Math.max(60, ...perDay);
    const byProj = {}; ss.filter((x) => x.date >= week[0]).forEach((x) => { const k = x.project ? (S.projects.items.find((p) => p.id === x.project) || {}).name || "Project" : x.label || "Other"; byProj[k] = (byProj[k] || 0) + x.mins; });
    const running = !!timer;
    const p = running ? 1 - remaining() / (timer.mins * 60e3) : 0;
    let h = `<section class="card focus-card"><div class="fc-ring" id="fcRing" style="--p:${p.toFixed(4)}"><div><span class="fc-kind">${running ? (timer.kind === "work" ? "Focus" : "Break") : "Ready"}</span><b id="fcTime">${running ? mmss(remaining()) : pad(f.work) + ":00"}</b>${running && timer.label ? `<span class="small muted">${esc(timer.label)}</span>` : ""}</div></div>`;
    if (running) {
      h += `<div class="btns" style="justify-content:center">${timer.paused ? `<button class="btn primary" data-act="fcResume">Resume</button>` : `<button class="btn primary" data-act="fcPause">Pause</button>`}<button class="btn" data-act="fcStop">${timer.kind === "work" ? "Stop and save" : "Skip break"}</button></div>`;
    } else {
      h += `<input class="field" id="fcLabel" placeholder="What are you working on?" autocomplete="off">
        <select class="field" id="fcProj">${opt("", "No project", "")}${S.projects.items.filter((x) => !x.archived).map((x) => opt(x.id, x.name, "")).join("")}</select>
        <div class="btns"><button class="btn primary" style="flex:1" data-act="fcStart">Start ${f.work}-minute focus</button><button class="btn" data-act="fcBreak">${f.brk}-min break</button></div>
        <div class="grid2"><label class="lbl">Focus minutes<select class="field" id="fcWork">${[15, 25, 30, 45, 50, 60, 90].map((n) => opt(n, n, f.work)).join("")}</select></label><label class="lbl">Break minutes<select class="field" id="fcBrk">${[3, 5, 10, 15].map((n) => opt(n, n, f.brk)).join("")}</select></label></div>`;
    }
    h += `<p class="small muted" style="margin:0;text-align:center">Keeps your screen on while running. With notifications on, Toby pings you when time’s up.</p></section>`;
    h += section("This week", `<div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><b>${Math.floor(todayMins / 60)}h ${todayMins % 60}m</b><span>today</span></div><div class="stat"><b>${Math.round(perDay.reduce((a, b) => a + b, 0) / 6) / 10}h</b><span>last 7 days</span></div></div>
      <div class="hbars" style="grid-template-columns:repeat(7,minmax(0,1fr));margin-top:12px">${week.map((d, i) => `<div class="hbar" title="${fmtDate(d)}: ${perDay[i]} min"><i style="height:${(perDay[i] / max) * 100}%;background:var(--accent)"></i><span>${DOW[parseYmd(d).getDay()].slice(0, 2)}</span></div>`).join("")}</div>
      ${Object.keys(byProj).length ? `<div style="margin-top:12px">${Object.entries(byProj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span class="num">${Math.floor(v / 60)}h ${v % 60}m</span></div>`).join("")}</div>` : ""}`);
    return h;
  }

  /* ================= DOCUMENTS & RENEWALS ================= */
  const DOC_TYPES = ["Passport", "Driver’s licence", "National ID (NIN)", "Vehicle licence", "Roadworthiness", "Car insurance", "Health insurance (HMO)", "Visa", "Residence permit", "Tenancy", "Professional licence", "Other"];
  const docStatus = (d) => {
    if (!d.expires) return ["", "No expiry"];
    const n = daysUntil(d.expires);
    if (n < 0) return ["bad", "Expired " + plural(-n, "day") + " ago"];
    if (n <= 30) return ["hi", "Expires " + (n === 0 ? "today" : "in " + plural(n, "day"))];
    if (n <= 90) return ["acc", "Expires in " + Math.round(n / 30) + " months"];
    return ["", "Valid until " + fmtDate(d.expires)];
  };
  function docsView() {
    const ds = S.docs.items.slice().sort((a, b) => (a.expires || "9999").localeCompare(b.expires || "9999"));
    const soon = ds.filter((d) => d.expires && daysUntil(d.expires) <= 60).length;
    return `<section class="card"><p class="small muted" style="margin:0 0 10px">Passport, licences, car papers, insurance and permits. Toby reminds you 60, 30 and 7 days before anything expires${soon ? `. <b style="color:var(--ink)">${plural(soon, "item")} need attention soon.</b>` : "."}</p><button class="btn primary" data-act="docNew" style="width:100%">Add a document</button></section>` +
      section("Your documents", `<div class="list">${ds.length ? ds.map((d) => { const [cls, txt] = docStatus(d); return `<div class="item"><button class="body" data-act="docOpen" data-id="${d.id}"><div class="t" style="font-weight:500">${esc(d.name || d.type)}</div><div class="m"><span>${esc(d.type)}${d.holder ? " · " + esc(d.holder) : ""}</span><span class="chip ${cls}">${esc(txt)}</span></div></button></div>`; }).join("") : empty("Nothing added yet.", "Start with your passport and driver’s licence, then car papers.")}</div>`);
  }
  function docSheet(d) {
    const isNew = !d; d = d || { type: "Passport", name: "", number: "", holder: "", issued: "", expires: "", notes: "" };
    X.openSheet(`<h2>${isNew ? "Add a document" : esc(d.name || d.type)}</h2>
      <div class="grid2"><label class="lbl">Type<select class="field" id="dcType">${DOC_TYPES.map((t) => opt(t, t, d.type)).join("")}</select></label><label class="lbl">Name<input class="field" id="dcName" value="${esc(d.name)}" placeholder="e.g. My passport"></label></div>
      <div class="grid2"><label class="lbl">Number<input class="field" id="dcNum" value="${esc(d.number)}" autocomplete="off"></label><label class="lbl">Whose<input class="field" id="dcHolder" value="${esc(d.holder)}" placeholder="Me, spouse, car…"></label></div>
      <div class="grid2"><label class="lbl">Issued<input class="field" type="date" id="dcIssued" value="${esc(d.issued)}"></label><label class="lbl">Expires<input class="field" type="date" id="dcExp" value="${esc(d.expires)}"></label></div>
      <label class="lbl">Notes<textarea class="field" id="dcNotes" style="min-height:70px" placeholder="Where it’s kept, renewal office, cost last time">${esc(d.notes)}</textarea></label>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="docSave" data-id="${d.id || ""}">Save</button>${isNew ? "" : `<button class="btn" data-act="docTask" data-id="${d.id}">Add renewal task</button><button class="btn danger" data-act="docDel" data-id="${d.id}">Delete</button>`}</div>`, (s) => { if (isNew) s.querySelector("#dcName").focus(); });
  }

  /* ================= COUNTDOWNS ================= */
  const cds = () => S.settings.countdowns || [];
  function countdownsView() {
    const list = cds().slice().sort((a, b) => a.date.localeCompare(b.date));
    return `<section class="card"><div class="row"><input class="field" id="cdTitle" placeholder="e.g. Trip to Accra" autocomplete="off"><input class="field" type="date" id="cdDate" style="max-width:160px"></div><button class="btn primary" data-act="cdAdd" style="width:100%;margin-top:8px">Add countdown</button></section>
      <div class="cd-grid">${list.length ? list.map((c) => { const n = daysUntil(c.date); return `<div class="cd"><button class="cd-x" data-act="cdDel" data-id="${c.id}" aria-label="Remove">×</button><b>${Math.abs(n)}</b><span>${n === 0 ? "today" : n > 0 ? (n === 1 ? "day to go" : "days to go") : n === -1 ? "day ago" : "days ago"}</span><div class="t">${esc(c.title)}</div><span class="small muted">${esc(fmtDate(c.date))} ${c.date.slice(0, 4)}</span><label class="row small" style="gap:6px;margin-top:6px"><input type="checkbox" class="cd-pin" data-id="${c.id}"${c.pin ? " checked" : ""}> Show on Today</label></div>`; }).join("") : `<div class="card">${empty("No countdowns yet.", "Add trips, deadlines, birthdays or the end of a loan.")}</div>`}</div>` +
      section("Days between dates", `<div class="grid2"><label class="lbl">From<input class="field" type="date" id="dbFrom" value="${today()}"></label><label class="lbl">To<input class="field" type="date" id="dbTo"></label></div><p class="small" id="dbOut" style="margin:10px 0 0">Pick two dates.</p>
        <div class="grid2" style="margin-top:12px"><label class="lbl">Start date<input class="field" type="date" id="daStart" value="${today()}"></label><label class="lbl">Add days (use − to go back)<input class="field num" id="daN" inputmode="numeric" placeholder="e.g. 90"></label></div><p class="small" id="daOut" style="margin:10px 0 0"></p>`);
  }
  function dateCalcs() {
    const a = ($("#dbFrom") || {}).value, b = ($("#dbTo") || {}).value, o = $("#dbOut");
    if (o) {
      if (a && b) {
        const n = Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
        let wd = 0; for (let i = 0, d = a; i < Math.abs(n); i++) { d = addDays(d, n > 0 ? 1 : -1); const w = parseYmd(d).getDay(); if (w && w !== 6) wd++; }
        o.innerHTML = `<b>${plural(Math.abs(n), "day")}</b> (${Math.floor(Math.abs(n) / 7)} weeks ${Math.abs(n) % 7} days) · ${plural(wd, "weekday")}`;
      } else o.textContent = "Pick two dates.";
    }
    const s = ($("#daStart") || {}).value, k = parseInt(($("#daN") || {}).value, 10), o2 = $("#daOut");
    if (o2) o2.innerHTML = s && isFinite(k) ? `<b>${esc(fmtDate(addDays(s, k)))} ${addDays(s, k).slice(0, 4)}</b>` : "";
  }

  /* ================= MONEY CALCULATORS ================= */
  let finTab = "loan", loanMode = "repay";
  // Nigeria Tax Act 2025 bands, effective 1 January 2026 (annual).
  const PAYE_BANDS = [[800000, 0], [2200000, 0.15], [9000000, 0.18], [13000000, 0.21], [25000000, 0.23], [Infinity, 0.25]];
  function finView() {
    let h = seg([["loan", "Loan cost"], ["save", "Savings plan"], ["tax", "Salary tax"]], finTab, "finTab");
    if (finTab === "loan") {
      h += `<section class="card">${seg([["repay", "I know what I’ll repay"], ["rate", "I know the rate"]], loanMode, "loanMode")}`;
      h += loanMode === "repay"
        ? `<div class="grid2" style="margin-top:10px"><label class="lbl">Amount borrowed<input class="field num fc" id="lnAmt" inputmode="decimal" placeholder="e.g. 150000"></label><label class="lbl">Total to repay<input class="field num fc" id="lnRep" inputmode="decimal" placeholder="e.g. 165000"></label></div><label class="lbl" style="margin-top:10px">Over how many days<input class="field num fc" id="lnDays" inputmode="numeric" placeholder="e.g. 30"></label>`
        : `<div class="grid2" style="margin-top:10px"><label class="lbl">Amount borrowed<input class="field num fc" id="lnAmt" inputmode="decimal" placeholder="e.g. 500000"></label><label class="lbl">Interest per month (%)<input class="field num fc" id="lnRate" inputmode="decimal" placeholder="e.g. 4"></label></div><div class="grid2" style="margin-top:10px"><label class="lbl">Months<input class="field num fc" id="lnMonths" inputmode="numeric" placeholder="e.g. 6"></label><label class="lbl">Interest type<select class="field fc" id="lnType"><option value="flat">Flat (most loan apps)</option><option value="reducing">Reducing balance (banks)</option></select></label></div>`;
      h += `<div id="lnOut" class="calc-out"></div></section>`;
      h += `<p class="small muted" style="margin:0">Compare a loan’s yearly cost with what savings earn. A 30-day app loan that costs 10% works out to over 100% a year.</p>`;
    } else if (finTab === "save") {
      h += `<section class="card"><div class="grid2"><label class="lbl">Goal amount<input class="field num fc" id="svGoal" inputmode="decimal" placeholder="e.g. 921000"></label><label class="lbl">Already saved<input class="field num fc" id="svHave" inputmode="decimal" placeholder="0"></label></div>
        <div class="grid2" style="margin-top:10px"><label class="lbl">Reach it by<input class="field fc" type="date" id="svBy"></label><label class="lbl">Yearly return (%)<input class="field num fc" id="svRate" inputmode="decimal" placeholder="e.g. 15"></label></div>
        <label class="lbl" style="margin-top:10px">Or: I can save this much a month<input class="field num fc" id="svMonthly" inputmode="decimal" placeholder="e.g. 150000"></label><div id="svOut" class="calc-out"></div></section>`;
    } else {
      const s = S.money.salary;
      h += `<section class="card"><p class="small muted" style="margin:0 0 10px">Estimate using the Nigeria Tax Act 2025 rates, in force from January 2026. Check the exact figure with your payslip or HR.</p>
        <div class="grid2"><label class="lbl">Monthly gross pay<input class="field num fc" id="txGross" inputmode="decimal" placeholder="Before deductions" value="${""}"></label><label class="lbl">Yearly rent you pay<input class="field num fc" id="txRent" inputmode="decimal" placeholder="For rent relief"></label></div>
        <label class="row small" style="gap:8px;margin-top:10px"><input type="checkbox" id="txPension" class="fc" checked> Pension (8% of pay) is deducted before tax</label>
        <label class="row small" style="gap:8px"><input type="checkbox" id="txNhf" class="fc"> NHF (2.5%) is deducted before tax</label>
        ${s && s.amount ? `<p class="small muted" style="margin:8px 0 0">Your take-home in Toby is ${money(s.amount)} a month.</p>` : ""}
        <div id="txOut" class="calc-out"></div></section>`;
    }
    return h;
  }
  function finCalc() {
    const v = (id) => num(($("#" + id) || {}).value);
    const set = (id, html) => { const el = $("#" + id); if (el) el.innerHTML = html; };
    const rows = (r) => r.map(([k, val, strong]) => `<div class="kv"><span class="${strong ? "" : "muted"}">${k}</span>${strong ? `<b class="num">${val}</b>` : `<span class="num">${val}</span>`}</div>`).join("");
    if (finTab === "loan") {
      const amt = v("lnAmt");
      if (loanMode === "repay") {
        const rep = v("lnRep"), days = v("lnDays");
        if (!(amt > 0 && rep > 0 && days > 0)) return set("lnOut", '<p class="small muted" style="margin:10px 0 0">Enter all three to see the real cost.</p>');
        const cost = rep - amt, pct = cost / amt, apr = pct * (365 / days);
        set("lnOut", rows([["Interest and fees", m0(cost), true], ["For this loan", fmtN(pct * 100, 1) + "%"], ["Per month", fmtN((pct * 30) / days * 100, 1) + "%"], ["Per year (APR)", fmtN(apr * 100, 0) + "%", true]]) + (apr > 0.5 ? `<p class="small" style="margin:8px 0 0;color:var(--bad)">That’s expensive borrowing. Paying it off early or avoiding a repeat saves the most.</p>` : ""));
      } else {
        const r = v("lnRate") / 100, n = Math.round(v("lnMonths")), type = ($("#lnType") || {}).value;
        if (!(amt > 0 && r >= 0 && n > 0)) return set("lnOut", '<p class="small muted" style="margin:10px 0 0">Enter the amount, monthly rate and months.</p>');
        let pay, total;
        if (type === "flat") { total = amt * (1 + r * n); pay = total / n; }
        else { pay = r ? (amt * r) / (1 - Math.pow(1 + r, -n)) : amt / n; total = pay * n; }
        set("lnOut", rows([["Each month", m0(pay), true], ["Total repaid", m0(total)], ["Interest", m0(total - amt), true], ["Per year (APR)", fmtN((type === "flat" ? r * 2 * n / (n + 1) : r) * 1200, 0) + "%"]]));
      }
    } else if (finTab === "save") {
      const goal = v("svGoal"), have = v("svHave") || 0, by = ($("#svBy") || {}).value, rate = (v("svRate") || 0) / 100 / 12, monthly = v("svMonthly");
      if (!(goal > 0)) return set("svOut", '<p class="small muted" style="margin:10px 0 0">Enter your goal amount.</p>');
      const need = goal - have;
      const out = [];
      if (by) {
        const months = Math.max(1, Math.round((parseYmd(by) - parseYmd(today())) / (30.44 * 864e5)));
        const fvHave = have * Math.pow(1 + rate, months);
        const pm = rate ? ((goal - fvHave) * rate) / (Math.pow(1 + rate, months) - 1) : (goal - have) / months;
        out.push(["Save each month", m0(Math.max(0, pm)), true], ["For", plural(months, "month")]);
        if (rate) out.push(["Interest earned", m0(goal - have - Math.max(0, pm) * months)]);
      }
      if (monthly > 0) {
        let bal = have, n = 0;
        while (bal < goal && n < 600) { bal = bal * (1 + rate) + monthly; n++; }
        const d = new Date(); d.setMonth(d.getMonth() + n);
        out.push([`At ${m0(monthly)} a month`, n >= 600 ? "50+ years" : `${plural(n, "month")} · ${MON[d.getMonth()]} ${d.getFullYear()}`, true]);
      }
      if (!out.length) out.push(["Still to save", m0(need), true]);
      set("svOut", rows(out) + `<button class="btn" data-act="svGoalMake" style="margin-top:10px">Make this a savings goal</button>`);
    } else {
      const gross = v("txGross");
      if (!(gross > 0)) return set("txOut", '<p class="small muted" style="margin:10px 0 0">Enter your monthly gross pay.</p>');
      const annual = gross * 12;
      const pension = ($("#txPension") || {}).checked ? annual * 0.08 : 0, nhf = ($("#txNhf") || {}).checked ? annual * 0.025 : 0;
      const rentRelief = Math.min(500000, (v("txRent") || 0) * 0.2);
      const taxable = Math.max(0, annual - pension - nhf - rentRelief);
      let left = taxable, tax = 0; const parts = [];
      for (const [size, rate] of PAYE_BANDS) { const chunk = Math.min(left, size); if (chunk <= 0) break; tax += chunk * rate; parts.push([chunk, rate]); left -= chunk; }
      const takeHome = (annual - pension - nhf - tax) / 12;
      set("txOut", rows([["Tax each month", m0(tax / 12), true], ["Tax for the year", m0(tax)], ["Effective rate", fmtN((tax / annual) * 100, 1) + "% of gross"], ["Take-home each month", m0(takeHome), true]]) +
        `<details style="margin-top:8px"><summary class="small">How it’s worked out</summary><div class="small" style="margin-top:6px">${rows([["Yearly gross", m0(annual)], ...(pension ? [["Pension (8%)", "−" + m0(pension)]] : []), ...(nhf ? [["NHF (2.5%)", "−" + m0(nhf)]] : []), ...(rentRelief ? [["Rent relief (20% of rent, max ₦500k)", "−" + m0(rentRelief)]] : []), ["Taxable income", m0(taxable), true], ...parts.map(([c, r]) => [`${m0(c)} at ${r * 100}%`, m0(c * r)])])}</div></details>`);
    }
  }

  /* ================= CONVERTERS ================= */
  let convTab = "units", unitKind = "area";
  const UNITS = {
    length: { label: "Length", u: { m: 1, km: 1000, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, yd: 0.9144, mile: 1609.344 } },
    area: { label: "Land & area", u: { "m²": 1, "ft²": 0.09290304, "plot (60×120 ft)": 668.901, "plot (50×100 ft)": 464.515, acre: 4046.8564224, hectare: 10000, "km²": 1e6 } },
    weight: { label: "Weight", u: { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523, tonne: 1000 } },
    volume: { label: "Volume", u: { litre: 1, ml: 0.001, "gallon (US)": 3.785411784, "gallon (UK)": 4.54609, "m³": 1000 } },
    speed: { label: "Speed", u: { "km/h": 1, mph: 1.609344, "m/s": 3.6, knot: 1.852 } },
    temp: { label: "Temperature", u: { "°C": 1, "°F": 1, K: 1 } },
  };
  function convView() {
    let h = seg([["units", "Units"], ["fuel", "Fuel trip"], ["fx", "Currency"]], convTab, "convTab");
    if (convTab === "units") {
      const k = UNITS[unitKind], names = Object.keys(k.u);
      h += `<section class="card"><select class="field" id="cvKind">${Object.entries(UNITS).map(([v, x]) => opt(v, x.label, unitKind)).join("")}</select>
        <div class="row" style="margin-top:10px"><input class="field num cv" id="cvVal" inputmode="decimal" value="1"><select class="field cv" id="cvFrom" style="max-width:55%">${names.map((n) => opt(n, n, names[unitKind === "area" ? 2 : 0])).join("")}</select></div>
        <div id="cvOut" class="calc-out"></div></section>`;
      if (unitKind === "area") h += `<p class="small muted" style="margin:0">Plot sizes differ by area and seller: a “plot” is often 60×120 ft in Lagos and 50×100 ft elsewhere. Check what your survey plan says.</p>`;
    } else if (convTab === "fuel") {
      const f = S.settings.fuel || {};
      h += `<section class="card"><div class="grid2"><label class="lbl">Distance (km, one way)<input class="field num cv" id="fuKm" inputmode="decimal" placeholder="e.g. 35"></label><label class="lbl">Fuel price per litre<input class="field num cv" id="fuPrice" inputmode="decimal" value="${esc(f.price || "")}" placeholder="e.g. 900"></label></div>
        <div class="grid2" style="margin-top:10px"><label class="lbl">Your car does (km per litre)<input class="field num cv" id="fuKpl" inputmode="decimal" value="${esc(f.kpl || "")}" placeholder="e.g. 10"></label><label class="lbl">Trips<select class="field cv" id="fuTrip"><option value="2">Return trip</option><option value="1">One way</option><option value="10">5 days, return</option><option value="44">Month of workdays, return</option></select></label></div>
        <div id="fuOut" class="calc-out"></div></section>`;
    } else {
      const fx = S.settings.fx || { code: "USD", rate: "" };
      h += `<section class="card"><p class="small muted" style="margin:0 0 10px">Enter today’s rate from your bank or a rate you trust; Toby remembers it.</p>
        <div class="grid2"><label class="lbl">Currency<select class="field cv" id="fxCode">${["USD", "GBP", "EUR", "CAD", "GHS", "ZAR", "AED", "CNY"].map((c) => opt(c, c, fx.code)).join("")}</select></label><label class="lbl">1 ${esc(fx.code)} = ${esc(cur() || "₦")}<input class="field num cv" id="fxRate" inputmode="decimal" value="${esc(fx.rate)}" placeholder="Rate"></label></div>
        <div class="grid2" style="margin-top:10px"><label class="lbl">${esc(fx.code)}<input class="field num cv" id="fxA" inputmode="decimal" placeholder="0"></label><label class="lbl">${esc(cur() || "₦")}<input class="field num cv" id="fxB" inputmode="decimal" placeholder="0"></label></div>
        ${fx.at ? `<p class="small muted" style="margin:8px 0 0">Rate saved ${esc(relDay(fx.at).toLowerCase())}.</p>` : ""}</section>`;
    }
    return h;
  }
  function convCalc(srcId) {
    if (convTab === "units") {
      const k = UNITS[unitKind], val = num(($("#cvVal") || {}).value), from = ($("#cvFrom") || {}).value, out = $("#cvOut");
      if (!out) return;
      if (!isFinite(val)) { out.innerHTML = ""; return; }
      let rows;
      if (unitKind === "temp") {
        const c = from === "°F" ? ((val - 32) * 5) / 9 : from === "K" ? val - 273.15 : val;
        rows = [["°C", c], ["°F", (c * 9) / 5 + 32], ["K", c + 273.15]].filter((r) => r[0] !== from);
      } else {
        const base = val * k.u[from];
        rows = Object.entries(k.u).filter(([n]) => n !== from).map(([n, f]) => [n, base / f]);
      }
      out.innerHTML = rows.map(([n, v]) => `<div class="kv"><span class="muted">${esc(n)}</span><span class="num">${fmtN(v, Math.abs(v) < 1 ? 4 : 2)}</span></div>`).join("");
    } else if (convTab === "fuel") {
      const km = num($("#fuKm").value), price = num($("#fuPrice").value), kpl = num($("#fuKpl").value), trips = +$("#fuTrip").value, out = $("#fuOut");
      if (srcId === "fuPrice" || srcId === "fuKpl") { S.settings.fuel = { price: isFinite(price) ? price : "", kpl: isFinite(kpl) ? kpl : "" }; save("settings"); }
      if (!(km > 0 && price > 0 && kpl > 0)) { out.innerHTML = '<p class="small muted" style="margin:10px 0 0">Enter distance, price and your car’s km per litre.</p>'; return; }
      const litres = (km * trips) / kpl;
      out.innerHTML = `<div class="kv"><span class="muted">Distance</span><span class="num">${fmtN(km * trips, 0)} km</span></div><div class="kv"><span class="muted">Fuel</span><span class="num">${fmtN(litres, 1)} litres</span></div><div class="kv"><span>Cost</span><b class="num">${m0(litres * price)}</b></div>`;
    } else {
      const code = $("#fxCode").value, rate = num($("#fxRate").value);
      if (srcId === "fxCode" || srcId === "fxRate") { S.settings.fx = { code, rate: isFinite(rate) ? rate : "", at: today() }; save("settings"); if (srcId === "fxCode") { X.render(); return; } }
      if (!(rate > 0)) return;
      if (srcId === "fxB") { const b = num($("#fxB").value); $("#fxA").value = isFinite(b) ? fmtN(b / rate, 2).replace(/,/g, "") : ""; }
      else { const a = num($("#fxA").value); $("#fxB").value = isFinite(a) ? fmtN(a * rate, 2).replace(/,/g, "") : ""; }
    }
  }

  /* ================= WORLD CLOCK ================= */
  const DEFAULT_ZONES = ["Africa/Lagos", "Europe/London", "America/New_York", "Asia/Dubai"];
  const zones = () => S.settings.zones || DEFAULT_ZONES;
  let planAt = "";
  const zoneName = (z) => z.split("/").pop().replace(/_/g, " ");
  const zoneParts = (date, tz) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23", day: "numeric", month: "short" }).formatToParts(date).map((p) => [p.type, p.value]));
  const offsetMin = (tz, date) => { const p = zoneParts(date, tz), local = new Date(date.toLocaleString("en-US", { timeZone: tz })); return Math.round((local - new Date(date.toLocaleString("en-US"))) / 60000); };
  function clockView() {
    const now = new Date();
    const base = planAt ? (() => { const [h, m] = planAt.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; })() : now;
    const rows = zones().map((z) => {
      let p; try { p = zoneParts(base, z); } catch { return ""; }
      const h = +p.hour, work = h >= 9 && h < 17, awake = h >= 7 && h < 22;
      const off = offsetMin(z, base) / 60;
      return `<div class="item clock-row" style="align-items:center"><div class="body"><div class="t">${esc(zoneName(z))}</div><div class="m"><span>${p.weekday} ${p.day} ${p.month}</span><span>${off === 0 ? "Same time as you" : (off > 0 ? "+" : "−") + fmtN(Math.abs(off), 1) + "h"}</span><span class="chip ${work ? "good" : awake ? "" : "bad"}">${work ? "Work hours" : awake ? "Awake" : "Night"}</span></div></div><b class="clock-t num">${p.hour}:${p.minute}</b>${z !== "Africa/Lagos" ? `<button class="icon-btn" data-act="zoneDel" data-z="${esc(z)}" aria-label="Remove">×</button>` : ""}</div>`;
    }).join("");
    let all = []; try { all = Intl.supportedValuesOf("timeZone"); } catch { all = DEFAULT_ZONES.concat(["Africa/Accra", "Africa/Johannesburg", "Africa/Nairobi", "Europe/Paris", "America/Los_Angeles", "America/Toronto", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney"]); }
    return section(planAt ? `When it’s ${planAt} for you` : "Right now", `<div class="list">${rows}</div>`, planAt ? `<button class="link" data-act="planNow">Back to now</button>` : "") +
      section("Plan a call", `<label class="lbl">Pick a time where you are<input class="field" type="time" id="ckPlan" value="${planAt}"></label><p class="small muted" style="margin:8px 0 0">Every city updates to that moment, with work hours marked.</p>`) +
      section("Add a city", `<div class="row"><select class="field" id="ckAdd">${all.filter((z) => !zones().includes(z)).map((z) => opt(z, z.replace(/_/g, " "), "")).join("")}</select><button class="btn primary" data-act="zoneAdd">Add</button></div>`);
  }

  /* ================= QR CODES ================= */
  let qrKind = "bank", qrLib = null;
  async function qrSvg(text) {
    if (!qrLib) { const m = await import("qrcode-generator"); qrLib = m.default || m; if (qrLib.stringToBytesFuncs && qrLib.stringToBytesFuncs["UTF-8"]) qrLib.stringToBytes = qrLib.stringToBytesFuncs["UTF-8"]; }
    const q = qrLib(0, "M"); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }
  function qrText() {
    const g = (id) => (($("#" + id) || {}).value || "").trim();
    if (qrKind === "bank") return g("qrBank") || g("qrAcct") ? `Bank: ${g("qrBank")}\nAccount number: ${g("qrAcct")}\nAccount name: ${g("qrName")}` : "";
    if (qrKind === "wifi") { const e = (s) => s.replace(/([\\;,:"])/g, "\\$1"); return g("qrSsid") ? `WIFI:T:${g("qrSec") || "WPA"};S:${e(g("qrSsid"))};P:${e(g("qrPass"))};;` : ""; }
    if (qrKind === "contact") return g("qrCName") ? `BEGIN:VCARD\nVERSION:3.0\nFN:${g("qrCName")}\nTEL:${g("qrCPhone")}\nEMAIL:${g("qrCEmail")}\nEND:VCARD` : "";
    return g("qrText");
  }
  function qrView() {
    const saved = S.settings.qr || {};
    const f = (id, label, ph, type = "text") => `<label class="lbl">${label}<input class="field qr-in" id="${id}" type="${type}" value="${esc(saved[id] || "")}" placeholder="${ph}" autocomplete="off"></label>`;
    let form = "";
    if (qrKind === "bank") form = f("qrBank", "Bank", "e.g. Access Bank") + f("qrAcct", "Account number", "0123456789") + f("qrName", "Account name", "As it appears on the account");
    else if (qrKind === "wifi") form = f("qrSsid", "Network name", "Wi-Fi name") + f("qrPass", "Password", "") + `<label class="lbl">Security<select class="field qr-in" id="qrSec">${["WPA", "WEP", "nopass"].map((x) => opt(x, x === "nopass" ? "None" : x, saved.qrSec || "WPA")).join("")}</select></label>`;
    else if (qrKind === "contact") form = f("qrCName", "Name", "") + f("qrCPhone", "Phone", "", "tel") + f("qrCEmail", "Email", "", "email");
    else form = `<label class="lbl">Link or text<textarea class="field qr-in" id="qrText" style="min-height:70px" placeholder="https://…">${esc(saved.qrText || "")}</textarea></label>`;
    return seg([["bank", "Bank details"], ["wifi", "Wi-Fi"], ["contact", "Contact"], ["text", "Link/text"]], qrKind, "qrKind") +
      `<section class="card"><div style="display:grid;gap:10px">${form}</div><div class="qr-box" id="qrBox"><p class="small muted" style="margin:0">Fill in the details to make a code.</p></div>
        <div class="btns" style="justify-content:center"><button class="btn primary" data-act="qrShare">Share image</button><button class="btn" data-act="qrCopy">Copy text</button></div>
        <p class="small muted" style="margin:6px 0 0;text-align:center">Anyone can scan this with their phone camera. Details are saved on your account for next time.</p></section>`;
  }
  let qrT;
  function qrRender() {
    clearTimeout(qrT);
    qrT = setTimeout(async () => {
      const box = $("#qrBox"); if (!box) return;
      const t = qrText();
      if (!t) { box.innerHTML = '<p class="small muted" style="margin:0">Fill in the details to make a code.</p>'; return; }
      try { box.innerHTML = await qrSvg(t); } catch { box.innerHTML = '<p class="small" style="color:var(--bad);margin:0">That’s too long for one code.</p>'; }
    }, 150);
  }
  async function qrPng() {
    const svg = $("#qrBox svg"); if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = 720;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 720, 720); ctx.drawImage(img, 0, 0, 720, 720);
    return new Promise((r) => c.toBlob(r, "image/png"));
  }

  /* ================= MORE (hub) ================= */
  function moreView(extraTiles) {
    const t = today();
    const je = S.journal.entries.find((e) => e.date === t);
    const soonDocs = S.docs.items.filter((d) => d.expires && daysUntil(d.expires) <= 60).length;
    const nextCd = cds().filter((c) => c.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
    const focusToday = (S.focus.sessions || []).filter((x) => x.date === t).reduce((a, x) => a + x.mins, 0);
    const IC = {
      journal: '<path d="M5 3.5h11a3 3 0 013 3v14H8a3 3 0 01-3-3z"/><path d="M5 17.5a3 3 0 013-3h11M9 8h6"/>',
      lists: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01" stroke-width="2.6"/>',
      review: '<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
      notes: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
      docs: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14.5 10h3M14.5 13.5h3"/>',
      countdowns: '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M12 13v3"/>',
      calc: '<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
      fincalc: '<path d="M4 19h16M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>',
      convert: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
      qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    };
    const tile = (r, n, sub, alert) => `<a class="tile${alert ? " alert" : ""}" href="#${r}"><svg viewBox="0 0 24 24">${IC[r]}</svg><b>${n}</b><span>${esc(sub)}</span></a>`;
    const group = (title, tiles) => `<h3 class="more-h">${title}</h3><div class="tiles">${tiles.join("")}</div>`;
    return group("Every day", [
      tile("journal", "Journal", je && (je.text || je.mood) ? "Written today" : "Not written today"),
      tile("focus", "Focus timer", timer ? (timer.kind === "work" ? "Running: " + mmss(remaining()) : "On a break") : focusToday ? `${focusToday} min today` : "Pomodoro sessions"),
      tile("lists", "Lists", extraTiles.lists),
      tile("notes", "Notes", plural(S.notes.items.length, "note")),
    ]) + group("Life admin", [
      tile("docs", "Documents", soonDocs ? `${plural(soonDocs, "renewal")} due soon` : plural(S.docs.items.length, "document"), soonDocs),
      tile("countdowns", "Countdowns", nextCd ? `${daysUntil(nextCd.date)}d to ${nextCd.title}` : "Trips, deadlines"),
      tile("review", "Weekly review", extraTiles.review),
    ]) + group("Tools", [
      tile("fincalc", "Money calculators", "Loan cost, savings, tax"),
      tile("calc", "Calculator", "Split bills, VAT, % change"),
      tile("convert", "Converters", "Units, land, fuel, currency"),
      tile("clock", "World clock", "Plan calls across time zones"),
      tile("qr", "QR codes", "Account details, Wi-Fi"),
    ]) + group("App", [tile("settings", "Settings", "Notifications, calendar, Siri")]) +
      `<p class="small muted" style="margin:0">Search everything with the magnifier at the top of any screen.</p>`;
  }

  /* ================= Today additions ================= */
  function todayBits() {
    const pins = cds().filter((c) => c.pin && daysUntil(c.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
    const docs = S.docs.items.filter((d) => d.expires && daysUntil(d.expires) <= 30);
    let h = "";
    if (pins.length) h += `<div class="cd-strip">${pins.map((c) => { const n = daysUntil(c.date); return `<a class="cd-mini" href="#countdowns"><b>${n}</b><span>${n === 0 ? "today" : n === 1 ? "day" : "days"} to ${esc(c.title)}</span></a>`; }).join("")}</div>`;
    if (docs.length) h += section("Renewals", `<div class="list">${docs.map((d) => { const [cls, txt] = docStatus(d); return `<div class="item"><button class="body" data-act="docOpen" data-id="${d.id}"><div class="t">${esc(d.name || d.type)}</div><div class="m"><span class="chip ${cls}">${esc(txt)}</span></div></button></div>`; }).join("")}</div>`, `<a class="link" href="#docs">All</a>`);
    return h;
  }

  /* ================= actions & inputs ================= */
  const D = (id) => S.docs.items.find((x) => x.id === id);
  const actions = {
    fcStart: () => startTimer("work"), fcBreak: () => startTimer("break"),
    fcPause: () => { if (timer && !timer.paused) { timer.paused = true; timer.pausedAt = Date.now(); persist(); X.render(); } },
    fcResume: () => { if (timer && timer.paused) { timer.end += Date.now() - timer.pausedAt; timer.paused = false; persist(); X.render(); } },
    fcStop: () => { finishTimer(false); document.title = "Toby"; X.render(); },
    docNew: () => docSheet(null),
    docOpen: (b) => { const d = D(b.dataset.id); if (d) docSheet(d); },
    docSave: (b) => {
      const v = { type: $("#dcType").value, name: $("#dcName").value.trim(), number: $("#dcNum").value.trim(), holder: $("#dcHolder").value.trim(), issued: $("#dcIssued").value, expires: $("#dcExp").value, notes: $("#dcNotes").value };
      if (!v.name) v.name = v.type;
      if (b.dataset.id) Object.assign(D(b.dataset.id), v); else S.docs.items.push({ id: newId(), ...v });
      save("docs"); X.closeSheet(); X.toast(v.expires ? `Saved. Reminders set before ${fmtDate(v.expires)}.` : "Saved");
    },
    docTask: (b) => {
      const d = D(b.dataset.id); if (!d) return;
      const due = d.expires ? (daysUntil(d.expires) > 45 ? addDays(d.expires, -45) : today()) : today();
      X.addTask({ title: `Renew ${d.name || d.type}`, date: due, pri: "high", notes: d.notes || "" });
      X.closeSheet(); X.toast("Renewal task added for " + relDay(due).toLowerCase());
    },
    docDel: (b) => X.armDelete(b, () => { S.docs.items = S.docs.items.filter((x) => x.id !== b.dataset.id); save("docs"); X.closeSheet(); }),
    cdAdd: () => {
      const title = $("#cdTitle").value.trim(), date = $("#cdDate").value;
      if (!title) { $("#cdTitle").focus(); return; } if (!date) { $("#cdDate").focus(); X.toast("Pick a date."); return; }
      S.settings.countdowns = [...cds(), { id: newId(), title, date, pin: true }]; save("settings"); X.render();
    },
    cdDel: (b) => { S.settings.countdowns = cds().filter((c) => c.id !== b.dataset.id); save("settings"); X.render(); },
    finTab: (b) => { finTab = b.dataset.v; X.render(); },
    loanMode: (b) => { loanMode = b.dataset.v; X.render(); },
    svGoalMake: () => {
      const goal = num($("#svGoal").value), have = num($("#svHave").value) || 0, by = $("#svBy").value;
      const g = { id: newId(), name: "New goal", target: goal, deadline: by || "", log: have > 0 ? [{ id: newId(), date: today(), amt: have }] : [] };
      S.savings.items.push(g); save("savings"); location.hash = "savings"; setTimeout(() => X.toast("Goal created. Give it a name in Savings."), 300);
    },
    convTab: (b) => { convTab = b.dataset.v; X.render(); },
    zoneAdd: () => { const z = $("#ckAdd").value; if (!z) return; S.settings.zones = [...zones(), z]; save("settings"); X.render(); },
    zoneDel: (b) => { S.settings.zones = zones().filter((z) => z !== b.dataset.z); save("settings"); X.render(); },
    planNow: () => { planAt = ""; X.render(); },
    qrKind: (b) => { qrKind = b.dataset.v; X.render(); },
    qrCopy: () => { const t = qrText(); if (!t) return; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => X.toast("Copied"), () => X.toast("Couldn't copy here.")); },
    qrShare: async () => {
      const blob = await qrPng().catch(() => null); if (!blob) { X.toast("Fill in the details first."); return; }
      const file = new File([blob], "qr-code.png", { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "QR code" }); return; }
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "qr-code.png"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) { if (!e || e.name !== "AbortError") X.toast("Couldn't share. Take a screenshot instead."); }
    },
  };
  let qrSaveT;
  function onInput(e) {
    const t = e.target, id = t.id;
    if (t.classList.contains("fc")) { finCalc(); return true; }
    if (t.classList.contains("cv")) { convCalc(id); return true; }
    if (t.classList.contains("qr-in")) {
      qrRender();
      clearTimeout(qrSaveT); qrSaveT = setTimeout(() => { S.settings.qr = { ...(S.settings.qr || {}), [id]: t.value }; save("settings"); }, 600);
      return true;
    }
    if (id === "daN" || id === "daStart" || id === "dbFrom" || id === "dbTo") { dateCalcs(); return true; }
    return false;
  }
  function onChange(e) {
    const t = e.target, id = t.id;
    if (id === "fcWork" || id === "fcBrk") { S.focus.prefs = { ...fset(), [id === "fcWork" ? "work" : "brk"]: +t.value }; save("focus"); X.render(); return true; }
    if (t.classList.contains("cd-pin")) { const c = cds().find((x) => x.id === t.dataset.id); if (c) { c.pin = t.checked; save("settings"); } return true; }
    if (t.classList.contains("fc")) { finCalc(); return true; }
    if (id === "cvKind") { unitKind = t.value; X.render(); return true; }
    if (t.classList.contains("cv")) { convCalc(id); return true; }
    if (id === "ckPlan") { planAt = t.value; setTimeout(() => X.render(), 0); return true; }
    if (t.classList.contains("qr-in")) { qrRender(); S.settings.qr = { ...(S.settings.qr || {}), [id]: t.value }; save("settings"); return true; }
    if (id === "dbFrom" || id === "dbTo" || id === "daStart") { dateCalcs(); return true; }
    return false;
  }
  let clockT = null;
  function after(v) {
    clearInterval(clockT); clockT = null;
    if (v === "fincalc") finCalc();
    if (v === "convert") convCalc("");
    if (v === "qr") qrRender();
    if (v === "countdowns") dateCalcs();
    if (v === "clock" && !planAt) clockT = setInterval(() => { if (location.hash === "#clock" && !X.isTyping()) X.render(); else { clearInterval(clockT); clockT = null; } }, 30000);
  }
  const searchDocs = (has) => S.docs.items.filter((d) => has(d.name, d.type, d.number, d.holder, d.notes)).map((d) => ["docOpen", d.id, d.name || d.type, docStatus(d)[1]]);

  return {
    views: { focus: focusView, docs: docsView, countdowns: countdownsView, fincalc: finView, convert: convView, clock: clockView, qr: qrView },
    titles: { focus: "Focus timer", docs: "Documents", countdowns: "Countdowns", fincalc: "Money calculators", convert: "Converters", clock: "World clock", qr: "QR codes" },
    moreView, todayBits, actions, onInput, onChange, after, searchDocs,
    stop: () => { clearInterval(tick); clearInterval(clockT); lockScreen(false); },
  };
}
