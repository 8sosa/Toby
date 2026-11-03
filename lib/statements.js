// Reading bank statements (Excel, CSV or PDF) into transactions Toby can import.
// Everything runs on the device: the statement itself is never uploaded.
//
//   readStatement(bytes, fileName, { password, pdfjs, unzip })  -> { tables, meta }
//   extractTransactions(tables, meta)                           -> { txns, account, owner }
//   analyse(txns, context)                                      -> rows ready for review

/* ================= small helpers ================= */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const titleCase = (s) =>
  clean(s).toLowerCase().replace(/(^|[\s\-/(&.'])([a-z])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(Mfb|Plc|Ltd|Nig|Gtb|Uba|Mtn|Dstv|Gotv|Pos|Atm|Nip|Vat|Bvn|Usd|Ngn)\b/g, (m) => m.toUpperCase())
    .replace(/\bOwealth\b/g, "OWealth").replace(/\bOpay\b/g, "OPay").replace(/\bKfc\b/g, "KFC");

/** "29,300.00", "₦1,200", "(500.00)", "1,000.00 DR", "--" -> number (0 when empty). */
export function parseAmount(v) {
  if (typeof v === "number") return v;
  let s = clean(v);
  if (!s || /^[-–—]+$/.test(s) || /^n\/?a$/i.test(s)) return 0;
  let neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /\bDR\b/i.test(s);
  s = s.replace(/[^\d.]/g, "");
  if (!s) return 0;
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : 0;
}

/** Dates as Nigerian banks write them. Day comes before month. Returns "YYYY-MM-DD" or "". */
export function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.getFullYear() + "-" + pad(v.getMonth() + 1) + "-" + pad(v.getDate());
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); // Excel serial date
    return d.toISOString().slice(0, 10);
  }
  const s = clean(v);
  let m;
  const ok = (y, mo, d) => (y > 1990 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? y + "-" + pad(mo) + "-" + pad(d) : "");
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ok(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/))) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return ok(y, +m[2], +m[1]); }
  if ((m = s.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,9})[\s\-/,]*(\d{2,4})\b/))) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, m[2].length > 3 && m[2].toLowerCase().startsWith("sept") ? 4 : 3)];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return mo ? ok(y, mo, +m[1]) : "";
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/))) { const mo = MONTHS[m[1].toLowerCase().slice(0, 3)]; return mo ? ok(+m[3], mo, +m[2]) : ""; }
  return "";
}

