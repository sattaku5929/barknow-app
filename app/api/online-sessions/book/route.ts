import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { googleBusyRanges, processCalendarSyncJobs } from "@/lib/server/google-calendar";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { applicationId?: string; slotId?: string; sessionType?: "initial" | "followup" } | null;
  if (!body?.applicationId || !body.slotId || !body.sessionType) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = serviceSupabase();
  const { data: slot } = await admin.from("wt_coach_availability_slots").select("coach_id,starts_at,ends_at").eq("id", body.slotId).eq("active", true).maybeSingle();
  if (!slot) return NextResponse.json({ error: "この枠は利用できません" }, { status: 409 });
  try {
    const busy = await googleBusyRanges(slot.coach_id, slot.starts_at, slot.ends_at);
    if (busy.some((range) => new Date(range.start) < new Date(slot.ends_at) && new Date(range.end) > new Date(slot.starts_at))) {
      return NextResponse.json({ error: "Google Calendarに予定があるため、この枠は利用できません" }, { status: 409 });
    }
  } catch {
    // The app database remains authoritative if Google is temporarily unavailable.
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sessionId, error } = await client.rpc("wt_book_online_session", { target_application_id: body.applicationId, target_slot_id: body.slotId, requested_session_type: body.sessionType });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  after(() => processCalendarSyncJobs({ sessionId: String(sessionId), limit: 1 }));
  return NextResponse.json({ sessionId });
}
