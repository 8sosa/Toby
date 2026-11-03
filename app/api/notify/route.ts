// Runs every few minutes (called by the Supabase scheduler, see README) and sends
// whatever reminders are due: task and meeting reminders, the morning briefing, bills,
// birthdays, the evening check-in and the weekly review.
import { NextResponse } from "next/server";
import { adminClient, isAuthorizedCron, missingServerConfig, sendToDevices, type SubRow } from "@/lib/server/push";
import { briefingDue, dueNotices, localNow, readPrefs, type Bill, type Habit, type Meeting, type Occasion, type Person, type Task, type Debt, type Doc } from "@/lib/server/schedule";
import { calendarUrls, loadEvents, type CalEvent } from "@/lib/server/ics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const missing = missingServerConfig();
  if (missing.length) return NextResponse.json({ error: "Missing environment variables", missing }, { status: 500 });
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: subs, error } = await db.from("push_subscriptions").select("endpoint,user_id,subscription,time_zone,updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byUser = new Map<string, (SubRow & { updated_at: string })[]>();
  for (const s of subs || []) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  const now = new Date();
  let sent = 0;
  const problems: string[] = [];
  for (const [userId, devices] of byUser) {
    const { data: rows } = await db.from("user_data").select("key,data").eq("user_id", userId).in("key", ["tasks", "habits", "settings", "meetings", "bills", "people", "debts", "docs"]);
    const get = (k: string) => (rows || []).find((r) => r.key === k)?.data || {};
    const tasks = (get("tasks").items || []) as Task[];
    // Tasks added by Siri that haven't been opened in the app yet still get reminders.
    const { data: pending } = await db.from("inbox").select("payload").eq("user_id", userId).eq("kind", "task");
    for (const p of pending || []) if (p.payload && !tasks.some((t) => t.id === p.payload.id)) tasks.push(p.payload as Task);
    const habits = (get("habits").items || []) as Habit[];
    const habitLog = (get("habits").log || {}) as Record<string, string[]>;
    const settings = get("settings");
    const prefs = readPrefs(settings.notify);
    // Use the time zone of the device that checked in most recently.
    const timeZone = [...devices].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0].time_zone || settings.tz || "UTC";
    const currency = typeof settings.currency === "string" ? settings.currency : "";
    const money = (n: number) => currency + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

    // Calendar events are only needed for the morning briefing.
    let events: CalEvent[] = [];
    const urls = calendarUrls(settings);
    if (urls.length && briefingDue(now, timeZone, prefs)) {
      events = (await loadEvents(urls, new Date(now.getTime() - 864e5), new Date(now.getTime() + 2 * 864e5))).events;
    }

    // Spending per category this month, for limit alerts (only read around briefing time).
    let limits: Record<string, number> | undefined, spentByCat: Record<string, number> | undefined;
    const nowLocal = localNow(now, timeZone);
    const [bh, bm] = prefs.brief.split(":").map(Number), [nh, nm] = nowLocal.time.split(":").map(Number);
    const sinceBrief = nh * 60 + nm - (bh * 60 + bm);
    if (sinceBrief >= 0 && sinceBrief < 90) {
      const { data: m } = await db.from("user_data").select("data").eq("user_id", userId).eq("key", "money").maybeSingle();
      const money = (m?.data || {}) as { limits?: Record<string, number>; entries?: { type: string; cat: string; amt: number; date: string; splits?: { cat: string; amt: number }[] }[] };
      if (money.limits && Object.keys(money.limits).length) {
        limits = money.limits; spentByCat = {};
        const month = nowLocal.date.slice(0, 7);
        for (const e of money.entries || []) {
          if (e.type === "in" || e.cat === "Lending" || e.date.slice(0, 7) !== month) continue;
          const parts = e.splits && e.splits.length ? [...e.splits, { cat: e.cat, amt: e.amt - e.splits.reduce((a, x) => a + x.amt, 0) }] : [{ cat: e.cat, amt: e.amt }];
          for (const p of parts) if (p.amt > 0) spentByCat[p.cat] = (spentByCat[p.cat] || 0) + p.amt;
        }
      }
    }

    const notices = dueNotices({
      limits, spentByCat,
      now, timeZone, tasks, habits, habitLog, prefs, events, money,
      meetings: (get("meetings").items || []) as Meeting[],
      bills: (get("bills").items || []) as Bill[],
      people: (get("people").items || []) as Person[],
      occasions: (get("people").dates || []) as Occasion[],
      debts: (get("debts").items || []) as Debt[],
      docs: (get("docs").items || []) as Doc[],
    });
    for (const n of notices) {
      // Claim the notification first so a parallel run can't send it twice.
      const { error: dup } = await db.from("notify_log").insert({ user_id: userId, ref: n.ref });
      if (dup) {
        if (dup.code !== "23505") problems.push(dup.message); // 23505 = already sent
        continue;
      }
      sent += await sendToDevices(db, devices, { title: n.title, body: n.body, url: n.url, tag: n.tag });
    }
  }

  // Keep the log small.
  await db.from("notify_log").delete().lt("sent_at", new Date(now.getTime() - 14 * 864e5).toISOString());

  if (problems.length) return NextResponse.json({ ok: false, sent, problems: [...new Set(problems)] }, { status: 500 });
  return NextResponse.json({ ok: true, users: byUser.size, sent });
}

export const GET = run; // Vercel Cron
export const POST = run; // Supabase scheduler or any other caller