/* ================= readers ================= */
const xmlText = (s) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** A minimal .xlsx reader (all sheets). `unzip` is fflate's unzipSync. */
export function readXlsx(bytes, unzip) {
  const files = unzip(bytes);
  const dec = new TextDecoder();
  const get = (p) => (files[p] ? dec.decode(files[p]) : "");
  const shared = [];
  for (const si of get("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(xmlText(si[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "")));
  const rels = {};
  for (const r of get("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (r[0].match(/Id="([^"]+)"/) || [])[1], target = (r[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) rels[id] = "xl/" + target.replace(/^\/?xl\//, "").replace(/^\//, "");
  }
  const sheets = [];
  for (const s of get("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = xmlText((s[0].match(/name="([^"]*)"/) || [])[1] || "Sheet");
    const rid = (s[0].match(/r:id="([^"]+)"/) || [])[1];
    const path = rels[rid] || "xl/worksheets/sheet" + (sheets.length + 1) + ".xml";
    const rows = [];
    for (const row of get(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], body = c[2] || "";
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
        const t = (attrs.match(/t="([^"]+)"/) || [])[1];
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = null;
        if (t === "s") val = shared[+v] ?? "";
        else if (t === "inlineStr") val = xmlText((body.match(/<is>([\s\S]*?)<\/is>/) || [])[1] || "");
        else if (t === "str" || t === "b") val = v != null ? xmlText(v) : "";
        else if (v != null) val = isFinite(+v) ? +v : xmlText(v);
        cells[ref ? colIndex(ref) : cells.length] = val;
      }
      rows.push(Array.from(cells, (x) => (x === undefined ? null : x)));
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/** CSV with quotes, commas or semicolons. */
export function readCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : (firstLine.match(/\t/g) || []).length > 1 ? "\t" : ",";
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return [{ name: "Statement", rows: rows.filter((r) => r.some((c) => clean(c))) }];
}

/**
 * Turns a PDF statement into table rows by lining text up under the column headings.
 * Wrapped descriptions (several lines per transaction) are joined back together.
 */
export async function readPdf(bytes, pdfjs, password) {
  const doc = await pdfjs.getDocument({ data: bytes, password: password || undefined, isEvalSupported: false, useSystemFonts: true }).promise;
  const metaLines = [];
  let columns = null, out = [], open = null, lastY = null, lineH = 10;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 8 }));
    // Group into lines from top to bottom.
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, it.h * 0.35));
      if (line) line.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    lastY = null;

    for (const line of lines) {
      const text = line.items.map((i) => i.s).join(" ");
      const isHeader = /date/i.test(text) && /(debit|withdraw|money out|dr\b)/i.test(text) && /(credit|deposit|money in|cr\b)/i.test(text);
      if (isHeader) {
        // Merge words that belong to one heading ("Post" + "Date").
        const merged = [];
        for (const it of line.items) {
          const prev = merged[merged.length - 1];
          if (prev && it.x - (prev.x + prev.w) < Math.max(4, it.h * 0.6)) { prev.s += " " + it.s; prev.w = it.x + it.w - prev.x; }
          else merged.push({ ...it });
        }
        columns = merged.map((m) => ({ label: clean(m.s), x: m.x, r: m.x + m.w }));
        lineH = line.items[0].h * 1.25;
        open = null; lastY = null;
        continue;
      }
      if (!columns) { metaLines.push(text); continue; }

      const cells = columns.map(() => []);
      const numericCols = columns.map((c, i) => (/(debit|credit|balance|amount|withdraw|deposit|money)/i.test(c.label) ? i : -1)).filter((i) => i >= 0);
      for (const it of line.items) {
        // Money looks like 1,200.00 or 150.00. Long reference numbers don't.
        const isNum = /^[-(]?[₦N$]?\s?(\d{1,3}(,\d{3})+|\d{1,7})(\.\d{1,2})?\)?\s?(CR|DR)?$/i.test(it.s.trim());
        let idx = -1;
        if (isNum && numericCols.length) {
          // Numbers are right-aligned: match on the right edge.
          const right = it.x + it.w;
          idx = numericCols.reduce((best, i) => (Math.abs(columns[i].r - right) < Math.abs(columns[best].r - right) ? i : best), numericCols[0]);
          if (Math.abs(columns[idx].r - right) > 30) idx = -1;
        }
        if (idx < 0) {
          for (let i = columns.length - 1; i >= 0; i--) if (it.x >= columns[i].x - 6) { idx = i; break; }
          if (idx < 0) idx = 0;
        }
        cells[idx].push(it.s);
      }
      const row = cells.map((c) => clean(c.join(" ")));
      // A new transaction starts with a date in the first column; dates inside a wrapped description don't count.
      const startsWithDate = !!parseDate(row[0] || "");
      const gapOk = lastY != null && lastY - line.y < lineH * 2.2;
      if (startsWithDate) {
        open = row; out.push(row); lastY = line.y;
      } else if (open && gapOk && !/page \d+ of \d+/i.test(text)) {
        // A wrapped line: add its text to the transaction above.
        row.forEach((v, i) => { if (v && !numericCols.includes(i)) open[i] = clean(open[i] + " " + v); });
        lastY = line.y;
      } else {
        open = null;
        metaLines.push(text); // footers often name the bank
      }
    }
  }
  if (!columns) throw new Error("Couldn't find the transaction table in this PDF. If it's a scanned image, ask your bank for a CSV or Excel statement instead.");
  return { sheets: [{ name: "Statement", rows: [columns.map((c) => c.label), ...out] }], metaText: metaLines.join("\n") };
}

