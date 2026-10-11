// Object keys are capabilities only after the message's RLS permission is checked.
export function validChatMediaKey(key: unknown): key is string {
  return typeof key === "string" && /^chat\/[0-9a-f-]{36}\/\d{4}-\d{2}-\d{2}\/[a-zA-Z0-9._-]+$/.test(key)
    && !key.includes("..");
}

export function dogAvatarPath(value: string): string | null {
  try {
    const url = new URL(value);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (url.origin !== base.origin) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/public\/dog-avatars\/([0-9a-f-]{36}\/avatar\.webp)$/);
    return match?.[1] ?? null;
  } catch { return null; }
}
