import webpush, { type PushSubscription } from "web-push";
import { serviceSupabase } from "@/lib/server/supabase";

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID keys are not configured");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@barknow.jp", publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendPushNotification(userId: string, title: string, body: string, url: string) {
  configureVapid();
  const admin = serviceSupabase();
  const { data, error } = await admin.from("push_subscriptions").select("subscription").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data?.subscription) return;

  try {
    await webpush.sendNotification(data.subscription as PushSubscription, JSON.stringify({ title, body, url }));
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    if (statusCode === 404 || statusCode === 410) {
      await admin.from("push_subscriptions").delete().eq("user_id", userId);
      return;
    }
    throw error;
  }
}
