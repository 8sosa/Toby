// "Add to Toby" for Siri, Shortcuts and the Share Sheet.
// POST with header "Authorization: Bearer toby_..." and a body of plain text or {"text": "..."}.
// Replies with a short sentence Siri can read out, e.g. "Added to Shopping: Milk, Eggs".
import { adminClient } from "@/lib/server/push";
import { serverReady, userFromKey } from "@/lib/server/auth";
import { classify } from "@/lib/quick";
import { localNow } from "@/lib/server/schedule";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

type ParsedTask = { title: string; date: string; time: string; pri: string; repeat: string };
type Classified =
  | { kind: "task"; task: ParsedTask }
  | { kind: "expense"; type: "in" | "out"; amt: number; cat: string; note: string }
  | { kind: "note"; title: string; body: string }
  | { kind: "list"; list: string; items: string[] };

const reply = (text: string, status = 200) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h >= 12 ? "pm" : "am"}`;
};

async function readText(req: Request): Promise<string> {
  const url = new URL(req.url);
  if (url.searchParams.get("text")) return url.searchParams.get("text")!;
  const type = req.headers.get("content-type") || "";
  const raw = await req.text();
  if (type.includes("json") || /^\s*\{/.test(raw)) {
    try {
      const body = JSON.parse(raw);
      return String(body.text ?? body.input ?? body.url ?? "");
    } catch { /* fall through to plain text */ }
  }
  if (type.includes("form")) return new URLSearchParams(raw).get("text") || "";
  return raw;
}

export async function POST(req: Request) {
  if (serverReady().length) return reply("Toby's server isn't fully set up yet.", 500);
  const db = adminClient();
  const key = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() || new URL(req.url).searchParams.get("key") || "";
  const userId = await userFromKey(db, key);
  if (!userId) return reply("That Toby key isn't valid. Create a new one in Toby: More, Settings, Siri and Shortcuts.", 401);

  const text = (await readText(req)).trim().slice(0, 2000);
  if (!text) return reply("Nothing to add. Say or share some text.", 400);

  // Work out "today" and "tomorrow" in the person's own time zone.
  const { data: settingsRow } = await db.from("user_data").select("data").eq("user_id", userId).eq("key", "settings").maybeSingle();
  const tz = (settingsRow?.data?.tz as string) || "UTC";
  const today = localNow(new Date(), tz).date;
  const c = classify(text, today) as Classified | null;
  if (!c) return reply("I couldn't tell what to add. Try again with a few more words.", 400);

  if (c.kind === "list") {
    let { data: list } = await db.from("lists").select("id,name").eq("user_id", userId).ilike("name", c.list).maybeSingle();
    if (!list) {
      const made = await db.from("lists").insert({ user_id: userId, name: c.list }).select("id,name").single();
      if (made.error) return reply("Couldn't reach your lists. Make sure the latest database update is installed.", 500);
      list = made.data;
    }
    const { error } = await db.from("list_items").insert(c.items.map((t: string) => ({ list_id: list!.id, user_id: userId, text: t.slice(0, 300), added_by: "Siri" })));
    if (error) return reply("Couldn't save that. Try again in a moment.", 500);
    return reply(`Added to ${list!.name}: ${c.items.join(", ")}`);
  }

  const payload =
    c.kind === "task" ? { id: randomUUID(), ...c.task } :
    c.kind === "expense" ? { id: randomUUID(), type: c.type, amt: c.amt, cat: c.cat, note: c.note, date: today } :
    { id: randomUUID(), title: c.title, body: c.body };
  const { error } = await db.from("inbox").insert({ user_id: userId, kind: c.kind, payload });
  if (error) return reply("Couldn't save that. Make sure the latest database update is installed.", 500);

  if (c.kind === "task") {
    const t = c.task;
    const when = [t.date === today ? "today" : t.date ? "on " + new Date(t.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "", t.time ? "at " + fmtTime(t.time) : ""].filter(Boolean).join(" ");
    return reply(`Added: ${t.title}${when ? " " + when : ""}${t.repeat ? ", repeating" : ""}.`);
  }
  if (c.kind === "expense") return reply(`Logged ${c.type === "in" ? "income" : "expense"}: ${c.amt.toLocaleString("en-US")}${c.note ? " for " + c.note : ""}.`);
  return reply(`Saved a note: ${c.title}`);
}

export async function GET() {
  return reply("Toby's Add endpoint is working. Send text with POST.");
}
