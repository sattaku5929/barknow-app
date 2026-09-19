"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";

type PermissionStatus = NotificationPermission | "unsupported";
type SubscriptionStatus = "checking" | "subscribed" | "unsubscribed" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

export function usePushNotification() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>("unsupported");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("checking");

  const refreshSubscriptionStatus = useCallback(async () => {
    await Promise.resolve();
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPermissionStatus("unsupported");
      setSubscriptionStatus("unsupported");
      return false;
    }
    setPermissionStatus(Notification.permission);
    if (Notification.permission !== "granted") {
      setSubscriptionStatus("unsubscribed");
      return false;
    }

    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const browserSubscription = await registration?.pushManager.getSubscription();
    const { data: { user } } = await supabase.auth.getUser();
    if (!browserSubscription || !user) {
      setSubscriptionStatus("unsubscribed");
      return false;
    }

    const { data, error } = await supabase.from("push_subscriptions").select("subscription").eq("user_id", user.id).maybeSingle();
    const savedEndpoint = (data?.subscription as { endpoint?: string } | null)?.endpoint;
    const subscribed = !error && savedEndpoint === browserSubscription.endpoint;
    setSubscriptionStatus(subscribed ? "subscribed" : "unsubscribed");
    return subscribed;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refreshSubscriptionStatus());
    return () => window.cancelAnimationFrame(frame);
  }, [refreshSubscriptionStatus]);

  const subscribeUser = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPermissionStatus("unsupported");
      setSubscriptionStatus("unsupported");
      return null;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured.");

    const registration = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
    if (permission !== "granted") {
      setSubscriptionStatus("unsubscribed");
      return null;
    }

    const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("User is not authenticated.");

    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: user.id,
      subscription: subscription.toJSON(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
    setSubscriptionStatus("subscribed");
    return subscription;
  }, []);

  return { subscribeUser, permissionStatus, subscriptionStatus, isSubscribed: subscriptionStatus === "subscribed", refreshSubscriptionStatus };
}
