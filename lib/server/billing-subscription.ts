import { serviceSupabase } from "@/lib/server/supabase";
import { stripeClient } from "@/lib/server/stripe";

// Only authenticated owners of a verified Stripe subscription can manage billing.
// Never search customers by email or trust Stripe identifiers supplied by the browser.
const MANAGEABLE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

export async function verifiedBillingSubscription(userId: string) {
  const admin = serviceSupabase();
  const { data, error } = await admin
    .from("wt_subscriptions")
    .select("stripe_customer_id,stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.stripe_customer_id || !data?.stripe_subscription_id) return null;

  const subscription = await stripeClient().subscriptions.retrieve(data.stripe_subscription_id);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  if (customerId !== data.stripe_customer_id || subscription.metadata?.user_id !== userId) {
    console.error("[Billing] Subscription ownership mismatch");
    return null;
  }
  if (!MANAGEABLE_STATUSES.has(subscription.status)) return null;

  return {
    customerId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}
