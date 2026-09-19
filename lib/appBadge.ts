type BadgingNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
};

export async function clearAppBadge() {
  if (typeof window === "undefined") return;

  try {
    const badgeNavigator = window.navigator as BadgingNavigator;
    if (badgeNavigator.clearAppBadge) await badgeNavigator.clearAppBadge();
  } catch (error) {
    console.warn("[PWA Badge] browser badge clear failed", error);
  }

  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active ?? registration.waiting ?? registration.installing;
    worker?.postMessage({ type: "CLEAR_APP_BADGE" });
  } catch (error) {
    console.warn("[PWA Badge] service worker badge clear failed", error);
  }
}
