"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/app/supabase";

type PermissionStatus = NotificationPermission | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

export function usePushNotification() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );

  const subscribeUser = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPermissionStatus("unsupported");
      return null;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured.");

    const registration = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
    if (permission !== "granted") return null;

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
    return subscription;
  }, []);

  return { subscribeUser, permissionStatus };
}
