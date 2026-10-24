import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/server/supabase";
import { validPushSubscription } from "@/lib/push-security";
import { sendPushNotification } from "@/lib/pushSender";

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const input = await request.json().catch(() => null) as { endpoint?: string } | null;
  if (!validPushSubscription({ endpoint: input?.endpoint, keys: { auth: "test", p256dh: "test" } })) {
    return NextResponse.json({ error: "この端末の通知をONにしてください" }, { status: 400 });
  }
  try {
    const result = await sendPushNotification(user.id, "WanTone｜通知テスト", "この端末で通知を受け取れます。", "/", { kind: "test", endpoint: input!.endpoint });
    if (result !== "sent") return NextResponse.json({ error: "この端末の通知を一度OFFにして、ONにし直してください" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[Web Push] test delivery failed");
    return NextResponse.json({ error: "通知を送信できませんでした" }, { status: 502 });
  }
}
