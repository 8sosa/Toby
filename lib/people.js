// People: groups, rich profiles, a typed contact log, what you share with each person
// (money, debts, waiting-on tasks, meetings), birthday wishes, drifting contacts and vCard import.

export function createPeople(X, H) {
  const { S, save, esc, today, parseYmd, addDays, newId, MON, MONL, fmtDate, relDay, money } = X;
  const $ = (s) => document.querySelector(s);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many || one + "s");
  const pad = (n) => String(n).padStart(2, "0");
  const daysAgo = (d) => Math.round((parseYmd(today()) - parseYmd(d)) / 864e5);
  const section = (title, body, right = "") => `<section class="card"><div class="sec-h"><h2>${title}</h2>${right}</div>${body}</section>`;
  const empty = (b, t) => `<div class="empty"><b>${b}</b>${t}</div>`;
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
  const BASE_GROUPS = ["Family", "Friends", "Clients", "Team", "Mentors"];
  const FOLLOW = [[0, "No reminder"], [7, "Every week"], [14, "Every 2 weeks"], [30, "Every month"], [90, "Every 3 months"], [180, "Every 6 months"]];
  const LOG_TYPES = [["call", "Call"], ["meet", "Met up"], ["message", "Message"], ["gift", "Gift"]];
  const DRIFT_DAYS = 90;

  const people = () => S.people.items.filter((p) => p.name);
  const groupsAll = () => [...new Set([...BASE_GROUPS, ...people().flatMap((p) => p.groups || [])])];
  const initials = (n) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const lastContact = (p) => p.last || ((p.log || []).slice(-1)[0] || {}).date || "";
  const tokens = (s) => String(s || "").toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2);
  function matches(p, text) {
    const pt = tokens(p.name); if (!pt.length) return false;
    const tt = new Set(tokens(text));
    const hits = pt.filter((t) => tt.has(t)).length;
    return hits >= Math.min(2, pt.length);
  }
  const drifting = () => people().filter((p) => { const l = lastContact(p); return l && daysAgo(l) >= DRIFT_DAYS && !(p.followEvery > 0); });

  /* ---------- what you share with someone ---------- */
  function shared(p) {
    const since = addDays(today(), -365);
    let sent = 0, sentN = 0, got = 0, gotN = 0;
    for (const e of S.money.entries) {
      if (e.date < since || !/^(to|from)\s/i.test(e.note || "")) continue;
      if (!matches(p, X.payeeOf(e))) continue;
      if (e.type === "in") { got += e.amt; gotN++; } else { sent += e.amt; sentN++; }
    }
    const owed = H.openDebts("owed").filter((d) => matches(p, d.name)).reduce((a, d) => a + H.debtBalance(d), 0);
    const owe = H.openDebts("owe").filter((d) => matches(p, d.name)).reduce((a, d) => a + H.debtBalance(d), 0);
    const waiting = S.tasks.items.filter((t) => !t.done && t.waiting && t.waiting.who && matches(p, t.waiting.who));
    const meetings = S.meetings.items.filter((m) => m.who && m.who.split(/,|&| and /i).some((w) => matches(p, w))).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return { sent, sentN, got, gotN, owed, owe, waiting, meetings };
  }

  /* ---------- list screen ---------- */
  let query = "", groupF = "All";
  function rowHtml(p) {
    const l = lastContact(p);
    const sub = [p.role, p.company].filter(Boolean).join(" · ");
    return `<div class="item"><span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span><button class="body" data-act="peOpen" data-id="${p.id}"><div class="t">${esc(p.name)}</div><div class="m">${sub ? `<span>${esc(sub)}</span>` : ""}${(p.groups || []).map((g) => `<span class="chip">${esc(g)}</span>`).join("")}${l ? `<span>${daysAgo(l) === 0 ? "Talked today" : "Last: " + esc(relDay(l))}</span>` : ""}</div></button></div>`;
  }
  function filtered() {
    const q = query.toLowerCase();
    let list = people();
    if (groupF === "Drifting") list = drifting();
    else if (groupF !== "All") list = list.filter((p) => (p.groups || []).includes(groupF));
    if (q) list = list.filter((p) => [p.name, p.role, p.company, p.notes, p.likes, p.family, p.how, ...(p.groups || [])].join(" ").toLowerCase().includes(q));
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
  function view() {
    const t = today();
    let h = `<section class="card"><div class="row"><input class="field" id="peSearch" type="search" placeholder="Search people" value="${esc(query)}" autocomplete="off"><button class="btn primary" data-act="peNew">Add</button></div>
      <div class="chips group-chips">${["All", ...groupsAll().filter((g) => people().some((p) => (p.groups || []).includes(g))), ...(drifting().length ? ["Drifting"] : [])].map((g) => `<button class="chip${groupF === g ? " acc" : ""}${g === "Drifting" ? " hi" : ""}" data-act="peGroup" data-v="${esc(g)}">${esc(g)}${g === "Drifting" ? " · " + drifting().length : ""}</button>`).join("")}</div></section>`;
    if (groupF === "All" && !query) {
      const fu = H.followUpsDue();
      if (fu.length) h += section("Time to catch up", `<div class="list">${fu.map((p) => `<div class="item" style="align-items:center"><span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span><button class="body" data-act="peOpen" data-id="${p.id}"><div class="t">${esc(p.name)}</div><div class="m"><span>${lastContact(p) ? "Last: " + esc(relDay(lastContact(p))) : "Not logged yet"}</span></div></button><button class="btn small-btn" data-act="personContacted" data-id="${p.id}">Done</button></div>`).join("")}</div>`);
      const soon = H.allDates().map((d) => ({ ...d, next: H.nextYearly(d.md, t) })).filter((d) => H.daysUntil(d.next) <= 30).sort((a, b) => a.next.localeCompare(b.next));
      if (soon.length) h += section("Coming up", `<div class="list">${soon.map((d) => { const n = H.daysUntil(d.next); return `<div class="item" style="align-items:center"><button class="body" data-act="${d.kind === "bday" ? "peOpen" : "openOccasion"}" data-id="${d.id}"><div class="t">${esc(d.title)}${d.year ? ` <span class="muted small">(${+d.next.slice(0, 4) - d.year} years)</span>` : ""}</div><div class="m"><span class="chip ${n === 0 ? "hi" : "acc"}">${n === 0 ? "Today" : H.whenText(d.next)}</span><span>${H.mdLabel(d.md)}</span></div></button>${d.kind === "bday" && n <= 3 ? `<button class="btn small-btn" data-act="peWish" data-id="${d.id}">Send wishes</button>` : ""}</div>`; }).join("")}</div>`);
    }
    const list = filtered();
    h += section(groupF === "Drifting" ? "Drifting apart" : groupF === "All" ? "Everyone" : esc(groupF), (groupF === "Drifting" ? `<p class="small muted" style="margin:0 0 6px">No contact for ${DRIFT_DAYS}+ days. A quick message keeps the relationship warm.</p>` : "") + `<div class="list" id="peList">${list.length ? list.map(rowHtml).join("") : empty(query ? "No one matches." : people().length ? "No one in this group yet." : "No one here yet.", query ? "Try another name." : "Add people, or import contacts from your phone below.")}</div>`, `<span class="small muted num">${list.length}</span>`);
    h += section("Import contacts", `<p class="small muted" style="margin:0 0 10px">On iPhone: open Contacts, select people (tap and hold, or use Lists), tap <b>Share</b>, save to Files, then pick the file here. Toby adds names, numbers, emails, birthdays and companies, and skips people you already have.</p><label class="btn file-btn" for="peVcf">Choose a contacts file (.vcf)</label><input type="file" id="peVcf" accept=".vcf,text/vcard,text/x-vcard" hidden>`);
    h += H.otherDates();
    return h;
  }

  /* ---------- profile ---------- */
  let cur = null, logType = "call";
  function profile(p) {
    cur = p.id;
    const sh = shared(p), l = lastContact(p);
    const digits = (p.phone || "").replace(/[^\d+]/g, ""), wa = digits.replace(/^\+/, "").replace(/^0/, "234");
    const [bm, bd] = (p.bday || "-").split("-");
    const snap = [
      sh.sentN ? `<div class="kv"><span class="muted">Sent in the last year</span><span class="num">${money(Math.round(sh.sent))} · ${plural(sh.sentN, "payment")}</span></div>` : "",
      sh.gotN ? `<div class="kv"><span class="muted">Received in the last year</span><span class="num">${money(Math.round(sh.got))} · ${plural(sh.gotN, "payment")}</span></div>` : "",
      sh.owed ? `<div class="kv"><span class="muted">Owes you</span><b class="num" style="color:var(--good)">${money(Math.round(sh.owed))}</b></div>` : "",
      sh.owe ? `<div class="kv"><span class="muted">You owe</span><b class="num" style="color:var(--bad)">${money(Math.round(sh.owe))}</b></div>` : "",
      sh.waiting.length ? `<div class="kv"><span class="muted">Waiting on them</span><span>${sh.waiting.map((t) => esc(t.title)).slice(0, 2).join(", ")}${sh.waiting.length > 2 ? " +" + (sh.waiting.length - 2) : ""}</span></div>` : "",
      sh.meetings.length ? `<div class="kv"><span class="muted">Meetings together</span><span>${sh.meetings.length}${sh.meetings[0].date ? " · last " + esc(relDay(sh.meetings[0].date).toLowerCase()) : ""}</span></div>` : "",
    ].join("");
    const gifts = p.gifts || [];
    X.openSheet(`<div class="pe-head"><span class="avatar big" aria-hidden="true">${esc(initials(p.name || "?"))}</span><div style="min-width:0"><h2 style="margin:0">${p.name ? esc(p.name) : "New person"}</h2><span class="small muted">${esc([p.role, p.company].filter(Boolean).join(" · "))}${l ? `${p.role || p.company ? " · " : ""}last contact ${esc(relDay(l).toLowerCase())}` : ""}</span></div></div>
      ${digits || p.email ? `<div class="btns">${digits ? `<a class="btn" href="tel:${esc(digits)}">Call</a><a class="btn" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a><a class="btn" href="sms:${esc(digits)}">SMS</a>` : ""}${p.email ? `<a class="btn" href="mailto:${esc(p.email)}">Email</a>` : ""}</div>` : ""}
      ${p.id && p.name ? `<div><h3 style="margin-bottom:6px">Log contact</h3><div class="chips">${LOG_TYPES.map(([v, l]) => `<button class="chip${logType === v ? " acc" : ""}" data-act="peLogType" data-v="${v}">${l}</button>`).join("")}</div><div class="row" style="margin-top:6px"><input class="field" id="peLogIn" placeholder="What about? (optional)" autocomplete="off" enterkeyhint="done"><button class="btn primary" data-act="peLog">Log</button></div></div>` : ""}
      ${snap ? `<div class="pe-snap">${snap}</div>` : ""}
      <input class="field" id="peName" placeholder="Name" value="${esc(p.name)}" autocomplete="off">
      <div class="grid2"><label class="lbl">Role or relationship<input class="field" id="peRole" value="${esc(p.role || "")}" autocomplete="off"></label><label class="lbl">Company<input class="field" id="peCompany" value="${esc(p.company || "")}" autocomplete="off"></label></div>
      <div><h3 style="margin-bottom:6px">Groups</h3><div class="chips">${groupsAll().map((g) => `<button class="chip${(p.groups || []).includes(g) ? " acc" : ""}" data-act="peToggleGroup" data-v="${esc(g)}">${esc(g)}</button>`).join("")}<button class="chip" data-act="peNewGroup">+ New group</button></div></div>
      <div class="grid2"><label class="lbl">Phone<input class="field" id="pePhone" type="tel" value="${esc(p.phone || "")}" autocomplete="off"></label><label class="lbl">Email<input class="field" id="peEmail" type="email" value="${esc(p.email || "")}" autocomplete="off"></label></div>
      <div class="grid2"><label class="lbl">Birthday month<select class="field" id="peBM">${opt("", "Month", bm)}${MONL.map((m, i) => opt(pad(i + 1), m, bm)).join("")}</select></label><label class="lbl">Day<select class="field" id="peBD">${opt("", "Day", bd)}${Array.from({ length: 31 }, (_, i) => opt(pad(i + 1), i + 1, bd)).join("")}</select></label></div>
      <label class="lbl">Keep in touch<select class="field" id="peFollow">${FOLLOW.map(([v, l]) => opt(v, l, p.followEvery || 0)).join("")}</select></label>
      <label class="lbl">How you met<input class="field" id="peHow" value="${esc(p.how || "")}" placeholder="e.g. Unilag, 2015" autocomplete="off"></label>
      <label class="lbl">Family<input class="field" id="peFamily" value="${esc(p.family || "")}" placeholder="Spouse, children’s names" autocomplete="off"></label>
      <label class="lbl">Likes and dislikes<input class="field" id="peLikes" value="${esc(p.likes || "")}" placeholder="Food, football club, music" autocomplete="off"></label>
      <label class="lbl">Notes<textarea class="field" id="peNotes" style="min-height:80px">${esc(p.notes || "")}</textarea></label>
      <div><h3 style="margin-bottom:6px">Gift ideas</h3><div class="list" id="peGifts">${giftsHtml(gifts)}</div><div class="row" style="margin-top:6px"><input class="field" id="peGiftIn" placeholder="e.g. Perfume she mentioned" autocomplete="off" enterkeyhint="done"><button class="btn" data-act="peGiftAdd">Add</button></div></div>
      <div><h3 style="margin-bottom:6px">History</h3><div class="list" id="peHist">${histHtml(p)}</div></div>
      <div class="btns"><button class="btn primary" style="flex:1" data-act="closeSheet">Done</button>${p.id ? `<button class="btn danger" data-act="peDel" data-id="${p.id}">Delete</button>` : ""}</div>
      <p class="small muted" style="margin:0">Changes save as you type.</p>`,
      (s) => { if (!p.name) s.querySelector("#peName").focus(); },
      () => { const x = S.people.items.find((k) => k.id === p.id); if (x && !x.name.trim()) { S.people.items = S.people.items.filter((k) => k.id !== p.id); save("people"); } cur = null; });
  }
  const giftsHtml = (g) => g.map((x) => `<div class="item sub-row" style="align-items:center"><button class="check small${x.done ? " on" : ""}" data-act="peGiftToggle" data-id="${x.id}" aria-label="${x.done ? "Not given" : "Given"}">${X.ICON.check}</button><div class="body"><div class="t${x.done ? " muted" : ""}">${esc(x.text)}</div></div><button class="icon-btn" data-act="peGiftDel" data-id="${x.id}" aria-label="Remove">×</button></div>`).join("") || '<p class="small muted" style="margin:0">Note ideas when they come up; tick them once given.</p>';
  const TYPE_LABEL = { call: "Call", meet: "Met up", message: "Message", gift: "Gift" };
  const histHtml = (p) => (p.log || []).slice(-8).reverse().map((l) => `<div class="item"><div class="body"><div class="t small">${esc(relDay(l.date))}${l.type ? ` · ${TYPE_LABEL[l.type] || ""}` : ""}</div>${l.note ? `<div class="m">${esc(l.note)}</div>` : ""}</div></div>`).join("") || '<p class="small muted" style="margin:0">Nothing logged yet.</p>';

  function wish(p) {
    const first = p.name.split(" ")[0];
    const text = `Happy birthday, ${first}! Wishing you a wonderful year ahead, full of good health and great things.`;
    const digits = (p.phone || "").replace(/[^\d]/g, "").replace(/^0/, "234");
    X.openSheet(`<h2>Wish ${esc(first)} a happy birthday</h2><textarea class="field" id="wishText" style="min-height:100px">${esc(text)}</textarea>
      <div class="btns">${digits ? `<a class="btn primary" target="_blank" rel="noopener" id="wishWa" href="https://wa.me/${digits}?text=${encodeURIComponent(text)}" data-act="wishSent" data-id="${p.id}">WhatsApp</a><a class="btn" href="sms:${digits}&body=${encodeURIComponent(text)}" data-act="wishSent" data-id="${p.id}">SMS</a>` : ""}<button class="btn${digits ? "" : " primary"}" data-act="wishCopy">Copy</button></div>
      ${digits ? "" : `<p class="small muted" style="margin:0">Add ${esc(first)}’s phone number to send it from here.</p>`}`);
  }

  /* ---------- vCard import ---------- */
  function parseVcf(text) {
    const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
    const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
    return cards.map((c) => {
      const line = (k) => { const m = c.match(new RegExp("^" + k + "(?:;[^:\\n]*)?:(.*)$", "im")); return m ? m[1].trim().replace(/\\,/g, ",").replace(/\\;/g, ";") : ""; };
      let name = line("FN");
      if (!name) { const n = line("N").split(";"); name = [n[1], n[0]].filter(Boolean).join(" "); }
      const bdayRaw = line("BDAY").replace(/-/g, "");
      const m = bdayRaw.match(/(\d{2})(\d{2})$/);
      return { name: name.trim(), phone: line("TEL"), email: line("EMAIL"), company: line("ORG").split(";")[0], role: line("TITLE"), bday: m ? m[1] + "-" + m[2] : "", notes: line("NOTE") };
    }).filter((c) => c.name);
  }
  async function importVcf(file) {
    const list = parseVcf(await file.text());
    const have = new Set(people().map((p) => p.name.toLowerCase()));
    const phones = new Set(people().map((p) => (p.phone || "").replace(/\D/g, "").slice(-10)).filter(Boolean));
    let added = 0, skipped = 0;
    for (const c of list) {
      const ph = c.phone.replace(/\D/g, "").slice(-10);
      if (have.has(c.name.toLowerCase()) || (ph && phones.has(ph))) { skipped++; continue; }
      S.people.items.push({ id: newId(), followEvery: 0, last: "", log: [], groups: [], gifts: [], ...c });
      have.add(c.name.toLowerCase()); if (ph) phones.add(ph); added++;
    }
    save("people"); X.render();
    X.toast(list.length ? `Added ${plural(added, "person", "people")}${skipped ? `, skipped ${skipped} already here` : ""}` : "No contacts found in that file.");
  }

  /* ---------- actions & inputs ---------- */
  const P = (id) => S.people.items.find((x) => x.id === id);
  const C = () => P(cur);
  const actions = {
    peNew: () => { const p = { id: newId(), name: "", role: "", company: "", phone: "", email: "", bday: "", followEvery: 0, last: "", notes: "", log: [], groups: groupF !== "All" && groupF !== "Drifting" ? [groupF] : [], gifts: [] }; S.people.items.push(p); profile(p); },
    peOpen: (b) => { const p = P(b.dataset.id); if (p) profile(p); },
    newPerson: () => actions.peNew(),
    openPerson: (b) => actions.peOpen(b),
    peGroup: (b) => { groupF = b.dataset.v; X.render(); },
    peToggleGroup: (b) => { const p = C(); if (!p) return; const g = b.dataset.v; p.groups = (p.groups || []).includes(g) ? p.groups.filter((x) => x !== g) : [...(p.groups || []), g]; b.classList.toggle("acc"); save("people"); },
    peNewGroup: (b) => { const p = C(); if (!p) return; b.outerHTML = `<input class="field" id="peGroupIn" placeholder="Group name" style="width:150px;padding:6px 10px;font-size:14px" autocomplete="off" enterkeyhint="done">`; setTimeout(() => $("#peGroupIn") && $("#peGroupIn").focus(), 0); },
    peLogType: (b) => { logType = b.dataset.v; document.querySelectorAll("[data-act=peLogType]").forEach((x) => x.classList.toggle("acc", x === b)); },
    peLog: () => { const p = C(); if (!p) return; const el = $("#peLogIn"); p.log = [...(p.log || []), { date: today(), note: el.value.trim(), type: logType }].slice(-100); p.last = today(); el.value = ""; save("people"); $("#peHist").innerHTML = histHtml(p); X.toast(`${TYPE_LABEL[logType]} logged`); },
    peGiftAdd: () => { const p = C(), el = $("#peGiftIn"); if (!p || !el.value.trim()) { el && el.focus(); return; } p.gifts = [...(p.gifts || []), { id: newId(), text: el.value.trim(), done: false }]; el.value = ""; save("people"); $("#peGifts").innerHTML = giftsHtml(p.gifts); el.focus(); },
    peGiftToggle: (b) => { const p = C(); const g = p && (p.gifts || []).find((x) => x.id === b.dataset.id); if (!g) return; g.done = !g.done; save("people"); $("#peGifts").innerHTML = giftsHtml(p.gifts); },
    peGiftDel: (b) => { const p = C(); if (!p) return; p.gifts = (p.gifts || []).filter((x) => x.id !== b.dataset.id); save("people"); $("#peGifts").innerHTML = giftsHtml(p.gifts); },
    peDel: (b) => X.armDelete(b, () => { S.people.items = S.people.items.filter((x) => x.id !== b.dataset.id); save("people"); cur = null; X.closeSheet(true); X.render(); X.toast("Removed"); }),
    peWish: (b) => { const p = P(b.dataset.id); if (p) wish(p); },
    wishCopy: () => { const el = $("#wishText"); (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject()).then(() => X.toast("Copied"), () => { el.select(); X.toast("Selected. Use Copy from the menu."); }); },
    wishSent: (b) => { const p = P(b.dataset.id); if (p) { p.log = [...(p.log || []), { date: today(), note: "Birthday wishes", type: "message" }]; p.last = today(); save("people"); } },
  };
  let saveT;
  const FIELDS = { peName: "name", peRole: "role", peCompany: "company", pePhone: "phone", peEmail: "email", peHow: "how", peFamily: "family", peLikes: "likes", peNotes: "notes" };
  function onInput(e) {
    const id = e.target.id;
    if (id === "peSearch") { query = e.target.value; const el = $("#peList"); if (el) { const list = filtered(); el.innerHTML = list.length ? list.map(rowHtml).join("") : empty("No one matches.", "Try another name."); } return true; }
    if (FIELDS[id]) { const p = C(); if (p) { p[FIELDS[id]] = e.target.value; clearTimeout(saveT); saveT = setTimeout(() => save("people"), 400); } return true; }
    return false;
  }
  function onChange(e) {
    const id = e.target.id, p = C();
    if (id === "peVcf") { const f = e.target.files && e.target.files[0]; if (f) importVcf(f); e.target.value = ""; return true; }
    if ((id === "peBM" || id === "peBD") && p) { const m = $("#peBM").value, d = $("#peBD").value; p.bday = m && d ? m + "-" + d : ""; save("people"); return true; }
    if (id === "peFollow" && p) { p.followEvery = +e.target.value; if (p.followEvery && !p.last) p.last = today(); save("people"); return true; }
    return false;
  }
  function onEnter(e) {
    const id = e.target.id;
    if (id === "peLogIn") { e.preventDefault(); actions.peLog(); return true; }
    if (id === "peGiftIn") { e.preventDefault(); actions.peGiftAdd(); return true; }
    if (id === "peGroupIn") { e.preventDefault(); const p = C(), v = e.target.value.trim(); if (p && v) { p.groups = [...new Set([...(p.groups || []), v])]; save("people"); profile(p); } return true; }
    return false;
  }
  return { view, actions, onInput, onChange, onEnter, parseVcf };
}
