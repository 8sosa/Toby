// Decides which notifications are due for one person right now.
// Pure functions (no database, no network) so the timing rules are easy to test.

export type Task = { id: string; title: string; date: string; time: string; pri?: string; done?: boolean; doneAt?: number };
export type Habit = { id: string; name: string };
export type Meeting = { id: string; title: string; date: string; time: string };
export type Bill = { id: string; name: string; amt: number; due: string; remind?: number; active?: boolean };
export type Person = { id: string; name: string; bday?: string; followEvery?: number; last?: string };
export type Occasion = { id: string; title: string; md: string; remind?: number };
export type Event = { title: string; start: string; allDay: boolean };
export type Debt = { id: string; name: string; dir: "owe" | "owed"; amount: number; due?: string; log?: { amt: number; kind?: string }[] };
export type NotifyPrefs = {
  briefOn: boolean; brief: string; lead: number; eveOn: boolean; eve: string;
  billsOn: boolean; datesOn: boolean; reviewOn: boolean; reviewDay: number; review: string;
};
export type Notice = { ref: string; title: string; body: string; url: string; tag: string };

export const DEFAULT_PREFS: NotifyPrefs = {
  briefOn: true, brief: "08:00", lead: 0, eveOn: true, eve: "20:00",
  billsOn: true, datesOn: true, reviewOn: true, reviewDay: 0, review: "18:00",
};

/** How late a notification may still go out if a scheduled check was missed. */
const TASK_WINDOW_MIN = 20;
const DAILY_WINDOW_MIN = 90;
const BIRTHDAY_LEAD_DAYS = 3;

export function readPrefs(raw: unknown): NotifyPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<NotifyPrefs>;
  const time = (v: unknown, d: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    briefOn: bool(p.briefOn, DEFAULT_PREFS.briefOn),
    brief: time(p.brief, DEFAULT_PREFS.brief),
    lead: typeof p.lead === "number" && p.lead >= -1 && p.lead <= 1440 ? p.lead : DEFAULT_PREFS.lead,
    eveOn: bool(p.eveOn, DEFAULT_PREFS.eveOn),
    eve: time(p.eve, DEFAULT_PREFS.eve),
    billsOn: bool(p.billsOn, DEFAULT_PREFS.billsOn),
    datesOn: bool(p.datesOn, DEFAULT_PREFS.datesOn),
    reviewOn: bool(p.reviewOn, DEFAULT_PREFS.reviewOn),
    reviewDay: typeof p.reviewDay === "number" && p.reviewDay >= 0 && p.reviewDay <= 6 ? p.reviewDay : DEFAULT_PREFS.reviewDay,
    review: time(p.review, DEFAULT_PREFS.review),
  };
}

/** The wall-clock date and time in a time zone, e.g. { date: "2026-10-30", time: "08:05" }. */
export function localNow(now: Date, timeZone: string) {
  let tz = timeZone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = "UTC"; }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, tz };
}

/** Minutes on a single line for comparing local times ("YYYY-MM-DD", "HH:MM"). */
function minutes(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) / 60000;
}
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const weekday = (s: string) => new Date(s + "T00:00:00Z").getUTCDay();
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h >= 12 ? "pm" : "am"}`;
}
function list(items: string[], max = 4) {
  const shown = items.slice(0, max).join(" · ");
  return items.length > max ? `${shown} · +${items.length - max} more` : shown;
}
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const whenIn = (n: number, date: string) => (n === 0 ? "today" : n === 1 ? "tomorrow" : n < 7 ? "on " + DAYS[weekday(date)] : `in ${n} days`);

/** Next date (on or after today) for a yearly "MM-DD". */
function nextYearly(md: string, today: string) {
  const y = +today.slice(0, 4);
  const [m, d] = md.split("-").map(Number);
  const fit = (yy: number) => {
    const last = new Date(Date.UTC(yy, m, 0)).getUTCDate();
    return `${yy}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  };
  const thisYear = fit(y);
  return thisYear >= today ? thisYear : fit(y + 1);
}

