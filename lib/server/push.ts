import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function missingServerConfig(): string[] {
  const need = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "CRON_SECRET",
  ];
  return need.filter((k) => !process.env[k]);
}

/** Server-only database client. Uses the secret key, so it must never reach the browser. */
export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type SubRow = { endpoint: string; user_id: string; subscription: webpush.PushSubscription; time_zone: string };

/** Sends to every device in `subs`. Devices that no longer exist are removed. Returns how many arrived. */
export async function sendToDevices(db: SupabaseClient, subs: SubRow[], payload: PushPayload): Promise<number> {
  configure();
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, JSON.stringify(payload), { TTL: 60 * 60, urgency: "high" });
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.error("Push failed", code, (err as Error).message);
      }
    })
  );
  return delivered;
}

/** True when the request carries the shared secret (from the scheduler or Vercel Cron). */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}
