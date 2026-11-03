// The "Import a bank statement" screen (Money → Import).
// Reads the file on the device, shows every transaction for review, then adds them to Money.
import { readStatement, extractTransactions, analyse, toEntries } from "./statements.js";

const SKIP_LABEL = { own: "Between your accounts", reversed: "Reversed", loan: "Loans", dup: "Already imported", maybe: "Logged by hand" };

export function createImporter(X) {
  const { S, save, esc, money, newId, fmtDate, MON } = X;
  const $ = (s) => document.querySelector(s);
  let st = fresh();
  function fresh() {
    return { phase: "pick", bytes: null, fileName: "", read: null, ex: null, rows: [], owners: "", from: "", to: "", group: true, filter: "import", show: 150, error: "", busy: false, overrides: {}, rules: {}, result: null };
  }

  async function libs() {
    const [{ unzipSync }, pdfjs] = await Promise.all([import("fflate"), import("pdfjs-dist")]);
    if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return { unzip: unzipSync, pdfjs };
  }

  async function open(password) {
    st.busy = true; st.error = ""; X.render();
    try {
      const { unzip, pdfjs } = await libs();
      st.read = await readStatement(st.bytes.slice(0), st.fileName, { password, pdfjs, unzip });
      st.ex = extractTransactions(st.read);
      const known = S.money.statementNames || [];
      st.owners = [...new Set([st.ex.owner, ...known].filter(Boolean))].join(", ");
      st.from = st.ex.txns[0].date; st.to = st.ex.txns[st.ex.txns.length - 1].date;
      st.rules = { ...(S.money.rules || {}) };
      st.overrides = {};
      reanalyse();
      st.phase = "review"; st.filter = "import"; st.show = 150;
    } catch (e) {
      if (e && e.name === "PasswordException") {
        st.phase = "password";
        st.error = e.code === 2 ? "That password didn't work. Banks often use your date of birth or the last digits of your account or phone number; check the email the statement came with." : "";
      } else {
        st.phase = "pick";
        st.error = (e && e.message) || "Couldn't read that file.";
      }
    } finally {
      st.busy = false; X.render();
    }
  }

  function reanalyse() {
    const owners = st.owners.split(",").map((s) => s.trim()).filter(Boolean);
    st.rows = analyse(st.ex.txns, { owners, rules: st.rules, existing: S.money.entries, bills: S.bills.items.filter((b) => b.active !== false) });
    for (const r of st.rows) if (r.imp in st.overrides) r.include = st.overrides[r.imp];
  }

  const inRange = (r) => r.date >= st.from && r.date <= st.to;
  const visible = () => {
    const rs = st.rows.filter(inRange);
    if (st.filter === "import") return rs.filter((r) => r.include);
    if (st.filter === "skipped") return rs.filter((r) => !r.include);
    return rs.filter((r) => r.include && (r.cat === "Transfers" || r.cat === "Transfer" || r.cat === "Other"));
  };

  /* ---------- screens ---------- */
  function view() {
    if (st.phase === "done") return doneView();
    if (st.phase === "review") return reviewView();
    if (st.phase === "password") return passwordView();
    return pickView();
  }

  function pickView() {
    const bySrc = {};
    S.money.entries.filter((e) => e.src).forEach((e) => { if (!bySrc[e.src] || e.date > bySrc[e.src]) bySrc[e.src] = e.date; });
    return `<section class="card"><div class="sec-h"><h2>Import a bank statement</h2></div>
      <p class="small muted" style="margin:0 0 12px">Add a statement from OPay, Access, GTBank, Kuda, Moniepoint or any other bank. Toby sorts each transaction into a category, skips transfers between your own accounts, and never adds the same one twice.</p>
      <label class="btn primary file-btn" for="imFile" style="width:100%">${st.busy ? "Reading…" : "Choose a statement file"}</label>
      <input type="file" id="imFile" accept=".pdf,.xlsx,.xls,.csv,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
      ${st.error ? `<p class="small" style="color:var(--bad);margin:10px 0 0">${esc(st.error)}</p>` : ""}
      <ul class="small muted plain-steps"><li><b>PDF</b> statements, including password-protected ones</li><li><b>Excel</b> (.xlsx) and <b>CSV</b> exports from banking apps</li><li>The file is read on this device and isn’t uploaded. Only the transactions you choose are saved.</li></ul></section>
      ${Object.keys(bySrc).length ? `<section class="card"><div class="sec-h"><h2>Imported so far</h2></div>${Object.entries(bySrc).map(([s, d]) => `<div class="kv"><span>${esc(s)}</span><span class="muted">up to ${esc(fmtDate(d))}</span></div>`).join("")}</section>` : ""}`;
  }

  function passwordView() {
    return `<section class="card"><div class="sec-h"><h2>This statement is locked</h2></div>
      <p class="small muted" style="margin:0 0 12px">${esc(st.fileName)} needs its password. Toby only uses it to open the file on this device.</p>
      <div class="row"><input class="field" id="imPass" type="password" autocomplete="off" placeholder="Statement password" enterkeyhint="go"><button class="btn primary" data-act="imUnlock">${st.busy ? "Opening…" : "Open"}</button></div>
      ${st.error ? `<p class="small" style="color:var(--bad);margin:10px 0 0">${esc(st.error)}</p>` : ""}
      <button class="link" data-act="imReset" style="margin-top:10px">Choose a different file</button></section>`;
  }

  function reviewView() {
    const rs = st.rows.filter(inRange);
    const inc = rs.filter((r) => r.include);
    const sum = (a, t) => a.filter((r) => r.type === t).reduce((s, r) => s + r.amt, 0);
    const entries = toEntries(inc, { groupSmall: st.group });
    const skipped = {};
    rs.filter((r) => !r.include).forEach((r) => { const k = SKIP_LABEL[r.kind] || "Unticked"; skipped[k] = (skipped[k] || 0) + 1; });
    const cats = {};
    inc.filter((r) => r.type === "out").forEach((r) => (cats[r.cat] = (cats[r.cat] || 0) + r.amt));
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const max = top.length ? top[0][1] : 1;
    const needs = inc.filter((r) => r.cat === "Transfers" || r.cat === "Transfer" || r.cat === "Other").length;

    let h = `<section class="card"><div class="sec-h"><h2>${esc(st.ex.accounts.join(" + ") || st.ex.bank)}</h2><button class="link" data-act="imReset">Start over</button></div>
      <p class="small muted" style="margin:0 0 10px">${esc(st.fileName)} · ${st.ex.txns.length.toLocaleString()} lines</p>
      <div class="grid2"><label class="lbl">From<input class="field" type="date" id="imFrom" value="${st.from}"></label><label class="lbl">To<input class="field" type="date" id="imTo" value="${st.to}"></label></div>
      <label class="lbl" style="margin-top:10px">Your name as it appears on statements<input class="field" id="imOwners" value="${esc(st.owners)}" placeholder="e.g. EMMANUEL AISOSA AMOS, EMMANUEL AMOS"><span class="small muted">Transfers to or from these names count as moving your own money, not spending.</span></label>
      <label class="row small" style="gap:8px;margin-top:10px"><input type="checkbox" id="imGroup"${st.group ? " checked" : ""}> Combine bank charges and interest into one line per month</label></section>`;

    h += `<section class="card"><div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><b style="font-size:20px;color:var(--bad)">${money(sum(inc, "out"))}</b><span>money out</span></div><div class="stat"><b style="font-size:20px;color:var(--good)">${money(sum(inc, "in"))}</b><span>money in</span></div></div>
      <p class="small" style="margin:10px 0 0"><b>${entries.length.toLocaleString()}</b> entries to add${Object.keys(skipped).length ? `, skipping ${Object.entries(skipped).map(([k, n]) => `${n.toLocaleString()} ${k.toLowerCase()}`).join(", ")}` : ""}.</p>
      ${top.length ? `<div style="margin-top:12px">${top.slice(0, 8).map(([c, v]) => `<div class="cat-row"><span>${esc(c)}</span><div class="cat-bar"><i style="width:${(v / max) * 100}%"></i></div><span class="amt">${money(Math.round(v))}</span></div>`).join("")}</div>` : ""}
      <button class="btn primary" data-act="imSave" style="width:100%;margin-top:14px"${entries.length ? "" : " disabled"}>Add ${entries.length.toLocaleString()} entries to Money</button></section>`;

    h += `<div class="seg" role="tablist">${[["import", "To add"], ["needs", "Check categories" + (needs ? ` (${needs})` : "")], ["skipped", "Skipped"]].map(([v, l]) => `<button role="tab" class="${st.filter === v ? "on" : ""}" data-act="imFilter" data-v="${v}">${l}</button>`).join("")}</div>`;
    if (st.filter === "needs") h += `<p class="small muted" style="margin:0">Payments to people land in Transfers. Pick a category once and Toby uses it for every payment to that person, now and in future imports.</p>`;

    const vis = visible();
    const shown = vis.slice(0, st.show);
    const counts = {};
    rs.forEach((r) => { if (r.key) counts[r.key + r.type] = (counts[r.key + r.type] || 0) + 1; });
    let list = "", lastMonth = "";
    for (const r of shown) {
      const mk = r.date.slice(0, 7);
      if (mk !== lastMonth) { const [y, m] = mk.split("-"); list += `<div class="group-h">${MON[+m - 1]} ${y}</div>`; lastMonth = mk; }
      const n = counts[r.key + r.type] || 1;
      const cats = r.type === "in" ? X.IN_CATS : X.OUT_CATS;
      const sel = r.kind === "own" ? "__own" : r.cat;
      list += `<div class="item im-row${r.include ? "" : " off"}"><input type="checkbox" class="im-check" data-act="imToggle" data-i="${r.i}"${r.include ? " checked" : ""} aria-label="Include">
        <div class="body"><div class="t">${esc(r.note || r.desc)}</div><div class="m"><span>${esc(fmtDate(r.date))}${r.time ? " · " + esc(r.time) : ""}</span><span>${esc(r.account)}</span>${r.reason ? `<span class="chip">${esc(r.reason)}</span>` : ""}${r.bill ? `<span class="chip acc">Pays ${esc((S.bills.items.find((b) => b.id === r.bill) || {}).name || "a bill")}</span>` : ""}${n > 1 && r.key && (r.kind === "spend" || r.kind === "income" || r.kind === "own") ? `<span>${n} like this</span>` : ""}</div>
        ${r.kind === "spend" || r.kind === "income" || r.kind === "own" ? `<select class="field im-cat" data-i="${r.i}" aria-label="Category">${cats.map((c) => `<option${c === sel ? " selected" : ""}>${esc(c)}</option>`).join("")}<option value="__own"${sel === "__own" ? " selected" : ""}>Between my accounts</option></select>` : ""}</div>
        <span class="amt${r.type === "in" ? " in" : ""}">${r.type === "in" ? "+" : "−"}${money(r.amt)}</span></div>`;
    }
    h += `<section class="card"><div class="list">${list || '<div class="empty"><b>Nothing here.</b>Try another tab or widen the dates.</div>'}</div>
      ${vis.length > shown.length ? `<button class="btn" data-act="imMore" style="width:100%;margin-top:10px">Show ${Math.min(300, vis.length - shown.length).toLocaleString()} more of ${(vis.length - shown.length).toLocaleString()}</button>` : ""}</section>`;
    return h;
  }

  function doneView() {
    const r = st.result;
    return `<section class="card"><div class="sec-h"><h2>Imported</h2></div>
      <p style="margin:0 0 6px"><b>${r.added.toLocaleString()}</b> entries added from ${esc(fmtDate(r.from))} to ${esc(fmtDate(r.to))}.</p>
      ${r.bills ? `<p class="small muted" style="margin:0 0 6px">${r.bills} bill payment${r.bills === 1 ? "" : "s"} matched and marked paid.</p>` : ""}
      ${r.rules ? `<p class="small muted" style="margin:0 0 6px">Toby remembered ${r.rules} of your category choices for next time.</p>` : ""}
      <div class="btns" style="margin-top:12px"><a class="btn primary" href="#money">See Money</a><button class="btn" data-act="imReset">Import another</button></div></section>`;
  }

  /* ---------- saving ---------- */
  function commit() {
    const rs = st.rows.filter((r) => inRange(r) && r.include);
    const entries = toEntries(rs, { groupSmall: st.group });
    const ts = Date.now();
    let bills = 0;
    for (const e of entries) {
      S.money.entries.push({ id: newId(), type: e.type, amt: e.amt, cat: e.cat, note: e.note, date: e.date, ts, src: e.src, ...(e.imp ? { imp: e.imp } : {}), ...(e.imps ? { imps: e.imps } : {}) });
      if (e.bill) {
        const b = S.bills.items.find((x) => x.id === e.bill);
        if (b && b.due <= e.date.replace(/\d{2}$/, "31")) {
          b.history = [...(b.history || []), { date: e.date, amt: e.amt }].slice(-24);
          if (b.repeat) { const { nextDate } = X.quick; b.due = nextDate(b.due, b.repeat, b.anchor); } else b.active = false;
          bills++;
        }
      }
    }
    const changed = Object.keys(st.rules).filter((k) => (S.money.rules || {})[k] !== st.rules[k]).length;
    S.money.rules = st.rules;
    const names = st.owners.split(",").map((s) => s.trim()).filter(Boolean);
    S.money.statementNames = [...new Set([...(S.money.statementNames || []), ...names])].slice(0, 8);
    save("money");
    if (bills) save("bills");
    st.result = { added: entries.length, from: st.from, to: st.to, bills, rules: changed };
    st.phase = "done";
    X.render();
    window.scrollTo(0, 0);
    X.toast(`Added ${entries.length.toLocaleString()} entries`);
  }

  /* ---------- events ---------- */
  const actions = {
    imReset: () => { st = fresh(); X.render(); },
    imUnlock: () => { const p = ($("#imPass") || {}).value || ""; if (!p) { $("#imPass").focus(); return; } open(p); },
    imFilter: (b) => { st.filter = b.dataset.v; st.show = 150; X.render(); },
    imMore: () => { st.show += 300; X.render(); },
    imSave: () => commit(),
    imToggle: (b) => {
      const r = st.rows[+b.dataset.i]; if (!r) return;
      r.include = b.checked; st.overrides[r.imp] = r.include;
      clearTimeout(st.t); st.t = setTimeout(() => X.render(), 350); // let several ticks happen before the summary updates
    },
  };
  function onChange(e) {
    const t = e.target;
    if (t.id === "imFile") {
      const f = t.files && t.files[0]; if (!f) return true;
      st.fileName = f.name; st.busy = true; X.render();
      f.arrayBuffer().then((buf) => { st.bytes = buf; open(""); }, () => { st.busy = false; st.error = "Couldn't open that file."; X.render(); });
      return true;
    }
    if (t.classList && t.classList.contains("im-cat")) {
      const r = st.rows[+t.dataset.i]; if (!r) return true;
      const v = t.value;
      if (r.key) st.rules[r.key] = v; // remembered for every payment to or from this name
      for (const x of st.rows) {
        if (x !== r && !(r.key && x.key === r.key && x.type === r.type && (x.kind === "spend" || x.kind === "income" || x.kind === "own"))) continue;
        if (v === "__own") { x.kind = "own"; x.include = false; x.reason = "Transfer between your accounts"; }
        else { if (x.kind === "own") { x.kind = x.type === "in" ? "income" : "spend"; x.reason = ""; x.include = true; } x.cat = v; }
        delete st.overrides[x.imp];
      }
      X.render();
      return true;
    }
    if (t.id === "imFrom" || t.id === "imTo") { st[t.id === "imFrom" ? "from" : "to"] = t.value || st[t.id === "imFrom" ? "from" : "to"]; X.render(); return true; }
    if (t.id === "imGroup") { st.group = t.checked; X.render(); return true; }
    if (t.id === "imOwners") { st.owners = t.value; reanalyse(); X.render(); return true; }
    return false;
  }
  function onEnter(e) {
    if (e.target.id === "imPass") { e.preventDefault(); actions.imUnlock(); return true; }
    return false;
  }

  return { view, actions, onChange, onEnter };
}
