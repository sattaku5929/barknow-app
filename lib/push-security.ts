// Never send server-originated requests to user-selected arbitrary hosts.
export function validPushSubscription(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const subscription = value as { endpoint?: unknown; keys?: { auth?: unknown; p256dh?: unknown } };
  if (typeof subscription.endpoint !== "string" || typeof subscription.keys?.auth !== "string"
    || typeof subscription.keys?.p256dh !== "string") return false;
  try {
    const url = new URL(subscription.endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com"
        || url.hostname === "push.services.mozilla.com" || url.hostname === "web.push.apple.com"
        || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
