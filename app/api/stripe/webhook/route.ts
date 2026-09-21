import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/server/supabase";
import { coachingPriceId, stripeClient, stripeWebhookSecret } from "@/lib/server/stripe";

export const runtime = "nodejs";

function stripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Stripe signature is missing" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = stripeClient().webhooks.constructEvent(payload, signature, stripeWebhookSecret());
  } catch (error) {
    console.error("[Stripe webhook] signature verification failed", error);
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  if (session.mode !== "subscription" || session.metadata?.plan !== "coaching") {
    return NextResponse.json({ received: true, ignored: true });
  }
  const userId = session.client_reference_id;
  if (!userId) {
    console.error("[Stripe webhook] client_reference_id is missing", { eventId: event.id, sessionId: session.id });
    return NextResponse.json({ error: "User reference is missing" }, { status: 400 });
  }

  try {
    const { error } = await serviceSupabase().from("wt_subscriptions").upsert({
      user_id: userId,
      plan_status: "active_member",
      stripe_customer_id: stripeId(session.customer),
      stripe_subscription_id: stripeId(session.subscription),
      stripe_checkout_session_id: session.id,
      stripe_price_id: coachingPriceId(),
      stripe_event_id: event.id,
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (error) {
    console.error("[Stripe webhook] subscription update failed", { eventId: event.id, userId, error });
    return NextResponse.json({ error: "Subscription update failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
