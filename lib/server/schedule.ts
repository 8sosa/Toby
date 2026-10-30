// Decides which notifications are due for one person right now.
// Pure functions (no database, no network) so the timing rules are easy to test.

export type Task = { id: string; title: string; date: string; time: string; pri?: string; done?: boolean };
export type Habit = { id: string; name: string };
export type NotifyPrefs = { briefOn: boolean; brief: string; lead: number; eveOn: boolean; eve: string };
export type Notice = { ref: string; title: string; body: string; url: string; tag: string };

export const DEFAULT_PREFS: NotifyPrefs = { briefOn: true, brief: "08:00", lead: 0, eveOn: true, eve: "20:00" };

/** How late a notification may still go out if a scheduled check was missed. */
const TASK_WINDOW_MIN = 20;
const DAILY_WINDOW_MIN = 90;

export function readPrefs(raw: unknown): NotifyPrefs {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<NotifyPrefs>;
  const time = (v: unknown, d: string) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : d);
  return {
    briefOn: typeof p.briefOn === "boolean" ? p.briefOn : DEFAULT_PREFS.briefOn,
    brief: time(p.brief, DEFAULT_PREFS.brief),
    lead: typeof p.lead === "number" && p.lead >= -1 && p.lead <= 1440 ? p.lead : DEFAULT_PREFS.lead,
    eveOn: typeof p.eveOn === "boolean" ? p.eveOn : DEFAULT_PREFS.eveOn,
    eve: time(p.eve, DEFAULT_PREFS.eve),
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
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Minutes on a single line for comparing local times ("YYYY-MM-DD", "HH:MM"). */
function minutes(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) / 60000;
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h >= 12 ? "pm" : "am"}`;
}

function list(items: string[], max = 3) {
  const shown = items.slice(0, max).join(" · ");
  return items.length > max ? `${shown} · +${items.length - max} more` : shown;
}

export function dueNotices(input: {
  now: Date;
  timeZone: string;
  tasks: Task[];
  habits: Habit[];
  habitLog: Record<string, string[]>;
  prefs: NotifyPrefs;
}): Notice[] {
  const { date: today, time } = localNow(input.now, input.timeZone);
  const nowMin = minutes(today, time);
  const open = input.tasks.filter((t) => t && !t.done && typeof t.title === "string");
  const out: Notice[] = [];

  // Reminders at (or before) each timed task.
  if (input.prefs.lead >= 0) {
    for (const t of open) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || "") || !/^\d{2}:\d{2}$/.test(t.time || "")) continue;
      const fireAt = minutes(t.date, t.time) - input.prefs.lead;
      if (fireAt > nowMin || fireAt <= nowMin - TASK_WINDOW_MIN) continue;
      const when = input.prefs.lead > 0 ? `Starts at ${fmtTime(t.time)}` : `Now · ${fmtTime(t.time)}`;
      out.push({
        ref: `task:${t.id}:${t.date}T${t.time}:${input.prefs.lead}`,
        title: t.title,
        body: t.pri === "high" ? `${when} · Priority` : when,
        url: "/#plan",
        tag: `task-${t.id}`,
      });
    }
  }

  const inDailyWindow = (at: string) => {
    const fireAt = minutes(today, at);
    return fireAt <= nowMin && fireAt > nowMin - DAILY_WINDOW_MIN;
  };

  // Morning briefing.
  if (input.prefs.briefOn && inDailyWindow(input.prefs.brief)) {
    const todays = open.filter((t) => t.date === today).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const overdue = open.filter((t) => t.date && t.date < today);
    const habitsLeft = input.habits.length;
    if (todays.length || overdue.length) {
      const head = [`${todays.length} ${todays.length === 1 ? "task" : "tasks"} today`];
      if (overdue.length) head.push(`${overdue.length} overdue`);
      out.push({
        ref: `brief:${today}`,
        title: head.join(", "),
        body: list(todays.map((t) => (t.time ? `${fmtTime(t.time)} ${t.title}` : t.title)).concat(overdue.map((t) => `${t.title} (overdue)`))),
        url: "/#today",
        tag: "brief",
      });
    } else if (habitsLeft) {
      out.push({
        ref: `brief:${today}`,
        title: "A clear day",
        body: `Nothing scheduled. ${habitsLeft} ${habitsLeft === 1 ? "habit" : "habits"} to keep up.`,
        url: "/#today",
        tag: "brief",
      });
    }
  }

  // Evening check-in: habits not yet logged and tasks still open today.
  if (input.prefs.eveOn && inDailyWindow(input.prefs.eve)) {
    const doneToday = new Set(input.habitLog[today] || []);
    const habitsLeft = input.habits.filter((h) => !doneToday.has(h.id)).map((h) => h.name);
    const tasksLeft = open.filter((t) => t.date && t.date <= today);
    if (habitsLeft.length || tasksLeft.length) {
      const head: string[] = [];
      if (habitsLeft.length) head.push(`${habitsLeft.length} ${habitsLeft.length === 1 ? "habit" : "habits"} left`);
      if (tasksLeft.length) head.push(`${tasksLeft.length} ${tasksLeft.length === 1 ? "task" : "tasks"} still open`);
      out.push({
        ref: `evening:${today}`,
        title: "Evening check-in: " + head.join(", "),
        body: list(habitsLeft.concat(tasksLeft.map((t) => t.title))),
        url: habitsLeft.length ? "/#habits" : "/#plan",
        tag: "evening",
      });
    }
  }

  return out;
}
