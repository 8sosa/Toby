// Understanding typed or spoken input: "Call Ada tomorrow 3pm !", "Pay rent monthly",
// "spent 5000 on lunch", "buy milk, eggs and bread". Shared by the app and the Siri endpoint.
// Dates are plain "YYYY-MM-DD" strings in the person's own time zone.

const pad = (n) => String(n).padStart(2, "0");

function parts(s) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
function fromParts(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
}
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(s, n) {
  const { y, m, d } = parts(s);
  return fromParts(y, m, d + n);
}
export function weekday(s) {
  const { y, m, d } = parts(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const REPEATS = [
  ["", "Doesn't repeat"],
  ["day", "Every day"],
  ["weekday", "Every weekday (Mon–Fri)"],
  ["week", "Every week"],
  ["2week", "Every 2 weeks"],
  ["month", "Every month"],
  ["quarter", "Every 3 months"],
  ["year", "Every year"],
];
export const repeatLabel = (r) => (REPEATS.find((x) => x[0] === r) || ["", ""])[1];

/** The next date after `s` for a repeat rule. `anchorDay` keeps "the 31st" from drifting to the 28th. */
export function nextDate(s, repeat, anchorDay) {
  const { y, m, d } = parts(s);
  const months = (n) => {
    const total = m - 1 + n;
    const ny = y + Math.floor(total / 12), nm = (total % 12) + 1;
    return fromParts(ny, nm, Math.min(anchorDay || d, daysInMonth(ny, nm)));
  };
  switch (repeat) {
    case "day": return addDays(s, 1);
    case "weekday": {
      let n = addDays(s, 1);
      while (weekday(n) === 0 || weekday(n) === 6) n = addDays(n, 1);
      return n;
    }
    case "week": return addDays(s, 7);
    case "2week": return addDays(s, 14);
    case "month": return months(1);
    case "quarter": return months(3);
    case "year": return fromParts(y + 1, m, Math.min(anchorDay || d, daysInMonth(y + 1, m)));
    default: return "";
  }
}

/** Next occurrence strictly after `today` (used when a repeating item is finished late). */
export function nextAfter(s, repeat, today, anchorDay) {
  let n = nextDate(s, repeat, anchorDay);
  let guard = 0;
  while (n && n <= today && guard++ < 1000) n = nextDate(n, repeat, anchorDay);
  return n;
}

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_RX = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?";

/** Reads a task out of free text. */
export function parseTask(raw, today) {
  let s = " " + String(raw || "") + " ", date = "", time = "", pri = "normal", repeat = "";
  if (/\s!+\s/.test(s) || /\s!\S/.test(s)) { pri = "high"; s = s.replace(/\s!+(?=\s|$)/g, " ").replace(/\s!(?=\S)/g, " "); }
  const rx = (re, fn) => { const m = s.match(re); if (m) { fn(m); s = s.replace(re, " "); return true; } return false; };
  const nextDow = (name, includeToday) => {
    const idx = DAY_NAMES.indexOf(name.toLowerCase().slice(0, 3));
    let diff = (idx - weekday(today) + 7) % 7;
    if (diff === 0 && !includeToday) diff = 0;
    return addDays(today, diff);
  };

  rx(/\s(?:every\s?weekday|weekdays|every\s+work\s?day)(?=\s)/i, () => (repeat = "weekday"));
  rx(new RegExp("\\severy\\s+" + DAY_RX + "(?=\\s)", "i"), (m) => { repeat = "week"; date = nextDow(m[1], true); });
  rx(/\s(?:every\s?day|daily|each day)(?=\s)/i, () => (repeat = "day"));
  rx(/\s(?:every\s+(?:other|2|two)\s+weeks?|fortnightly|biweekly)(?=\s)/i, () => (repeat = "2week"));
  rx(/\s(?:every\s?week|weekly)(?=\s)/i, () => (repeat = "week"));
  rx(/\s(?:every\s+(?:3|three)\s+months|quarterly)(?=\s)/i, () => (repeat = "quarter"));
  rx(/\s(?:every\s?month|monthly)(?=\s)/i, () => (repeat = "month"));
  rx(/\s(?:every\s?year|yearly|annually)(?=\s)/i, () => (repeat = "year"));

  rx(/\s(today|tonight|this evening)(?=\s)/i, () => (date = today));
  rx(/\s(tomorrow|tmr|tmrw|tomorow)(?=\s)/i, () => (date = addDays(today, 1)));
  rx(/\s(next week)(?=\s)/i, () => (date = addDays(today, 7)));
  rx(/\sin\s(\d{1,2})\s(days?|weeks?)(?=\s)/i, (m) => (date = addDays(today, +m[1] * (/week/i.test(m[2]) ? 7 : 1))));
  if (!date) rx(new RegExp("\\s(?:on\\s|next\\s)?" + DAY_RX + "(?=\\s)", "i"), (m) => (date = nextDow(m[1], true)));
  rx(/\s(?:on\s)?(?:the\s)?(\d{1,2})(?:st|nd|rd|th)(?:\s+of\s+(?:the\s+)?month)?(?=\s)/i, (m) => {
    const day = +m[1];
    if (day < 1 || day > 31) return;
    const { y, m: mo, d } = parts(today);
    let ty = y, tm = mo;
    if (day < d) { tm++; if (tm > 12) { tm = 1; ty++; } }
    date = fromParts(ty, tm, Math.min(day, daysInMonth(ty, tm)));
  });

  rx(/\s(?:at\s)?(\d{1,2})(?::|\.)?(\d{2})?\s?(am|pm|a\.m\.|p\.m\.)(?=\s)/i, (m) => {
    let h = +m[1] % 12;
    if (/^p/i.test(m[3])) h += 12;
    time = pad(h) + ":" + (m[2] || "00");
  });
  if (!time) rx(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => (time = pad(+m[1]) + ":" + m[2]));
  if (!time) rx(/\s(?:at\s)?noon(?=\s)/i, () => (time = "12:00"));

  if ((time || repeat) && !date) date = today;
  const title = s.replace(/\s+/g, " ").trim().replace(/^(remind me to|remind me|todo:?|task:?|add task:?)\s+/i, "");
  return { title: title.charAt(0).toUpperCase() + title.slice(1), date, time, pri, repeat };
}

const CAT_WORDS = [
  ["Food", /lunch|dinner|breakfast|food|grocer|restaurant|snack|chops|rice|suya|shawarma|pizza|coffee|meal/i],
  ["Transport", /fuel|petrol|diesel|uber|bolt|taxi|bus|transport|parking|toll|flight|keke|okada/i],
  ["Bills", /electric|light bill|nepa|prepaid|internet|wi-?fi|dstv|gotv|startimes|rent|water bill|airtime|data|phone bill|netflix|spotify|subscription/i],
  ["Shopping", /cloth|shoe|amazon|jumia|konga|shopping|gadget/i],
  ["Health", /pharmac|drug|medic|hospital|doctor|clinic|gym|dentist/i],
  ["Fun", /movie|cinema|party|drinks|game|concert|outing/i],
  ["Family", /family|mum|mom|dad|kids|child|school fees|wife|husband/i],
  ["Work", /office|work|client|printing/i],
];
export function guessCategory(text) {
  for (const [cat, re] of CAT_WORDS) if (re.test(text)) return cat;
  return "Other";
}

const splitItems = (s) =>
  s.split(/,|\band\b|\n|;/i).map((x) => x.trim().replace(/^(some|a|an)\s+/i, "")).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1));

