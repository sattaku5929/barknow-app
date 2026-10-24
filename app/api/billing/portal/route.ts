import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/server/supabase";
import { stripeClient } from "@/lib/server/stripe";
import { verifiedBillingSubscription } from "@/lib/server/billing-subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "ログインしてください" }, 401);
  try {
    const subscription = await verifiedBillingSubscription(user.id);
    return json({
      manageable: Boolean(subscription),
      status: subscription?.status ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    });
  } catch (error) {
    console.error("[Billing] subscription status lookup failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "契約状況を確認できませんでした。時間をおいて再度お試しください" }, 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "ログインしてください" }, 401);
  try {
    const subscription = await verifiedBillingSubscription(user.id);
    if (!subscription) return json({ error: "管理できる有料契約が見つかりませんでした" }, 403);

    // A dedicated portal configuration with cancellation enabled is required.
    // Fail closed rather than sending subscribers to a portal without cancellation.
    const configurationId = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim();
    if (!configurationId) return json({ error: "解約画面を準備中です。お問い合わせからご連絡ください" }, 503);
    const stripe = stripeClient();
    const configuration = await stripe.billingPortal.configurations.retrieve(configurationId);
    if (!configuration.active || !configuration.features.subscription_cancel?.enabled) {
      return json({ error: "解約画面を準備中です。お問い合わせからご連絡ください" }, 503);
    }

    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || "https://barknow-app.vercel.app").trim().replace(/\/$/, "");
    const origin = new URL(appOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
      return json({ error: "戻り先の設定を確認してください" }, 503);
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.customerId,
      configuration: configurationId,
      return_url: origin.origin + "/",
      locale: "ja",
    });
    if (!portal.url || new URL(portal.url).protocol !== "https:") throw new Error("Portal URL unavailable");
    return json({ url: portal.url });
  } catch (error) {
    console.error("[Billing] portal initialization failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "契約管理画面を開けませんでした。時間をおいて再度お試しください" }, 503);
  }
}
