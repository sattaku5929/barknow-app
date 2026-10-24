import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";
import { coachingPriceId, stripeClient } from "@/lib/server/stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: "ログインの有効期限が切れました。再度ログインしてください" }, { status: 401 });

    const body = await request.json().catch(() => null) as { userId?: string } | null;
    if (!body?.userId) return NextResponse.json({ error: "ユーザー情報が不足しています" }, { status: 400 });
    if (body.userId !== user.id) return NextResponse.json({ error: "ユーザー情報を確認できませんでした" }, { status: 403 });

    // Never open another recurring contract for an already-linked paying customer.
    const admin = serviceSupabase();
    const { data: existing, error: lookupError } = await admin.from("wt_subscriptions")
      .select("stripe_customer_id,stripe_subscription_id")
      .eq("user_id", user.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.stripe_subscription_id) {
      const linked = await stripeClient().subscriptions.retrieve(existing.stripe_subscription_id);
      const actualCustomer = typeof linked.customer === "string" ? linked.customer : linked.customer.id;
      if (actualCustomer !== existing.stripe_customer_id) throw new Error("Existing subscription customer mismatch");
      if (linked.status !== "canceled" && linked.status !== "incomplete_expired") {
        return NextResponse.json({ error: "すでに有料契約があります。マイページの「契約・お支払い」から確認してください。" }, { status: 409 });
      }
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "");
    const priceId = coachingPriceId();
    const checkoutSession = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      client_reference_id: user.id,
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { user_id: user.id, plan: "coaching" },
      subscription_data: { metadata: { user_id: user.id, plan: "coaching" } },
      success_url: `${appUrl}/plans/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/plans/coaching`,
      locale: "ja",
    });

    if (!checkoutSession.url) throw new Error("Stripe Checkout URL was not returned");
    return NextResponse.json({ checkoutUrl: checkoutSession.url });
  } catch (error) {
    console.error("[Stripe checkout] session creation failed", error);
    const configurationError = error instanceof Error && ["STRIPE_SECRET_KEY", "STRIPE_COACHING_PRICE_ID"].some((name) => error.message.includes(name));
    return NextResponse.json({
      error: configurationError
        ? "決済設定が完了していません。管理者へお問い合わせください"
        : "決済処理を開始できませんでした。時間をおいて再度お試しください",
    }, { status: configurationError ? 503 : 500 });
  }
}
