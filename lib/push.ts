// Turning notifications on and off on this device.
import { supabase } from "@/lib/supabase";

export type PushState = "not-configured" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function keyToBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function saveSubscription(sub: PushSubscription) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Please sign in again.");
  const { error } = await supabase.from("push_subscriptions").upsert({
    endpoint: sub.endpoint,
    user_id: data.user.id,
    subscription: sub.toJSON(),
    time_zone: timeZone(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Couldn't save this device: " + error.message);
}

export const push = {
  async state(): Promise<PushState> {
    if (!VAPID_PUBLIC) return "not-configured";
    if (!supported()) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission !== "granted") return "off";
    const sub = await (await registration()).pushManager.getSubscription();
    return sub ? "on" : "off";
  },

  /** Must be called straight from a tap: iPhone only shows the permission prompt then. */
  async enable(): Promise<PushState> {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "off";
    const reg = await registration();
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC) }));
    await saveSubscription(sub);
    return "on";
  },

  async disable(): Promise<PushState> {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    return "off";
  },

  /** Keeps this device's time zone current; called when the app opens. */
  async refresh() {
    try {
      if (!VAPID_PUBLIC || !supported() || Notification.permission !== "granted") return;
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) await saveSubscription(sub);
    } catch {
      /* not important enough to bother anyone */
    }
  },

  async test(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { Authorization: "Bearer " + (data.session?.access_token || "") },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "The test didn't go through. Try again in a moment.");
    return body.delivered ? "Test sent. It should arrive in a few seconds." : "Your device didn't accept the test. Turn notifications off and on again.";
  },
};
