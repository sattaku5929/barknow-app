import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/server/supabase";
import { coachingPriceId, stripeClient, stripeWebhookSecret } from "@/lib/server/stripe";

export const runtime = "nodejs";

function stripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}


async function sendCoachingNotifications({
  eventId,
  adminUrl,
}: {
  eventId: string;
  adminUrl: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const slackWebhookUrl = process.env.SLACK_COACHING_WEBHOOK_URL?.trim();
  const fromEmail = process.env.COACHING_NOTIFICATION_FROM?.trim() || "Wan Tone <onboarding@resend.dev>";

  const deliveries: Promise<Response>[] = [];
  if (resendApiKey && adminEmail) {
    deliveries.push(fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `stripe-coaching-${eventId}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject: "🐾【WanTone】新しいコーチング相談が届きました",
        html: `<p>新しいコーチング相談が届きました。</p><p><a href="${escapeHtml(adminUrl)}">管理者画面で確認する</a></p>`,
      }),
    }));
  } else {
    console.warn("[Stripe webhook] admin email notification is not configured", {
      hasResendApiKey: Boolean(resendApiKey),
      hasAdminEmail: Boolean(adminEmail),
    });
  }

  if (slackWebhookUrl) {
    deliveries.push(fetch(slackWebhookUrl, {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "WanToneに新しいコーチング相談が届きました",
        blocks: [
          { type: "header", text: { type: "plain_text", text: "新しいコーチング相談" } },
          { type: "section", text: { type: "plain_text", text: "相談内容は管理画面で確認してください。" } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "管理者画面を開く" }, url: adminUrl, style: "primary" }] },
        ],
      }),
    }));
  }

  const results = await Promise.allSettled(deliveries);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[Stripe webhook] coaching notification request failed", result.reason);
    } else if (!result.value.ok) {
      console.error("[Stripe webhook] coaching notification provider returned an error", { status: result.value.status });
    }
  }
}

function planStatus(stripeStatus: Stripe.Subscription.Status) {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active_member";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "canceled";
  return "inactive";
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

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    // Webhook signature was verified above; still check the customer and subscription IDs
    // already linked to a WanTone user before changing any entitlement.
    const incoming = event.data.object as Stripe.Subscription;
    try {
      const live = await stripeClient().subscriptions.retrieve(incoming.id);
      const customerId = typeof live.customer === "string" ? live.customer : live.customer.id;
      const admin = serviceSupabase();
      const { error } = await admin.from("wt_subscriptions")
        .update({ plan_status: planStatus(live.status), updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", incoming.id)
        .eq("stripe_customer_id", customerId);
      if (error) throw error;
      return NextResponse.json({ received: true });
    } catch (error) {
      // Stripe may no longer return a hard-deleted subscription.
      if (event.type === "customer.subscription.deleted") {
        const customerId = typeof incoming.customer === "string" ? incoming.customer : incoming.customer.id;
        const admin = serviceSupabase();
        const { error: updateError } = await admin.from("wt_subscriptions")
          .update({ plan_status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", incoming.id)
          .eq("stripe_customer_id", customerId);
        if (!updateError) return NextResponse.json({ received: true });
      }
      console.error("[Stripe webhook] subscription state sync failed", { eventId: event.id, error });
      return NextResponse.json({ error: "Subscription state sync failed" }, { status: 500 });
    }
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

  const admin = serviceSupabase();
  try {
    const { data: existing } = await admin.from("wt_subscriptions").select("stripe_event_id").eq("user_id", userId).maybeSingle();
    if (existing?.stripe_event_id === event.id) return NextResponse.json({ received: true, duplicate: true });

    const liveSubscription = session.subscription ? await stripeClient().subscriptions.retrieve(stripeId(session.subscription)!) : null;
    const { error } = await admin.from("wt_subscriptions").upsert({
      user_id: userId,
      plan_status: liveSubscription ? planStatus(liveSubscription.status) : "inactive",
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

  try {
    const adminUrl = "https://barknow-app.vercel.app/";
    await sendCoachingNotifications({ eventId: event.id, adminUrl });
  } catch (error) {
    console.error("[Stripe webhook] coaching notification failed without affecting payment processing", { eventId: event.id, userId, error });
  }

  return NextResponse.json({ received: true });
}
