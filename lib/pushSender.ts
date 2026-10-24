import webpush, { type PushSubscription } from "web-push";
import { serviceSupabase } from "@/lib/server/supabase";
import { validPushSubscription } from "@/lib/push-security";

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID keys are not configured");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@barknow.jp", publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendPushNotification(userId: string, title: string, body: string, url: string,
  options?: { kind?: "care" | "announcement" | "test"; tag?: string; endpoint?: string }) {
  const admin = serviceSupabase();
  const { data, error } = await admin.from("push_subscriptions").select("subscription").eq("user_id", userId);
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authData.user) throw new Error("Push notification preferences lookup failed");
  const category = options?.kind === "care" ? "care" : options?.kind === "announcement" ? "announcements" : "chat";
  const preferences = authData.user.user_metadata?.notification_preferences;
  if (options?.kind !== "test" && preferences && typeof preferences === "object" && (preferences as Record<string, unknown>)[category] === false) {
    return "disabled" as const;
  }
  const candidates = [...(data ?? []).map(row => row.subscription), authData.user?.user_metadata?.push_subscription];
  const devices = new Map<string, PushSubscription>();
  for (const candidate of candidates) {
    if (!validPushSubscription(candidate)) continue;
    const subscription = candidate as PushSubscription;
    if (options?.endpoint && options.endpoint !== subscription.endpoint) continue;
    if (!devices.has(subscription.endpoint)) devices.set(subscription.endpoint, subscription);
  }
  if (!devices.size) {
    if (error || authError) throw new Error("Push subscription lookup failed");
    return "unsubscribed" as const;
  }
  configureVapid();
  const payload = JSON.stringify({ title, body, url, ...(options?.kind ? { kind: options.kind } : {}), ...(options?.tag ? { tag: options.tag } : {}) });
  const results = await Promise.allSettled(Array.from(devices.values()).map(async subscription => {
    try {
      await webpush.sendNotification(subscription, payload, options?.kind === "care" ? { TTL: 300 } : undefined);
      return "sent" as const;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode !== 404 && statusCode !== 410) throw error;
      const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", subscription.endpoint);
      if (deleteError) console.error("[Web Push] expired device cleanup failed");
      if (authData.user?.user_metadata?.push_subscription?.endpoint === subscription.endpoint) {
        const { error: metadataError } = await admin.auth.admin.updateUserById(userId, { user_metadata: { push_subscription: null } });
        if (metadataError) console.error("[Web Push] expired legacy device cleanup failed");
      }
      return "expired" as const;
    }
  }));
  const sent = results.some(result => result.status === "fulfilled" && result.value === "sent");
  const failed = results.find(result => result.status === "rejected");
  if (sent) {
    if (failed) console.error("[Web Push] some devices failed; other devices accepted the notification");
    return "sent" as const;
  }
  if (failed?.status === "rejected") throw failed.reason;
  return "expired" as const;
}
