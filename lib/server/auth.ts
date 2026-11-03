import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The signed-in person behind a request from the app (Authorization: Bearer <session token>). */
export async function userFromRequest(db: SupabaseClient, req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

/** The person a Siri/Shortcuts key belongs to. */
export async function userFromKey(db: SupabaseClient, key: string): Promise<string | null> {
  if (!/^toby_[A-Za-z0-9_-]{20,}$/.test(key)) return null;
  const hash = createHash("sha256").update(key).digest("hex");
  const { data } = await db.from("api_tokens").select("user_id").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  await db.from("api_tokens").update({ last_used: new Date().toISOString() }).eq("token_hash", hash);
  return data.user_id as string;
}

export function serverReady(): string[] {
  return ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
}
