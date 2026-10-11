export const OWNER_CACHE_USER_KEY = "wan-tone-cache-user-v1";

// Keep same-account offline data; discard legacy or another account's cache.
export function bindOwnerCache(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, userId: string, keys: readonly string[]) {
  const changed = storage.getItem(OWNER_CACHE_USER_KEY) !== userId;
  if (changed) keys.forEach((key) => storage.removeItem(key));
  storage.setItem(OWNER_CACHE_USER_KEY, userId);
  return changed;
}
