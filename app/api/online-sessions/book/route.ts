import { after, NextRequest, NextResponse } from "next/server";
import { googleBusyRanges, processCalendarSyncJobs } from "@/lib/server/google-calendar";
import { authenticatedSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "ログイン情報を確認できませんでした" }, { status: 401 });

    const client = authenticatedSupabase(token);
    const { data: userData, error: userError } = await client.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ error: "ログインの有効期限が切れました。再度ログインしてください" }, { status: 401 });

    const body = await request.json().catch(() => null) as { applicationId?: string; slotId?: string; sessionType?: "initial" | "followup" } | null;
    if (!body?.applicationId || !body.slotId || !body.sessionType) return NextResponse.json({ error: "予約情報が不足しています" }, { status: 400 });

    // Active slots are readable by authenticated users through RLS. Using the
    // caller's client here keeps booking independent from the service-role key.
    const { data: slot, error: slotError } = await client
      .from("wt_coach_availability_slots")
      .select("coach_id,starts_at,ends_at")
      .eq("id", body.slotId)
      .eq("active", true)
      .maybeSingle();
    if (slotError) return NextResponse.json({ error: `予約枠を確認できませんでした（${slotError.message}）` }, { status: 409 });
    if (!slot) return NextResponse.json({ error: "この枠は利用できません" }, { status: 409 });

    try {
      const busy = await googleBusyRanges(slot.coach_id, slot.starts_at, slot.ends_at);
      if (busy.some((range) => new Date(range.start) < new Date(slot.ends_at) && new Date(range.end) > new Date(slot.starts_at))) {
        return NextResponse.json({ error: "Google Calendarに予定があるため、この枠は利用できません" }, { status: 409 });
      }
    } catch {
      // The app database remains authoritative if Google is temporarily unavailable.
    }

    const { data: sessionId, error } = await client.rpc("wt_book_online_session", {
      target_application_id: body.applicationId,
      target_slot_id: body.slotId,
      requested_session_type: body.sessionType,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });

    after(async () => {
      try {
        await processCalendarSyncJobs({ sessionId: String(sessionId), limit: 1 });
      } catch (error) {
        console.error("Calendar sync after booking failed", error);
      }
    });
    return NextResponse.json({ sessionId });
  } catch (error) {
    console.error("Online session booking failed", error);
    return NextResponse.json({
      error: error instanceof Error && error.message.includes("is not configured")
        ? "サーバーのSupabase設定を確認してください"
        : "予約処理に失敗しました。時間をおいてもう一度お試しください",
    }, { status: 500 });
  }
}
