import { NextRequest, NextResponse } from "next/server";
import { googleBusyRanges } from "@/lib/server/google-calendar";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { applicationId?: string; timeMin?: string; timeMax?: string } | null;
  if (!body?.applicationId || !body.timeMin || !body.timeMax) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = serviceSupabase();
  const { data: application } = await admin.from("wt_coaching_applications").select("owner_id,assigned_coach_id").eq("id", body.applicationId).eq("owner_id", user.id).maybeSingle();
  if (!application?.assigned_coach_id) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  try {
    return NextResponse.json({ busy: await googleBusyRanges(application.assigned_coach_id, body.timeMin, body.timeMax) });
  } catch (error) {
    return NextResponse.json({ busy: [], warning: error instanceof Error ? error.message : "Calendar unavailable" });
  }
}
