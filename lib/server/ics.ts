// Reads calendars published as iCal (.ics) links: Google Calendar's "secret address",
// iCloud public calendars, Outlook "Publish calendar" links. Expands repeating events.
import ICAL from "ical.js";

export type CalEvent = {
  id: string;
  title: string;
  start: string; // ISO time, or YYYY-MM-DD for all-day events
  end: string;
  allDay: boolean;
  location?: string;
};

const MAX_BYTES = 5_000_000;

export function cleanUrl(raw: string): string | null {
  let u = String(raw || "").trim();
  if (!u) return null;
  u = u.replace(/^webcals?:\/\//i, "https://");
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(parsed.hostname) || parsed.hostname.endsWith(".internal")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function download(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: "text/calendar, */*" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`The calendar link answered ${res.status}. Check that it's the full secret or public address.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("That calendar is too large to read.");
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That link isn't an iCal calendar. Use the address ending in .ics.");
  return text;
}

function toIso(t: ICAL.Time): string {
  return t.toJSDate().toISOString();
}

function expand(text: string, from: Date, to: Date, tag: number): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try { ICAL.TimezoneService.register(tz); } catch { /* ignore broken zones */ }
  }

  // Group by UID so moved or edited occurrences of a repeating event replace the originals.
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const comp of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(comp);
    if (String(comp.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED" && !ev.isRecurrenceException()) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid + ":" + masters.size, ev);
  }
  const byUid = new Map<string, ICAL.Event[]>();
  for (const ev of masters.values()) byUid.set(ev.uid, [...(byUid.get(ev.uid) || []), ev]);
  for (const ex of exceptions) for (const m of byUid.get(ex.uid) || []) if (m.isRecurring()) { try { m.relateException(ex); } catch { /* ignore */ } }

  const out: CalEvent[] = [];
  const fromT = from.getTime(), toT = to.getTime();
  const push = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null) => {
    const status = String(item.component.getFirstPropertyValue("status") || "").toUpperCase();
    if (status === "CANCELLED") return;
    const allDay = start.isDate;
    const s = start.toJSDate().getTime();
    const e = end ? end.toJSDate().getTime() : s + (allDay ? 864e5 : 0);
    if (e < fromT || s > toT) return;
    out.push({
      id: `${tag}:${item.uid}:${start.toString()}`,
      title: item.summary || "Busy",
      start: allDay ? start.toString().slice(0, 10) : toIso(start),
      end: end ? (allDay ? end.toString().slice(0, 10) : toIso(end)) : "",
      allDay,
      location: item.location || undefined,
    });
  };

  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) { push(ev, ev.startDate, ev.endDate); continue; }
    const it = ev.iterator();
    let next: ICAL.Time | null, n = 0;
    while ((next = it.next()) && n++ < 2000) {
      if (next.toJSDate().getTime() > toT) break;
      const d = ev.getOccurrenceDetails(next);
      push(d.item, d.startDate, d.endDate);
    }
  }
  return out.sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || a.start.localeCompare(b.start));
}

/** Events from all the person's calendar links between two dates. */
export async function loadEvents(urls: string[], from: Date, to: Date): Promise<{ events: CalEvent[]; problems: string[] }> {
  const events: CalEvent[] = [];
  const problems: string[] = [];
  await Promise.all(
    urls.slice(0, 5).map(async (raw, i) => {
      const url = cleanUrl(raw);
      if (!url) { problems.push(`Calendar ${i + 1}: use the full https:// or webcal:// address.`); return; }
      try {
        events.push(...expand(await download(url), from, to, i));
      } catch (e) {
        problems.push(`Calendar ${i + 1}: ${(e as Error).name === "TimeoutError" ? "the link took too long to answer." : (e as Error).message}`);
      }
    })
  );
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events, problems };
}

/** Calendar links saved in the person's settings (one per line). */
export function calendarUrls(settings: { calendars?: unknown } | null | undefined): string[] {
  const raw = settings && typeof settings.calendars === "string" ? settings.calendars : "";
  return raw.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}