/** Reads any supported statement file. */
export async function readStatement(bytes, fileName, { password, pdfjs, unzip }) {
  const name = String(fileName || "").toLowerCase();
  const head = new Uint8Array(bytes.slice ? bytes.slice(0, 5) : bytes).subarray(0, 5);
  const sig = String.fromCharCode(...head);
  if (sig.startsWith("%PDF") || name.endsWith(".pdf")) {
    const r = await readPdf(new Uint8Array(bytes), pdfjs, password);
    return { sheets: r.sheets, metaText: r.metaText, fileName };
  }
  if (sig.startsWith("PK")) return { sheets: readXlsx(new Uint8Array(bytes), unzip), metaText: "", fileName };
  if (name.endsWith(".xls") && head[0] === 0xd0) throw new Error("This is an old-style Excel file (.xls). Open it and save it as .xlsx or CSV, then import that.");
  return { sheets: readCsv(new TextDecoder().decode(bytes)), metaText: "", fileName };
}

/* ================= columns & transactions ================= */
const H = {
  date: /^(trans(action)?\.?\s*date|post(ing)?\s*date|txn\.?\s*date|date|transaction\s*time|trans\.?\s*time|tran date|date\s*\/\s*time|book(ing)?\s*date)/i,
  value: /^value\s*date/i,
  desc: /(narration|description|details|remark|particulars|transaction details|memo|beneficiary)/i,
  debit: /(debit|withdrawal|money\s*out|paid\s*out|^dr\b|outflow)/i,
  credit: /(credit|deposit|money\s*in|paid\s*in|^cr\b|inflow|lodgement)/i,
  amount: /^(amount|transaction amount|amt)/i,
  balance: /balance/i,
  ref: /(ref|reference|cheque|session)/i,
  dir: /^(type|dr\s*\/\s*cr|direction|cr\/dr)$/i,
};

export function detectColumns(row) {
  const cells = row.map((c) => clean(c));
  const find = (re, not = []) => cells.findIndex((c, i) => c && re.test(c) && !not.includes(i));
  const map = {};
  map.date = cells.findIndex((c) => c && H.date.test(c) && !H.value.test(c));
  if (map.date < 0) map.date = find(H.value);
  map.desc = find(H.desc);
  map.debit = find(H.debit, [map.date]);
  map.credit = find(H.credit, [map.date, map.debit]);
  map.amount = map.debit < 0 && map.credit < 0 ? find(H.amount) : -1;
  map.balance = find(H.balance);
  map.ref = find(H.ref, [map.desc]);
  map.dir = find(H.dir);
  const ok = map.date >= 0 && (map.debit >= 0 || map.credit >= 0 || map.amount >= 0);
  return ok ? map : null;
}

const BANKS = [
  ["OPay", /\bopay\b|owealth/i], ["Access", /access\s*bank|\baccess\b/i], ["GTBank", /gtbank|guaranty trust/i], ["Zenith", /zenith/i],
  ["UBA", /\buba\b|united bank for africa/i], ["First Bank", /first\s*bank/i], ["Kuda", /\bkuda\b/i], ["Moniepoint", /moniepoint/i],
  ["PalmPay", /palmpay/i], ["Wema", /\bwema\b|\balat\b/i], ["FCMB", /\bfcmb\b|first city monument/i], ["Fidelity", /fidelity/i],
  ["Sterling", /sterling/i], ["Stanbic", /stanbic/i], ["Union Bank", /union\s*bank/i], ["Polaris", /polaris/i], ["Ecobank", /ecobank/i],
];