/** Whether the morning briefing is due now (so calendar events only get fetched when needed). */
export function briefingDue(now: Date, timeZone: string, prefs: NotifyPrefs) {
  const { date, time } = localNow(now, timeZone);
  const at = minutes(date, prefs.brief), n = minutes(date, time);
  return prefs.briefOn && at <= n && at > n - DAILY_WINDOW_MIN;
}

/** Start time of an event in the person's time zone ("HH:MM"), or "" for all-day. */
function eventTime(e: Event, tz: string) {
  if (e.allDay) return "";
  return localNow(new Date(e.start), tz).time;
}
function eventOn(e: Event, day: string, tz: string) {
  if (e.allDay) return e.start.slice(0, 10) === day;
  return localNow(new Date(e.start), tz).date === day;
}

export function dueNotices(input: {
  now: Date;
  timeZone: string;
  tasks: Task[];
  habits: Habit[];
  habitLog: Record<string, string[]>;
  prefs: NotifyPrefs;
  meetings?: Meeting[];
  bills?: Bill[];
  people?: Person[];
  occasions?: Occasion[];
  events?: Event[];
  debts?: Debt[];
  limits?: Record<string, number>;
  spentByCat?: Record<string, number>;
  money?: (n: number) => string;
}): Notice[] {
  const { date: today, time, tz } = localNow(input.now, input.timeZone);
  const nowMin = minutes(today, time);
  const fmtMoney = input.money || ((n: number) => n.toLocaleString("en-US"));
  const open = input.tasks.filter((t) => t && !t.done && typeof t.title === "string");
  const meetings = (input.meetings || []).filter((m) => m && typeof m.title === "string");
  const bills = (input.bills || []).filter((b) => b && b.active !== false && /^\d{4}-\d{2}-\d{2}$/.test(b.due || ""));
  const people = (input.people || []).filter((p) => p && typeof p.name === "string");
  const out: Notice[] = [];

  const inDailyWindow = (at: string) => {
    const fireAt = minutes(today, at);
    return fireAt <= nowMin && fireAt > nowMin - DAILY_WINDOW_MIN;
  };

  // 1. Reminders at (or before) each timed task and meeting.
  if (input.prefs.lead >= 0) {
    const timed: { id: string; title: string; date: string; time: string; pri?: string; kind: string }[] = [
      ...open.map((t) => ({ ...t, kind: "task" })),
      ...meetings.map((m) => ({ ...m, kind: "meeting" })),
    ];
    for (const t of timed) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || "") || !/^\d{2}:\d{2}$/.test(t.time || "")) continue;
      const fireAt = minutes(t.date, t.time) - input.prefs.lead;
      if (fireAt > nowMin || fireAt <= nowMin - TASK_WINDOW_MIN) continue;
      const when = input.prefs.lead > 0 ? `Starts at ${fmtTime(t.time)}` : `Now · ${fmtTime(t.time)}`;
      out.push({
        ref: `${t.kind}:${t.id}:${t.date}T${t.time}:${input.prefs.lead}`,
        title: t.kind === "meeting" ? `Meeting: ${t.title}` : t.title,
        body: t.pri === "high" ? `${when} · Priority` : when,
        url: t.kind === "meeting" ? "/#plan" : "/#plan",
        tag: `${t.kind}-${t.id}`,
      });
    }
  }

  // Things happening today, used by the briefing.
  const todaysTasks = open.filter((t) => t.date === today).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const overdue = open.filter((t) => t.date && t.date < today);
  const todaysMeetings = meetings.filter((m) => m.date === today);
  const todaysEvents = (input.events || []).filter((e) => eventOn(e, today, tz));
  const billsToday = bills.filter((b) => b.due <= today);
  const birthdaysToday = input.prefs.datesOn
    ? [
        ...people.filter((p) => /^\d{2}-\d{2}$/.test(p.bday || "") && nextYearly(p.bday!, today) === today).map((p) => `${p.name}'s birthday`),
        ...(input.occasions || []).filter((o) => /^\d{2}-\d{2}$/.test(o.md || "") && nextYearly(o.md, today) === today).map((o) => o.title),
      ]
    : [];
  const followUps = people.filter((p) => p.followEvery && p.followEvery > 0 && (!p.last || addDays(p.last, p.followEvery) <= today));

  // 2. Morning briefing.
  if (briefingDue(input.now, input.timeZone, input.prefs)) {
    const schedule = [
      ...todaysEvents.map((e) => ({ t: eventTime(e, tz), s: e.title, allDay: e.allDay })),
      ...todaysMeetings.map((m) => ({ t: m.time || "", s: m.title })),
      ...todaysTasks.map((t) => ({ t: t.time || "", s: t.title })),
    ].sort((a, b) => ((a as { allDay?: boolean }).allDay ? "00" : a.t || "99").localeCompare((b as { allDay?: boolean }).allDay ? "00" : b.t || "99"));
    const lines = [
      ...birthdaysToday,
      ...schedule.map((x) => (x.t ? `${fmtTime(x.t)} ${x.s}` : x.s)),
      ...billsToday.map((b) => `${b.name} due${b.due < today ? " (overdue)" : ""}`),
      ...overdue.map((t) => `${t.title} (overdue)`),
      ...(followUps.length ? [`Catch up with ${followUps.map((p) => p.name).slice(0, 2).join(" and ")}${followUps.length > 2 ? " and others" : ""}`] : []),
    ];
    const head: string[] = [];
    if (todaysTasks.length) head.push(plural(todaysTasks.length, "task"));
    if (todaysEvents.length + todaysMeetings.length) head.push(plural(todaysEvents.length + todaysMeetings.length, "event"));
    if (overdue.length) head.push(`${overdue.length} overdue`);
    if (lines.length) {
      out.push({
        ref: `brief:${today}`,
        title: head.length ? head.join(", ") + (todaysTasks.length || todaysEvents.length + todaysMeetings.length ? " today" : "") : "Your day",
        body: list(lines),
        url: "/#today",
        tag: "brief",
      });
    } else if (input.habits.length) {
      out.push({
        ref: `brief:${today}`,
        title: "A clear day",
        body: `Nothing scheduled. ${plural(input.habits.length, "habit")} to keep up.`,
        url: "/#today",
        tag: "brief",
      });
    }
  }

  // 3. Bills: a heads-up a few days before, and on the day.
  if (input.prefs.billsOn && inDailyWindow(input.prefs.brief)) {
    for (const b of bills) {
      const n = daysBetween(today, b.due);
      const lead = typeof b.remind === "number" ? b.remind : 2;
      if (n === 0 || (lead > 0 && n === lead)) {
        out.push({
          ref: `bill:${b.id}:${b.due}:${n}`,
          title: `${b.name} is due ${whenIn(n, b.due)}`,
          body: `${fmtMoney(b.amt)}. Tap to mark it paid.`,
          url: "/#bills",
          tag: `bill-${b.id}`,
        });
      }
    }
  }

  // 3b. Loans and debts with a due date: 3 days before and on the day.
  if (input.prefs.billsOn && inDailyWindow(input.prefs.brief)) {
    for (const d of input.debts || []) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.due || "")) continue;
      const log = d.log || [];
      const bal = (d.amount || 0) + log.filter((l) => l.kind === "add").reduce((a, l) => a + l.amt, 0) - log.filter((l) => l.kind !== "add").reduce((a, l) => a + l.amt, 0);
      if (bal <= 0.009) continue;
      const n = daysBetween(today, d.due!);
      if (n !== 3 && n !== 0) continue;
      out.push({
        ref: `debt:${d.id}:${d.due}:${n}`,
        title: d.dir === "owe" ? `${d.name} repayment due ${whenIn(n, d.due!)}` : `${d.name} is due to pay you back ${whenIn(n, d.due!)}`,
        body: `${fmtMoney(Math.round(bal))} ${d.dir === "owe" ? "left to repay" : "still owed to you"}.`,
        url: "/#money",
        tag: `debt-${d.id}`,
      });
    }
  }

  // 3c. Category limits: once at 80% and once when passed, each month.
  if (input.prefs.billsOn && inDailyWindow(input.prefs.brief) && input.limits) {
    const month = today.slice(0, 7);
    const [yy, mm] = month.split("-").map(Number);
    const left = new Date(Date.UTC(yy, mm, 0)).getUTCDate() - +today.slice(8);
    for (const [cat, lim] of Object.entries(input.limits)) {
      if (!(lim > 0)) continue;
      const v = (input.spentByCat || {})[cat] || 0;
      const level = v >= lim ? 100 : v >= lim * 0.8 ? 80 : 0;
      if (!level) continue;
      out.push({
        ref: `limit:${cat}:${month}:${level}`,
        title: level === 100 ? `${cat} is over its limit` : `${cat} is at ${Math.round((v / lim) * 100)}% of its limit`,
        body: `${fmtMoney(Math.round(v))} of ${fmtMoney(lim)} spent, ${left} ${left === 1 ? "day" : "days"} left this month.`,
        url: "/#money",
        tag: `limit-${cat}`,
      });
    }
  }

  // 4. Birthdays and other dates, a few days ahead (the day itself is in the briefing).
  if (input.prefs.datesOn && inDailyWindow(input.prefs.brief)) {
    const upcoming = [
      ...people.filter((p) => /^\d{2}-\d{2}$/.test(p.bday || "")).map((p) => ({ id: "p" + p.id, title: `${p.name}'s birthday`, md: p.bday!, remind: BIRTHDAY_LEAD_DAYS })),
      ...(input.occasions || []).filter((o) => /^\d{2}-\d{2}$/.test(o.md || "")).map((o) => ({ id: "o" + o.id, title: o.title, md: o.md, remind: typeof o.remind === "number" ? o.remind : BIRTHDAY_LEAD_DAYS })),
    ];
    for (const d of upcoming) {
      const when = nextYearly(d.md, today);
      const n = daysBetween(today, when);
      if (d.remind > 0 && n === d.remind) {
        out.push({ ref: `date:${d.id}:${when}:${n}`, title: `${d.title} ${whenIn(n, when)}`, body: "A good moment to plan a call, a message or a gift.", url: "/#people", tag: `date-${d.id}` });
      }
      // If the briefing is off, still mention the day itself.
      if (n === 0 && !input.prefs.briefOn) {
        out.push({ ref: `date:${d.id}:${when}:0`, title: `${d.title} today`, body: "Don't forget to reach out.", url: "/#people", tag: `date-${d.id}` });
      }
    }
  }

  // 5. Evening check-in: habits not yet logged and tasks still open today.
  if (input.prefs.eveOn && inDailyWindow(input.prefs.eve)) {
    const doneToday = new Set(input.habitLog[today] || []);
    const habitsLeft = input.habits.filter((h) => !doneToday.has(h.id)).map((h) => h.name);
    const tasksLeft = open.filter((t) => t.date && t.date <= today);
    if (habitsLeft.length || tasksLeft.length) {
      const head: string[] = [];
      if (habitsLeft.length) head.push(`${plural(habitsLeft.length, "habit")} left`);
      if (tasksLeft.length) head.push(`${plural(tasksLeft.length, "task")} still open`);
      out.push({
        ref: `evening:${today}`,
        title: "Evening check-in: " + head.join(", "),
        body: list(habitsLeft.concat(tasksLeft.map((t) => t.title)), 3),
        url: habitsLeft.length ? "/#habits" : "/#plan",
        tag: "evening",
      });
    }
  }

  // 6. Weekly review.
  if (input.prefs.reviewOn && weekday(today) === input.prefs.reviewDay && inDailyWindow(input.prefs.review)) {
    const weekAgo = input.now.getTime() - 7 * 864e5;
    const finished = input.tasks.filter((t) => t && t.done && (t.doneAt || 0) > weekAgo).length;
    out.push({
      ref: `review:${today}`,
      title: "Your weekly review is ready",
      body: `You finished ${plural(finished, "task")} this week. Take 5 minutes to look back and set next week's priorities.`,
      url: "/#review",
      tag: "review",
    });
  }

  return out;
}
