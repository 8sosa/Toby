// Sends a test notification to the signed-in person's devices (the "Send a test" button).
import { NextResponse } from "next/server";
import { adminClient, missingServerConfig, sendToDevices } from "@/lib/server/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const missing = missingServerConfig().filter((k) => k !== "CRON_SECRET");
  if (missing.length) return NextResponse.json({ error: "Notifications aren't set up on the server yet.", missing }, { status: 500 });

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const db = adminClient();
  const { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: subs } = await db.from("push_subscriptions").select("endpoint,user_id,subscription,time_zone").eq("user_id", auth.user.id);
  if (!subs || !subs.length) return NextResponse.json({ error: "No devices have notifications turned on." }, { status: 404 });

  const delivered = await sendToDevices(db, subs, {
    title: "Toby is set up",
    body: "Notifications are working. You'll get your briefing and reminders here.",
    url: "/#today",
    tag: "test",
  });
  return NextResponse.json({ ok: true, delivered });
}
