// Runs every few minutes (called by the Supabase scheduler, see README) and sends
// whatever reminders are due: task reminders, the morning briefing and the evening check-in.
import { NextResponse } from "next/server";
import { adminClient, isAuthorizedCron, missingServerConfig, sendToDevices, type SubRow } from "@/lib/server/push";
import { dueNotices, readPrefs, type Habit, type Task } from "@/lib/server/schedule";

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
    const { data: rows } = await db.from("user_data").select("key,data").eq("user_id", userId).in("key", ["tasks", "habits", "settings"]);
    const get = (k: string) => (rows || []).find((r) => r.key === k)?.data || {};
    const tasks = (get("tasks").items || []) as Task[];
    const habits = (get("habits").items || []) as Habit[];
    const habitLog = (get("habits").log || {}) as Record<string, string[]>;
    const prefs = readPrefs(get("settings").notify);
    // Use the time zone of the device that checked in most recently.
    const timeZone = [...devices].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0].time_zone || "UTC";

    for (const n of dueNotices({ now, timeZone, tasks, habits, habitLog, prefs })) {
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
