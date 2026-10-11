import { NextRequest, NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  // Each private outbox row has a random capability, never exposed to browser clients.
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!uuid.test(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!uuid.test(payload?.jobId ?? "")) return NextResponse.json({ error: "Invalid job" }, { status: 400 });
  const webhook = process.env.SLACK_SIGNUP_WEBHOOK_URL?.trim();
  if (!webhook) return NextResponse.json({ error: "Notification unavailable" }, { status: 503 });
  try {
    const admin = serviceSupabase();
    const { data, error } = await admin.rpc("wt_claim_signup_notification", {
      target_job_id: payload.jobId, target_delivery_token: token,
    });
    if (error) throw new Error("claim_failed");
    const job = data?.[0];
    // Do not reveal whether a job exists, was delivered, or has a different capability.
    if (!job) return NextResponse.json({ accepted: true });
    let deliveryError = "";
    try {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(job.user_id);
      if (userError || !userData.user?.email || userData.user.is_anonymous) throw new Error("member_unavailable");
      const registered = new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo",
      }).format(new Date(job.created_at));
      const response = await fetch(webhook, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          text: "Wan Toneに新しい会員登録がありました",
          blocks: [
            { type: "header", text: { type: "plain_text", text: "新しい会員登録" } },
            { type: "section", fields: [
              { type: "mrkdwn", text: `*登録日時（日本時間）*\n${registered}` },
            ] },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "管理画面を開く" }, url: "https://barknow-app.vercel.app/", style: "primary" }] },
          ],
        }),
      });
      if (!response.ok) throw new Error(`slack_http_${response.status}`);
    } catch (error) {
      // Never log webhook URLs, credentials, user emails or provider response bodies.
      deliveryError = error instanceof Error && /^(slack_not_configured|member_unavailable|slack_http_\d+)$/.test(error.message)
        ? error.message : "slack_request_failed";
    }
    const { error: updateError } = await admin.from("wt_signup_notification_jobs").update(
      deliveryError ? { last_error: deliveryError, claim_until: null } : { sent_at: new Date().toISOString(), last_error: null, claim_until: null },
    ).eq("id", job.id).eq("claim_token", job.claim_token);
    if (updateError) throw new Error("delivery_status_failed");
    if (deliveryError) {
      console.warn("[Signup notification] delivery pending", { jobId: job.id, reason: deliveryError });
      return NextResponse.json({ accepted: true, pending: true }, { status: 502 });
    }
    return NextResponse.json({ accepted: true });
  } catch {
    console.error("[Signup notification] processing failed");
    return NextResponse.json({ error: "Notification unavailable" }, { status: 503 });
  }
}
