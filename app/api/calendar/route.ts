// Returns events from the calendars linked in Settings, for the signed-in person.
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/push";
import { serverReady, userFromRequest } from "@/lib/server/auth";
import { calendarUrls, loadEvents } from "@/lib/server/ics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (serverReady().length) return NextResponse.json({ error: "The server isn't fully set up yet (see the README)." }, { status: 500 });
  const db = adminClient();
  const userId = await userFromRequest(db, req);
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const q = new URL(req.url).searchParams;
  const ok = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const fromS = ok(q.get("from")) ? q.get("from")! : new Date().toISOString().slice(0, 10);
  const toS = ok(q.get("to")) ? q.get("to")! : new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  // Pad by a day on each side so time zones never cut an event off.
  const from = new Date(new Date(fromS + "T00:00:00Z").getTime() - 864e5);
  const to = new Date(new Date(toS + "T23:59:59Z").getTime() + 864e5);
  if (to.getTime() - from.getTime() > 400 * 864e5) return NextResponse.json({ error: "Ask for a year or less at a time." }, { status: 400 });

  const { data } = await db.from("user_data").select("data").eq("user_id", userId).eq("key", "settings").maybeSingle();
  const urls = calendarUrls(data?.data);
  if (!urls.length) return NextResponse.json({ events: [], problems: [], connected: false });

  const { events, problems } = await loadEvents(urls, from, to);
  return NextResponse.json({ events, problems, connected: true }, { headers: { "Cache-Control": "no-store" } });
}
