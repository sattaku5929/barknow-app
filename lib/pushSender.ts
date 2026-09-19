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
  if (error) console.error("[Web Push] subscription table lookup failed; checking auth metadata", { userId, error });
  let subscription = data?.subscription as PushSubscription | undefined;
  if (!subscription) {
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
    if (authError) throw authError;
    subscription = authData.user?.user_metadata?.push_subscription as PushSubscription | undefined;
  }
  if (!subscription) return;

  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, url }));
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
    if (statusCode === 404 || statusCode === 410) {
      await admin.from("push_subscriptions").delete().eq("user_id", userId);
      const { data: authData } = await admin.auth.admin.getUserById(userId);
      if (authData.user?.user_metadata?.push_subscription) {
        await admin.auth.admin.updateUserById(userId, {
          user_metadata: { ...authData.user.user_metadata, push_subscription: null },
        });
      }
      return;
    }
    throw error;
  }
}
