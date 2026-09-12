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

  const { data, error } = await supabase.rpc("wt_coach_assignment_notification_details", {
    target_application_id: payload.applicationId,
  });
  const details = Array.isArray(data) ? data[0] : data;
  if (error || !details?.owner_email) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return NextResponse.json({ sent: false, reason: "email_not_configured" });

  const fromEmail = process.env.COACHING_NOTIFICATION_FROM ?? "Wan Tone <onboarding@resend.dev>";
  const dogName = escapeHtml(String(details.dog_name ?? "愛犬"));
  const coachEmail = escapeHtml(String(details.coach_email ?? "担当コーチ"));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `coaching-assignment-${payload.applicationId}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [details.owner_email],
      subject: `【Wan Tone】${dogName}の担当コーチが決まりました`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#252825">
          <p style="font-size:12px;letter-spacing:.12em;color:#008661">WAN TONE COACHING</p>
          <h1 style="font-size:24px">担当コーチが決まりました</h1>
          <div style="padding:20px;border-radius:16px;background:#f2f7f4">
            <p><strong>${dogName}</strong>の相談を担当するコーチが決まりました。</p>
            <p style="color:#65716c">担当：${coachEmail}</p>
            <p>これまでの記録を共有しながら、気になっていることをチャットで相談できます。</p>
          </div>
          <p style="margin-top:22px"><a href="${request.nextUrl.origin}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#087155;color:white;text-decoration:none;font-weight:700">コーチルームを開く</a></p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ sent: false, reason: "email_provider_error" }, { status: 502 });
  }
  return NextResponse.json({ sent: true });
}
