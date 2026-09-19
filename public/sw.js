const BADGE_DB_NAME = "barknow-pwa-state";
const BADGE_STORE_NAME = "app-state";
const BADGE_COUNT_KEY = "unread-message-count";

function openBadgeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BADGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BADGE_STORE_NAME)) request.result.createObjectStore(BADGE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateStoredBadgeCount(update) {
  const database = await openBadgeDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BADGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BADGE_STORE_NAME);
    const request = store.get(BADGE_COUNT_KEY);
    let nextCount = 0;
    request.onsuccess = () => {
      nextCount = Math.max(0, Math.floor(update(Number(request.result) || 0)));
      store.put(nextCount, BADGE_COUNT_KEY);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(nextCount);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function displayAppBadge(count) {
  if (count <= 0) {
    if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
    return;
  }
  if ("setAppBadge" in self.navigator) await self.navigator.setAppBadge(count);
}

async function incrementAppBadge(explicitCount) {
  const count = await updateStoredBadgeCount((current) => Number.isFinite(explicitCount) ? explicitCount : current + 1);
  await displayAppBadge(count);
}

async function clearAppBadge() {
  await updateStoredBadgeCount(() => 0);
  await displayAppBadge(0);
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }

  event.waitUntil((async () => {
    const explicitCount = Number(payload.badgeCount);
    await incrementAppBadge(Number.isFinite(explicitCount) && explicitCount > 0 ? explicitCount : undefined);
    await self.registration.showNotification(payload.title || "BarKnow", {
      body: payload.body || "新しいお知らせがあります",
      icon: "/icon-192.png",
      data: { url: payload.url || "/" },
    });
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_APP_BADGE") event.waitUntil(clearAppBadge());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    await clearAppBadge();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const currentWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (currentWindow) {
      await currentWindow.navigate(targetUrl);
      return currentWindow.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
