import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

type PushSubscriptionInput = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [value.message, value.details, value.hint, value.code]
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .join(" / ") || "Unknown database error";
  }
  return String(error || "Unknown error");
}

function validSubscription(value: PushSubscriptionInput | null) {
  return Boolean(
    value
    && typeof value.endpoint === "string"
    && value.endpoint.startsWith("https://")
    && typeof value.keys?.p256dh === "string"
    && typeof value.keys?.auth === "string",
  );
}

async function metadataSubscription(userId: string) {
  const admin = serviceSupabase();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user?.user_metadata?.push_subscription as PushSubscriptionJSON | undefined;
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "ログイン情報を確認できませんでした" }, { status: 401 });

  try {
    const admin = serviceSupabase();
    const { data, error } = await admin.from("push_subscriptions").select("subscription").eq("user_id", user.id).maybeSingle();
    if (!error && data?.subscription) return NextResponse.json({ subscription: data.subscription, storage: "table" });
    if (error) console.error("[Web Push] subscription table lookup failed", { userId: user.id, error });
    const subscription = await metadataSubscription(user.id);
    return NextResponse.json({ subscription: subscription ?? null, storage: subscription ? "auth_metadata" : null });
  } catch (error) {
    console.error("[Web Push] subscription status failed", { userId: user.id, error });
    return NextResponse.json({ error: errorDetail(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "ログイン情報を確認できませんでした" }, { status: 401 });

  const input = await request.json().catch(() => null) as { subscription?: PushSubscriptionInput } | null;
  if (!validSubscription(input?.subscription ?? null)) {
    return NextResponse.json({ error: "Push購読情報の形式が正しくありません" }, { status: 400 });
  }
  const subscription = input?.subscription as PushSubscriptionInput;

  try {
    const admin = serviceSupabase();
    const { error } = await admin.from("push_subscriptions").upsert({
      user_id: user.id,
      subscription,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (!error) return NextResponse.json({ ok: true, storage: "table" });

    console.error("[Web Push] subscription table save failed; using auth metadata", { userId: user.id, error });
    const { data: authData, error: readError } = await admin.auth.admin.getUserById(user.id);
    if (readError) throw readError;
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(authData.user?.user_metadata ?? {}), push_subscription: subscription },
    });
    if (metadataError) throw new Error(`${errorDetail(error)} / fallback: ${errorDetail(metadataError)}`);
    return NextResponse.json({ ok: true, storage: "auth_metadata", warning: errorDetail(error) });
  } catch (error) {
    console.error("[Web Push] subscription save failed", { userId: user.id, error });
    return NextResponse.json({ error: errorDetail(error) }, { status: 500 });
  }
}
