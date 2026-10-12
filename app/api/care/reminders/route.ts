import { NextRequest, NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/server/supabase";
import { sendPushNotification } from "@/lib/pushSender";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!uuid.test(token)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!uuid.test(input?.jobId ?? "")) return NextResponse.json({ error: "Invalid job" }, { status: 400 });

  try {
    const admin = serviceSupabase();
    // A private capability authorizes only this queued reminder, never arbitrary recipients.
    const { data, error } = await admin.rpc("wt_claim_care_reminder", {
      target_job_id: input!.jobId, target_delivery_token: token,
    });
    if (error) throw new Error("claim_failed");
    const job = data?.[0];
    if (!job) return NextResponse.json({ accepted: true });

    try {
      const delivery = await sendPushNotification(job.owner_id, "WanTone｜毎日やること",
        `${job.dog_name}の「${job.title}」の時間です。`, "/?view=goals", {
          kind: "care", tag: `care-${job.goal_id}-${job.reminder_on}`,
        });
      const { error: finishError } = await admin.from("wt_care_reminder_jobs").update({
        finished_at: new Date().toISOString(), delivery_status: delivery === "sent" ? "sent" : "skipped",
        claim_until: null, last_error: null,
      }).eq("id", job.id).eq("claim_token", job.claim_token);
      if (finishError) throw new Error("finish_failed");
      return NextResponse.json({ accepted: true });
    } catch {
      const { error: releaseError } = await admin.from("wt_care_reminder_jobs").update({
        claim_until: null, last_error: "push_delivery_failed",
      }).eq("id", job.id).eq("claim_token", job.claim_token);
      if (releaseError) console.error("[Care reminder] claim release failed");
      return NextResponse.json({ error: "Delivery failed" }, { status: 502 });
    }
  } catch {
    console.error("[Care reminder] processing failed");
    return NextResponse.json({ error: "Notification unavailable" }, { status: 503 });
  }
}