/** Finds the transaction table in each sheet and reads its rows. */
export function extractTransactions(read) {
  const txns = [];
  const accounts = [];
  let owner = "";
  const allText = [read.fileName, read.metaText, ...read.sheets.map((s) => s.name + " " + s.rows.slice(0, 12).map((r) => r.join(" ")).join(" "))].join(" ");
  const bank = (BANKS.find(([, re]) => re.test(allText)) || ["Bank"])[0];
  const metaOwner = (read.metaText || "").match(/account\s*name\s*:?\s*([A-Z][A-Za-z .'-]{3,60})/i);
  if (metaOwner) owner = clean(metaOwner[1]).replace(/\s+(product|account|currency).*$/i, "");

  for (const sheet of read.sheets) {
    let headerAt = -1, map = null;
    for (let i = 0; i < Math.min(sheet.rows.length, 60); i++) {
      const m = detectColumns(sheet.rows[i] || []);
      if (m) { headerAt = i; map = m; break; }
    }
    if (!map) continue;
    // Details above the table: account name and type.
    let kind = "";
    for (const r of sheet.rows.slice(0, headerAt)) {
      for (let c = 0; c < r.length; c++) {
        const k = clean(r[c]).toLowerCase();
        if (/^account\s*name:?$/.test(k) && clean(r[c + 1])) owner = owner || clean(r[c + 1]);
        if (/^(account\s*type|product\s*name):?$/.test(k) && clean(r[c + 1])) kind = clean(r[c + 1]).replace(/\s*account$/i, "");
      }
    }
    if (!kind && read.sheets.length > 1) kind = clean(sheet.name).replace(/\s*(account)?\s*transactions?$/i, "");
    const account = clean(bank + (kind ? " " + titleCase(kind) : ""));
    accounts.push(account);

    for (const r of sheet.rows.slice(headerAt + 1)) {
      if (!r) continue;
      const date = parseDate(r[map.date]);
      if (!date) continue;
      let out = map.debit >= 0 ? Math.abs(parseAmount(r[map.debit])) : 0;
      let inn = map.credit >= 0 ? Math.abs(parseAmount(r[map.credit])) : 0;
      if (map.amount >= 0) {
        const a = parseAmount(r[map.amount]);
        const dir = map.dir >= 0 ? clean(r[map.dir]).toLowerCase() : "";
        if (/^(d|dr|debit|out)/.test(dir) || (!dir && a < 0)) out = Math.abs(a); else inn = Math.abs(a);
      }
      if (!out && !inn) continue;
      const desc = clean(map.desc >= 0 ? r[map.desc] : r.filter((c, i) => i !== map.date && typeof c === "string").join(" "));
      const time = (clean(r[map.date]).match(/\b(\d{1,2}:\d{2})(:\d{2})?\b/) || [])[1] || "";
      const ref = map.ref >= 0 ? clean(r[map.ref]) : "";
      const base = { date, time, desc, ref, account, balance: map.balance >= 0 ? parseAmount(r[map.balance]) : null };
      if (out) txns.push({ ...base, type: "out", amt: Math.round(out * 100) / 100 });
      if (inn) txns.push({ ...base, type: "in", amt: Math.round(inn * 100) / 100 });
    }
  }
  if (!txns.length) throw new Error("Couldn't find any transactions in this file. Check it's a statement with dates and amounts, or try the CSV or Excel version.");
  txns.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  return { txns, owner, accounts: [...new Set(accounts)], bank };
}

/* ================= understanding each line ================= */
const OWN_MOVES = /owealth (withdrawal|deposit)|auto-?save to owealth|to owealth balance|savings?\s*(top.?up|withdrawal)|target savings|safebox|spend\s*(and|&)\s*save|fixed deposit|piggyvest|cowrywise|sweep (to|from)|internal transfer|transfer between (my|own) accounts|own account transfer/i;
const CHARGE = /stamp\s*duty|\bvat\b|commission|levy|sms\s*(alert|charge|notification)|maintenance\s*(fee|charge)|card\s*(issuance|maintenance|fee)|transfer\s*fee|service\s*charge|\bcharges?\b|\bfee\b|cot\b|account\s*maintenance/i;
const INTEREST = /interest\s*(earned|credit|paid|payment)|\bint\.?\s*cr|owealth interest/i;
const LOAN = /\bloan\b|easemoni|fairmoney|carbon\b|palmcredit|renmoney|quickcheck|branch international|aella|okash|lcredit/i;
const REVERSAL = /^(reversal|rvsl|reversed|rev\b)|\breversal\b|refund/i;

const CATS = [
  ["Food", /chowdeck|glovo|heyfood|jumia\s*food|\bkfc\b|domino|chicken republic|mr\.? ?bigg|kilimanjaro|sweet sensation|cold\s*stone|breadline|bakery|bakes|restaurant|catering|kitchen|eatery|\bfood|suya|shawarma|grill|\bcafe|coffee|supermarket|super saver|shoprite|\bspar\b|justrite|grocer|market square|prince ebeano|hubmart|\bfoodco|lunch|dinner|breakfast/i],
  ["Transport", /\bbolt\b|\buber\b|indrive|rida\b|taxi|\bfuel|petrol|filling station|totalenergies|\bmobil\b|oando|conoil|ardova|nnpc|parking|\btoll|lcc\b|cowry card|gig\s*m|abc transport|air peace|arik|ibom air|flight|okada|keke/i],
  ["Bills", /airtime|mobile data|data (plan|bundle)|\bmtn\b|airtel|\bglo\b|9mobile|electric|buypower|ikedc|ekedc|aedc|phed|ibedc|kaduna electric|prepaid|dstv|gotv|multichoice|startimes|showmax|netflix|spotify|apple\.com|icloud|google (play|storage|one)|youtube|\binternet|wi-?fi|spectranet|\bsmile\b|starlink|\brent\b|lawma|water (bill|corp)|voucher package/i],
  ["Health", /pharmac|\bpharma|medplus|hospital|clinic|\blab\b|diagnostic|fitness|\bgym\b|health\s*care|healthcare|dental|optical/i],
  ["Shopping", /jumia|konga|amazon|aliexpress|temu|shein|superstore|\bstores?\b|boutique|\bmall\b|fashion|clothing|slot\b|pointek|\bmart\b|paystack|flutterwave/i],
  ["Fun", /betting|sportybet|bet9ja|betking|1xbet|nairabet|merrybet|cinema|filmhouse|genesis|\bgame|playstation|steam|\bclub\b|lounge|\bbar\b|ticket|event/i],
  ["Work", /printing|domain|hosting|vercel|github|\baws\b|workspace|\bzoom\b|canva|figma|openai|anthropic|claude|notion/i],
];

/** Who the money went to or came from, as readable text. */
export function describe(desc, type) {
  const d = clean(desc);
  const parts = d.split(/\s*\|\s*/).map(clean).filter(Boolean);
  let m;
  // OPay style: "Transfer to NAME | Bank | 1234567890 | remark"
  if ((m = d.match(/^transfer\s+(to|from)\s+([^|]+)/i))) {
    const name = clean(m[2]).replace(/^[A-Z]{2,6}\//, "").replace(/_\w*\d\w*$/, "");
    const remark = parts.length > 3 ? parts.slice(3).join(" ") : "";
    const nice = /nip|transfer (to|from)|trf|mobile trf/i.test(remark) || remark.length < 3 ? "" : remark;
    return { who: name, note: (m[1].toLowerCase() === "to" ? "To " : "From ") + titleCase(name) + (nice ? " · " + nice : "") };
  }
  // Access style: "TRF/FRM A TO B", "MOBILE TRF TO PAY/ /NAME", "Transfer from NAME"
  if ((m = d.match(/^trf\s*\/*\s*frm\s+(.+?)\s+to\s+(.+)$/i))) {
    const who = type === "in" ? m[1] : m[2];
    return { who, note: (type === "in" ? "From " : "To ") + titleCase(who) };
  }
  if ((m = d.match(/(?:mobile\s+)?(?:trf|transfer)\s+to\s+\w{2,5}\s*\/\s*\/?\s*(.+)$/i))) {
    let who = clean(m[1]);
    if (who.includes(" - ")) who = who.split(" - ").pop();
    who = who.replace(/-\d{6,}$/, "");
    return { who, note: "To " + titleCase(who) };
  }
  if ((m = d.match(/^(?:nip|nibss|ft|trf|transfer)[\s:/-]*(?:from|frm)\s*:?\s*(.+)$/i))) return { who: clean(m[1]), note: "From " + titleCase(m[1]) };
  if ((m = d.match(/^(?:nip|nibss|ft|trf|transfer)[\s:/-]*to\s*:?\s*(.+)$/i))) return { who: clean(m[1]), note: "To " + titleCase(m[1]) };
  if ((m = d.match(/bills?\s*pymt\s*\/\s*(\w+)/i))) return { who: m[1], note: titleCase(m[1]) + " bill payment" };
  // OPay products
  if (/^airtime/i.test(d)) return { who: parts[2] || "Airtime", note: (parts[2] ? titleCase(parts[2]) + " " : "") + "airtime" };
  if (/^mobile data/i.test(d)) return { who: parts[2] || "Data", note: (parts[2] ? titleCase(parts[2]) + " " : "") + "data" + (parts[3] ? " · " + parts[3] : "") };
  if (/^electricity/i.test(d)) { const disco = (parts[2] || "").replace(/_/g, " ").replace(/^capricorn\s*/i, ""); return { who: "electricity", note: "Electricity" + (disco ? " · " + titleCase(disco) : "") + (parts[3] ? " · " + parts[3] : "") }; }
  if (/^betting/i.test(d)) return { who: parts[2] || "betting", note: titleCase(parts[2] || "Betting") };
  if (/card payment|merchant order|pos\b|web purchase|pos purchase/i.test(parts[0] || d)) {
    const merchant = [...parts.slice(1)].reverse().find((p) => /[a-z]{3}/i.test(p) && !/^[A-Z0-9]{6,}$/.test(p) && (p.match(/\d/g) || []).length < p.length / 3) || parts[1] || d;
    return { who: merchant, note: titleCase(merchant.replace(/\s{2,}/g, " ")) };
  }
  return { who: parts[0] || d, note: titleCase(parts.length > 1 ? parts.slice(0, 2).join(" · ") : d).slice(0, 80) };
}

export const ruleKey = (who) => clean(who).toLowerCase().replace(/[^a-z ]/g, " ").replace(/\b(ltd|limited|plc|nig|nigeria|enterprises?|ventures?|services?|global|mfb|bank)\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

export const nameTokens = (names) => [...new Set(names.flatMap((n) => clean(n).toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2)))];

export function isOwnName(who, ownerTokens) {
  if (!ownerTokens.length) return false;
  const toks = new Set(clean(who).toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2));
  const hits = ownerTokens.filter((t) => toks.has(t)).length;
  return hits >= Math.min(2, ownerTokens.length);
}

export function guessCategory(text, type) {
  if (type === "in") {
    if (/salary|payroll|wages?\b|stipend|allowance/i.test(text)) return "Salary";
    if (/refund|reversal|cashback/i.test(text)) return "Refund";
    if (/interest/i.test(text)) return "Interest";
    return "Transfer";
  }
  for (const [cat, re] of CATS) if (re.test(text)) return cat;
  return "Transfers";
}

/**
 * Decides what each transaction is and whether it should be imported.
 * context: { owners: string[], rules: {key: category|"__own"}, existing: money entries, bills }
 */
export function analyse(txns, ctx) {
  const ownerTokens = [...new Set(ctx.owners.flatMap((n) => clean(n).toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2)))];
  const rules = ctx.rules || {};
  const imported = new Set((ctx.existing || []).flatMap((e) => [e.imp, ...(e.imps || [])]).filter(Boolean));
  const manual = (ctx.existing || []).filter((e) => !e.imp && !e.imps);
  const rows = txns.map((t, i) => {
    const { who, note } = describe(t.desc, t.type);
    const key = ruleKey(who);
    const imp = [t.account, t.date, t.time, t.type, t.amt, t.ref || clean(t.desc).slice(0, 60)].join("|");
    let kind = t.type === "in" ? "income" : "spend", cat = "", reason = "";
    const head = clean(t.desc.split("|")[0]); // the first part; later parts are bank names and account numbers
    if (OWN_MOVES.test(t.desc)) { kind = "own"; reason = "Between your " + t.account.split(" ")[0] + " accounts"; }
    else if (t.type === "out" && CHARGE.test(t.desc) && !/^transfer to/i.test(t.desc)) { kind = "charge"; cat = "Charges"; }
    else if (t.type === "in" && INTEREST.test(t.desc)) { kind = "interest"; cat = "Interest"; }
    else if (LOAN.test(head)) { kind = "loan"; reason = t.type === "in" ? "Loan received" : "Loan repayment"; }
    else if (t.type === "in" && REVERSAL.test(head)) { kind = "reversal"; reason = "Refund or reversal"; }
    else if (rules[key] === "__own" || isOwnName(who, ownerTokens)) { kind = "own"; reason = "Transfer between your accounts"; }
    if (!cat && (kind === "spend" || kind === "income")) {
      // The cleaned-up name says most ("Purple Heart Superstores"); fall back to the full description.
      const dflt = t.type === "in" ? "Transfer" : "Transfers";
      cat = rules[key] && rules[key] !== "__own" ? rules[key] : guessCategory(note, t.type);
      if (cat === dflt) cat = guessCategory(t.desc, t.type);
      // Your salary: from your employer, or about your usual take-home amount.
      const sal = ctx.salary;
      if (t.type === "in" && sal && sal.amount > 0 && !rules[key]) {
        const fromEmployer = sal.source && isOwnName(who + " " + t.desc, nameTokens([sal.source]).slice(0, 2));
        if (fromEmployer || Math.abs(t.amt - sal.amount) <= sal.amount * 0.05) cat = "Salary";
      }
    }
    if (kind === "reversal") cat = "Refund";
    let include = kind === "spend" || kind === "income" || kind === "charge" || kind === "interest";
    if (imported.has(imp)) { include = false; kind = "dup"; reason = "Already imported"; }
    else if (include) {
      const twin = manual.find((e) => e.type === t.type && Math.abs(e.amt - t.amt) < 0.01 && Math.abs(Date.parse(e.date) - Date.parse(t.date)) <= 864e5);
      if (twin) { include = false; reason = "Looks like one you logged by hand"; kind = "maybe"; }
    }
    const label = kind !== "charge" ? note
      : /stamp/i.test(t.desc) ? "Stamp duty" : /\bvat\b/i.test(t.desc) ? "VAT on charges" : /commission/i.test(t.desc) ? "Transfer commission"
      : /levy/i.test(t.desc) ? "Transfer levy" : /sms/i.test(t.desc) ? "SMS alerts" : /maintenance/i.test(t.desc) ? "Account maintenance" : "Bank charge";
    return { i, ...t, who, key, note: label, imp, kind, cat, reason, include, bill: null };
  });

  // A reversal cancels the payment it reverses: skip both.
  for (const r of rows.filter((x) => x.kind === "reversal")) {
    const orig = [...rows].reverse().find((x) => x.i < r.i && x.type === "out" && (x.kind === "spend" || x.kind === "charge") && Math.abs(x.amt - r.amt) < 0.01 && Date.parse(r.date) - Date.parse(x.date) <= 14 * 864e5);
    if (orig) { orig.kind = "reversed"; orig.include = false; orig.reason = "Reversed later"; r.kind = "reversed"; r.reason = "Reverses an earlier payment"; r.include = false; }
    else { r.include = true; r.kind = "income"; r.reason = ""; }
  }

  // Payments that match a bill you track.
  for (const b of ctx.bills || []) {
    const words = clean(b.name).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
    const hit = rows.find((r) => r.include && r.type === "out" && !r.bill && Math.abs(r.amt - b.amt) <= b.amt * 0.02 && Math.abs(Date.parse(r.date) - Date.parse(b.due)) <= 6 * 864e5 && words.some((w) => (r.note + " " + r.desc).toLowerCase().includes(w)));
    if (hit) hit.bill = b.id;
  }
  return rows;
}

/** Final entries to save. Small repeated charges and interest can be folded into one line per month. */
export function toEntries(rows, { groupSmall }) {
  const out = [], groups = {};
  for (const r of rows) {
    if (!r.include) continue;
    if (groupSmall && (r.kind === "charge" || r.kind === "interest")) {
      const g = r.date.slice(0, 7) + "|" + r.account + "|" + r.kind;
      groups[g] = groups[g] || { type: r.type, amt: 0, cat: r.cat, date: r.date, account: r.account, kind: r.kind, imps: [], n: 0 };
      const x = groups[g];
      x.amt += r.amt; x.n++; x.imps.push(r.imp); if (r.date > x.date) x.date = r.date;
      continue;
    }
    out.push({ type: r.type, amt: r.amt, cat: r.cat, note: r.note, date: r.date, imp: r.imp, src: r.account, bill: r.bill || undefined });
  }
  for (const x of Object.values(groups)) {
    const [y, m] = x.date.split("-");
    const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1];
    out.push({ type: x.type, amt: Math.round(x.amt * 100) / 100, cat: x.cat, note: (x.kind === "charge" ? "Bank charges" : "Interest earned") + ` · ${x.account} · ${mon} ${y} (${x.n})`, date: x.date, imps: x.imps, src: x.account });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ================= single receipts and alerts ================= */
const AMT_RX = /(?:₦|NGN|N)\s?([\d,]+(?:\.\d{1,2})?)/i;

/**
 * Reads one transaction from a shared receipt (text extracted from the image) or a bank
 * SMS/email alert, e.g. "Debit Amt:NGN5,000.00 Acc:171**972 Desc:MOBILE TRF TO PAY/ /DANIEL ...".
 * Returns { type, amt, desc, date, who } or null when the text isn't a transaction.
 */
export function parseReceipt(raw) {
  const t = String(raw || "").replace(/\r/g, "");
  const looksLike = /receipt|transaction\s*(successful|details|no\.?|number|date|reference|type|status)|recipient|beneficiary|debit alert|credit alert|\bacc(t|ount)?\s*(no\.?|number)?\s*[:#]|\ba\/c\b|\bamt\s*[:\-]|avail(able)?\.?\s*bal|\b(debit|credit)\b[\s\S]*(₦|ngn)/i.test(t);
  if (!looksLike || !AMT_RX.test(t)) return null;
  const amtM = t.match(/(?:amount|amt)\s*[:\-]?\s*(?:₦|NGN|N)?\s?([\d,]+(?:\.\d{1,2})?)/i) || t.match(AMT_RX);
  const amt = parseFloat((amtM[1] || "").replace(/,/g, ""));
  if (!(amt > 0)) return null;
  const debitWords = /\bdebit(ed)?\b|\bDR\b|recipient|beneficiary|transfer to|paid to|purchase|payment to|withdrawal/i;
  const creditWords = /\bcredit(ed)?\b|\bCR\b|received|deposit|transfer from|sender details|from:/i;
  const type = creditWords.test(t) && !debitWords.test(t) ? "in" : "out";
  const grab = (re) => { const m = t.match(re); return m ? clean(m[1]) : ""; };
  const NAME = "([A-Za-z][A-Za-z .,'&/()-]{2,60})";
  let desc = grab(/(?:desc(?:ription)?|narration|remarks?)\s*[:\-]\s*(.+)/i);
  let who = type === "out"
    ? grab(new RegExp("(?:recipient|beneficiary)(?:\\s*(?:details|name|account name))?\\s*[:\\-]?\\s*\\n?\\s*" + NAME, "i")) || grab(new RegExp("(?:paid to|transfer to|to)\\s*[:\\-]\\s*" + NAME, "i"))
    : grab(new RegExp("(?:sender|from)(?:\\s*(?:details|name|account name))?\\s*[:\\-]?\\s*\\n?\\s*" + NAME, "i"));
  who = who.replace(/\s+(bank|opay|kuda|moniepoint|palmpay|access|gtbank|zenith|uba).*$/i, "").replace(/\s+\d.*$/, "");
  if (/^(details|name|account)$/i.test(who)) who = "";
  if (!desc) desc = who ? (type === "out" ? "Transfer to " : "Transfer from ") + who : "";
  if (!desc) {
    const merchant = grab(/(?:merchant|biller|service|product)\s*(?:name)?\s*[:\-]?\s*\n?\s*([A-Za-z][^\n]{2,40})/i);
    desc = merchant || (grab(/transaction type\s*[:\-]?\s*\n?\s*([^\n]{3,40})/i) || "Payment");
  }
  const net = (t.match(/\b(MTN|Airtel|Glo|9mobile)\b/i) || [])[1];
  if (/^(airtime|mobile data|data)/i.test(desc) && net) desc = (/data/i.test(desc) ? "Mobile Data" : "Airtime") + " | - | " + net;
  const dm = t.match(/(\d{1,2}[\/\-.](?:\d{1,2})[\/\-.]\d{2,4})|(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9},?\s+\d{4})|([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/);
  const date = dm ? parseDate(dm[0].replace(/(\d)(st|nd|rd|th)/, "$1")) : "";
  return { type, amt, desc, date, who };
}
