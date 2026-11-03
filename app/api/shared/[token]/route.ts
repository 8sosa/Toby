// A shared list, opened by anyone with its link (no account needed).
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/push";
import { serverReady } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ token: string }> };

async function findList(token: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null;
  const db = adminClient();
  const { data } = await db.from("lists").select("id,name,user_id").eq("share_token", token).maybeSingle();
  return data ? { db, list: data } : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  if (serverReady().length) return NextResponse.json({ error: "Not available." }, { status: 500 });
  const found = await findList((await params).token);
  if (!found) return NextResponse.json({ error: "This list is no longer shared." }, { status: 404 });
  const { data: items } = await found.db.from("list_items").select("id,text,done,created_at").eq("list_id", found.list.id).order("created_at");
  return NextResponse.json({ name: found.list.name, items: items || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: Ctx) {
  if (serverReady().length) return NextResponse.json({ error: "Not available." }, { status: 500 });
  const found = await findList((await params).token);
  if (!found) return NextResponse.json({ error: "This list is no longer shared." }, { status: 404 });
  const { db, list } = found;
  const body = await req.json().catch(() => ({}));
  const op = String(body.op || "");
  const itemId = typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id) ? body.id : null;

  if (op === "add") {
    const texts: string[] = (Array.isArray(body.texts) ? body.texts : [body.text]).map((t: unknown) => String(t || "").trim().slice(0, 300)).filter(Boolean).slice(0, 50);
    if (!texts.length) return NextResponse.json({ error: "Type something to add." }, { status: 400 });
    const name = String(body.by || "").trim().slice(0, 40) || null;
    await db.from("list_items").insert(texts.map((text) => ({ list_id: list.id, user_id: list.user_id, text, added_by: name })));
  } else if (op === "toggle" && itemId) {
    await db.from("list_items").update({ done: !!body.done }).eq("id", itemId).eq("list_id", list.id);
  } else if (op === "remove" && itemId) {
    await db.from("list_items").delete().eq("id", itemId).eq("list_id", list.id);
  } else if (op === "clearDone") {
    await db.from("list_items").delete().eq("list_id", list.id).eq("done", true);
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const { data: items } = await db.from("list_items").select("id,text,done,created_at").eq("list_id", list.id).order("created_at");
  return NextResponse.json({ name: list.name, items: items || [] });
}
