import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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
    .select("id,owner_id,submitted_at")
    .eq("id", payload.applicationId)
    .eq("owner_id", userData.user.id)
    .single();
  if (applicationError || !application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const resendApiKey = process.env.RESEND_API_KEY;
  const slackWebhookUrl = process.env.SLACK_COACHING_WEBHOOK_URL;
  const adminEmail = process.env.COACHING_ADMIN_EMAIL ?? "mitaku0929@gmail.com";
  const fromEmail = process.env.COACHING_NOTIFICATION_FROM ?? "Wan Tone <onboarding@resend.dev>";
  const managementUrl = "https://barknow-app.vercel.app/";
  const emailRequest = resendApiKey
    ? fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `coaching-application-${application.id}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [adminEmail],
          subject: "【Wan Tone】新しいコーチング相談が届きました",
          html: `<p>新しいコーチング相談が届きました。</p><p><a href="${managementUrl}">管理者画面で確認する</a></p>`,
        }),
      })
    : null;

  const slackRequest = slackWebhookUrl
    ? fetch(slackWebhookUrl, {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Wan Toneに新しいコーチング相談が届きました",
          blocks: [
            { type: "header", text: { type: "plain_text", text: "新しいコーチング相談" } },
            { type: "section", text: { type: "plain_text", text: "相談内容は管理画面で確認してください。" } },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "管理者画面を開く" }, url: managementUrl, style: "primary" }] },
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
