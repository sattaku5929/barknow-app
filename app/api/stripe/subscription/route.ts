import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";
import { stripeClient } from "@/lib/server/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LinkedSubscription = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const manageableStatuses = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function verifiedContract(userId: string) {
  const admin = serviceSupabase();
  const { data, error } = await admin.from("wt_subscriptions")
    .select("stripe_customer_id,stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as LinkedSubscription | null;
  if (!row?.stripe_customer_id || !row.stripe_subscription_id) return null;
  if (!/^cus_[a-zA-Z0-9]+$/.test(row.stripe_customer_id) || !/^sub_[a-zA-Z0-9]+$/.test(row.stripe_subscription_id)) {
    throw new Error("Invalid subscription identifiers");
  }

  // The authenticated user ID selects the DB row. Never accept customer IDs from the browser.
  // Stripe is authoritative for whether a paid contract still exists.
  const subscription = await stripeClient().subscriptions.retrieve(row.stripe_subscription_id);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  if (customerId !== row.stripe_customer_id) throw new Error("Subscription customer mismatch");
  return {
    customerId,
    subscriptionStatus: subscription.status,
    cancellationScheduled: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    eligible: manageableStatuses.has(subscription.status),
  };
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return response({ error: "ログインしてください" }, 401);
  try {
    const contract = await verifiedContract(user.id);
    return response(contract
      ? { eligible: contract.eligible, status: contract.subscriptionStatus, cancellationScheduled: contract.cancellationScheduled }
      : { eligible: false });
  } catch (error) {
    console.error("[Stripe subscription] verify failed", { userId: user.id, error });
    return response({ error: "契約情報を確認できませんでした。時間をおいてお試しください。" }, 503);
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return response({ error: "ログインしてください" }, 401);
  try {
    const contract = await verifiedContract(user.id);
    if (!contract?.eligible) return response({ error: "管理対象の有料契約がありません" }, 403);
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://barknow-app.vercel.app").replace(/\/$/, "");
    const portal = await stripeClient().billingPortal.sessions.create({
      customer: contract.customerId,
      return_url: appUrl + "/",
    });
    if (!portal.url || !portal.url.startsWith("https://billing.stripe.com/")) {
      throw new Error("Unexpected Stripe customer portal URL");
    }
    return response({ url: portal.url });
  } catch (error) {
    console.error("[Stripe subscription] portal failed", { userId: user.id, error });
    return response({ error: "契約管理画面を開けませんでした。お問い合わせからご連絡ください。" }, 503);
  }
}
