import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/server/supabase";
import { coachingPriceId, stripeClient, stripeWebhookSecret } from "@/lib/server/stripe";

export const runtime = "nodejs";

const concernLabels: Record<string, string> = {
  barking: "吠え",
  nipping: "噛む・甘噛み",
  toilet: "トイレ",
  walk: "散歩・引っ張り",
  care: "日々のケア",
  relationship: "接し方全般",
};

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

function escapeSlack(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendCoachingNotifications({
  admin,
  eventId,
  userId,
  adminUrl,
}: {
  admin: ReturnType<typeof serviceSupabase>;
  eventId: string;
  userId: string;
  adminUrl: string;
}) {
  const [{ data: application, error: applicationError }, { data: userData, error: userError }] = await Promise.all([
    admin
      .from("wt_coaching_applications")
      .select("id,dog_id,concern_categories,desired_outcome,note,submitted_at")
      .eq("owner_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  if (applicationError) throw applicationError;
  if (userError) throw userError;

  const { data: dog, error: dogError } = application?.dog_id
    ? await admin.from("wt_dogs").select("name,breed").eq("id", application.dog_id).maybeSingle()
    : { data: null, error: null };
  if (dogError) throw dogError;

  const dogName = String(dog?.name ?? "名前未登録");
  const breed = String(dog?.breed ?? "犬種未登録");
  const ownerEmail = String(userData.user?.email ?? "メール未確認");
  const concerns = Array.isArray(application?.concern_categories)
    ? application.concern_categories.map((item: string) => concernLabels[item] ?? item).join("・")
    : "コーチングプラン";
  const desiredOutcome = String(application?.desired_outcome ?? "愛犬との暮らしをより良くしたい");
  const note = String(application?.note ?? "");
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const slackWebhookUrl = process.env.SLACK_COACHING_WEBHOOK_URL?.trim();
  const fromEmail = process.env.COACHING_NOTIFICATION_FROM?.trim() || "Wan Tone <onboarding@resend.dev>";

  const deliveries: Promise<Response>[] = [];
  if (resendApiKey && adminEmail) {
    deliveries.push(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `stripe-coaching-${eventId}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject: "🐾【WanTone】新しいコーチング相談が届きました",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:auto;color:#252825;line-height:1.7">
            <div style="padding:28px;border:1px solid #d9e9e1;border-radius:20px;background:#ffffff">
              <p style="margin:0;color:#008661;font-size:12px;font-weight:700;letter-spacing:.12em">WAN TONE COACHING</p>
              <h1 style="margin:8px 0 24px;font-size:24px">🐾 新しいコーチング相談</h1>
              <div style="padding:20px;border-radius:15px;background:#f2f7f4">
                <p style="margin:0 0 16px"><strong>【愛犬】</strong><br>${escapeHtml(dogName)}（${escapeHtml(breed)}）</p>
                <p style="margin:0 0 16px"><strong>【飼い主】</strong><br>${escapeHtml(ownerEmail)}</p>
                <p style="margin:0 0 16px"><strong>【相談テーマ】</strong><br>${escapeHtml(concerns)}</p>
                <p style="margin:0"><strong>【目指したい状態】</strong><br>${escapeHtml(desiredOutcome)}</p>
                ${note ? `<p style="margin:16px 0 0"><strong>【補足】</strong><br>${escapeHtml(note)}</p>` : ""}
              </div>
              <p style="margin:24px 0 0"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#087155;color:#fff;text-decoration:none;font-weight:700">管理者画面を開く</a></p>
            </div>
          </div>
        `,
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `WanToneに${dogName}のコーチング相談が届きました`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "🐾 新しいコーチング相談", emoji: true } },
          { type: "section", fields: [
            { type: "mrkdwn", text: `*愛犬*\n${escapeSlack(dogName)}（${escapeSlack(breed)}）` },
            { type: "mrkdwn", text: `*飼い主*\n${escapeSlack(ownerEmail)}` },
            { type: "mrkdwn", text: `*相談テーマ*\n${escapeSlack(concerns)}` },
            { type: "mrkdwn", text: `*目指したい状態*\n${escapeSlack(desiredOutcome)}` },
          ] },
          ...(note ? [{ type: "section", text: { type: "mrkdwn", text: `*補足*\n${escapeSlack(note)}` } }] : []),
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

  const admin = serviceSupabase();
  try {
    const { data: existing } = await admin.from("wt_subscriptions").select("stripe_event_id").eq("user_id", userId).maybeSingle();
    if (existing?.stripe_event_id === event.id) return NextResponse.json({ received: true, duplicate: true });

    const { error } = await admin.from("wt_subscriptions").upsert({
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

  try {
    const adminUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "");
    await sendCoachingNotifications({ admin, eventId: event.id, userId, adminUrl });
  } catch (error) {
    console.error("[Stripe webhook] coaching notification failed without affecting payment processing", { eventId: event.id, userId, error });
  }

  return NextResponse.json({ received: true });
}