/**
 * Works out what a sentence is for.
 * Returns one of:
 *  { kind: "task", task }
 *  { kind: "expense", type: "out"|"in", amt, cat, note }
 *  { kind: "note", title, body }
 *  { kind: "list", list: "Shopping"|"Reading"|"Watch", items: string[] }
 */
export function classify(raw, today) {
  const text = String(raw || "").trim();
  if (!text) return null;

  if (/^https?:\/\/\S+$/i.test(text)) return { kind: "list", list: "Reading", items: [text] };

  const money = text.match(/^(spent|spend|paid|pay(?:ed)?|bought .+? for)\s+(?:₦|ngn|n|\$|£|€)?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\b\s*(?:naira)?\s*(?:on|for)?\s*(.*)$/i);
  if (money) {
    let amt = parseFloat(money[2].replace(/,/g, ""));
    if (/k/i.test(money[3] || "")) amt *= 1000;
    if (/m/i.test(money[3] || "")) amt *= 1000000;
    const note = (money[4] || "").trim().replace(/^the\s+/i, "");
    if (amt > 0) return { kind: "expense", type: "out", amt, cat: guessCategory(note), note: note.charAt(0).toUpperCase() + note.slice(1) };
  }
  const income = text.match(/^(received|earned|got paid|income)\s+(?:₦|ngn|n|\$|£|€)?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\b\s*(?:naira)?\s*(?:from|for)?\s*(.*)$/i);
  if (income) {
    let amt = parseFloat(income[2].replace(/,/g, ""));
    if (/k/i.test(income[3] || "")) amt *= 1000;
    if (/m/i.test(income[3] || "")) amt *= 1000000;
    const note = (income[4] || "").trim();
    if (amt > 0) return { kind: "expense", type: "in", amt, cat: /salary|pay ?check|wage/i.test(note) ? "Salary" : "Other", note };
  }

  const note = text.match(/^(?:note|idea)[:\-\s]+([\s\S]+)$/i);
  if (note) {
    const body = note[1].trim();
    return { kind: "note", title: body.split(/\n|[.!?](\s|$)/)[0].slice(0, 60), body };
  }

  const reading = text.match(/^(?:add\s+)?(?:to\s+)?(?:my\s+)?(?:reading list|to read|read later)[:\-\s]+(.+)$/i);
  if (reading) return { kind: "list", list: "Reading", items: splitItems(reading[1]) };
  const watching = text.match(/^(?:add\s+)?(?:to\s+)?(?:my\s+)?(?:watch ?list|to watch|watch later)[:\-\s]+(.+)$/i);
  if (watching) return { kind: "list", list: "Watch", items: splitItems(watching[1]) };

  const shop = text.match(/^(?:buy|get|pick up|shopping(?: list)?|add to (?:the )?shopping(?: list)?)[:\-\s]+(.+)$/i);
  if (shop) {
    const asTask = parseTask(text, today);
    // "Buy flowers for mum tomorrow" is a task; "buy milk, eggs and bread" is shopping.
    if (!asTask.date && !asTask.time) return { kind: "list", list: "Shopping", items: splitItems(shop[1].replace(/\s+(?:to|on|in)\s+(?:the\s+)?shopping list$/i, "")) };
    return { kind: "task", task: asTask };
  }

  const task = parseTask(text, today);
  if (!task.title) return null;
  return { kind: "task", task };
}
