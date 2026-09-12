import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

const concernLabels: Record<string, string> = {
  barking: "吠え",
  nipping: "噛む・甘噛み",
  toilet: "トイレ",
  walk: "散歩・引っ張り",
  care: "日々のケア",
  relationship: "接し方全般",
};

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null) as { applicationId?: string } | null;
  if (!payload?.applicationId) return NextResponse.json({ error: "Application ID is required" }, { status: 400 });

  const { data: application, error: applicationError } = await supabase
    .from("wt_coaching_applications")
    .select("id,owner_id,dog_id,concern_categories,desired_outcome,note,submitted_at")
    .eq("id", payload.applicationId)
    .eq("owner_id", userData.user.id)
    .single();
  if (applicationError || !application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const { data: dog } = await supabase.from("wt_dogs").select("name,breed").eq("id", application.dog_id).single();
  const resendApiKey = process.env.RESEND_API_KEY;
  const slackWebhookUrl = process.env.SLACK_COACHING_WEBHOOK_URL;
  const adminEmail = process.env.COACHING_ADMIN_EMAIL ?? "mitaku0929@gmail.com";
  const fromEmail = process.env.COACHING_NOTIFICATION_FROM ?? "Wan Tone <onboarding@resend.dev>";
  const rawDogName = dog?.name ?? "名前未登録";
  const rawBreed = dog?.breed ?? "犬種未登録";
  const rawOwnerEmail = userData.user.email ?? "メール未確認";
  const rawConcerns = (application.concern_categories ?? []).map((item: string) => concernLabels[item] ?? item).join("・");
  const rawOutcome = application.desired_outcome;
  const rawNote = application.note ?? "";

  const emailRequest = resendApiKey
    ? fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `coaching-application-${application.id}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [adminEmail],
          subject: `【Wan Tone】${rawDogName}のコーチング相談が届きました`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#252825">
              <p style="font-size:12px;letter-spacing:.12em;color:#008661">WAN TONE COACHING</p>
              <h1 style="font-size:24px">新しいコーチング相談</h1>
              <div style="padding:20px;border-radius:16px;background:#f2f7f4">
                <p><strong>愛犬：</strong>${escapeHtml(rawDogName)}（${escapeHtml(rawBreed)}）</p>
                <p><strong>飼い主：</strong>${escapeHtml(rawOwnerEmail)}</p>
                <p><strong>相談テーマ：</strong>${escapeHtml(rawConcerns)}</p>
                <p><strong>目指したい状態：</strong><br>${escapeHtml(rawOutcome)}</p>
                ${rawNote ? `<p><strong>補足：</strong><br>${escapeHtml(rawNote)}</p>` : ""}
              </div>
              <p style="margin-top:22px"><a href="${request.nextUrl.origin}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#087155;color:white;text-decoration:none;font-weight:700">管理者画面を開く</a></p>
            </div>
          `,
        }),
      })
    : null;

  const slackRequest = slackWebhookUrl
    ? fetch(slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Wan Toneに${rawDogName}のコーチング相談が届きました`,
          blocks: [
            { type: "header", text: { type: "plain_text", text: "🐾 新しいコーチング相談", emoji: true } },
            { type: "section", fields: [
              { type: "mrkdwn", text: `*愛犬*\n${escapeSlack(rawDogName)}（${escapeSlack(rawBreed)}）` },
              { type: "mrkdwn", text: `*飼い主*\n${escapeSlack(rawOwnerEmail)}` },
              { type: "mrkdwn", text: `*相談テーマ*\n${escapeSlack(rawConcerns)}` },
              { type: "mrkdwn", text: `*目指したい状態*\n${escapeSlack(rawOutcome)}` },
            ] },
            ...(rawNote ? [{ type: "section", text: { type: "mrkdwn", text: `*補足*\n${escapeSlack(rawNote)}` } }] : []),
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "管理者画面を開く" }, url: request.nextUrl.origin, style: "primary" }] },
          ],
        }),
      })
    : null;

  const [emailResponse, slackResponse] = await Promise.all([emailRequest, slackRequest]);
  const delivery = {
    email: emailResponse ? emailResponse.ok : null,
    slack: slackResponse ? slackResponse.ok : null,
  };
  const configured = Boolean(emailRequest || slackRequest);
  const delivered = emailResponse?.ok || slackResponse?.ok || false;

  return NextResponse.json(
    { sent: delivered, delivery, reason: configured ? (delivered ? undefined : "notification_provider_error") : "notifications_not_configured" },
    { status: configured && !delivered ? 502 : 200 },
  );
}
