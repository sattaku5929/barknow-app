import { NextRequest, NextResponse } from "next/server";
import { processCalendarSyncJobs } from "@/lib/server/google-calendar";
import { authenticatedUser, requireStaffRole, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  const role = user ? await requireStaffRole(user.id) : null;
  if (!user || !role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { sessionId?: string } | null;
  if (body?.sessionId) {
    const { data: session } = await serviceSupabase().from("wt_online_sessions").select("coach_id").eq("id", body.sessionId).maybeSingle();
    if (!session || (role !== "admin" && session.coach_id !== user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await processCalendarSyncJobs({ sessionId: body.sessionId, limit: 1 });
  } else await processCalendarSyncJobs({ coachId: user.id, limit: 10 });
  return NextResponse.json({ processed: true });
}
