"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";

type PermissionStatus = NotificationPermission | "unsupported";
type SubscriptionStatus = "checking" | "subscribed" | "unsubscribed" | "unsupported";
type SubscribeStage = "support" | "vapid" | "service-worker" | "permission" | "subscription" | "authentication" | "database";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function subscribeErrorMessage(error: unknown, stage: SubscribeStage) {
  const originalMessage = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : String(error);
  if (originalMessage === "VAPID公開鍵が設定されていません" || originalMessage === "Notification permission denied") return originalMessage;
  if (stage === "support" || stage === "service-worker") return `ServiceWorker not ready: ${originalMessage}`;
  if (stage === "vapid") return `VAPID key error: ${originalMessage}`;
  if (stage === "permission") return `Notification permission denied: ${originalMessage}`;
  if (stage === "subscription") {
    const errorName = error instanceof DOMException ? error.name : "";
    return errorName === "AbortError" || errorName === "InvalidAccessError"
      ? `VAPID key error: VAPID公開鍵の形式を確認してください（${originalMessage}）`
      : `Push subscription failed: ${originalMessage}`;
  }
  if (stage === "authentication") return `Authentication error: ${originalMessage}`;
  if (stage === "database") return `Push subscription save failed: ${originalMessage}`;
  return `Push notification setup failed: ${originalMessage}`;
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

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setSubscriptionStatus("unsubscribed");
      return false;
    }
    const response = await fetch("/api/push-subscriptions", { headers: { Authorization: `Bearer ${accessToken}` } });
    const result = await response.json().catch(() => null) as { subscription?: { endpoint?: string } | null } | null;
    const subscribed = response.ok && result?.subscription?.endpoint === browserSubscription.endpoint;
    setSubscriptionStatus(subscribed ? "subscribed" : "unsubscribed");
    return subscribed;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void refreshSubscriptionStatus());
    return () => window.cancelAnimationFrame(frame);
  }, [refreshSubscriptionStatus]);

  const subscribeUser = useCallback(async () => {
    let stage: SubscribeStage = "support";
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("このブラウザはWeb Push通知に対応していません");
      }

      stage = "vapid";
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) throw new Error("VAPID公開鍵が設定されていません");

      stage = "service-worker";
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) throw new Error("Service Workerが有効になっていません");

      stage = "permission";
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);
      if (permission !== "granted") throw new Error("Notification permission denied");

      stage = "subscription";
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      stage = "authentication";
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("ログインユーザーを確認できません");
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("ログインセッションを確認できません");

      stage = "database";
      const response = await fetch("/api/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || `保存APIからエラーが返されました（${response.status}）`);

      setSubscriptionStatus("subscribed");
      return subscription;
    } catch (error) {
      const message = subscribeErrorMessage(error, stage);
      const detailedError = new Error(message, { cause: error });
      console.error("[Web Push] subscribeUser failed", { stage, message, error });
      setSubscriptionStatus(stage === "support" || stage === "service-worker" ? "unsupported" : "unsubscribed");
      window.alert(detailedError.message);
      throw detailedError;
    }
  }, []);

  return { subscribeUser, permissionStatus, subscriptionStatus, isSubscribed: subscriptionStatus === "subscribed", refreshSubscriptionStatus };
}
