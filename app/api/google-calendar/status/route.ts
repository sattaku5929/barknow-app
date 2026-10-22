import { NextRequest, NextResponse } from "next/server";
import { googleOAuthConfiguration } from "@/lib/server/google-calendar";
import { authenticatedStaffRole, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Temporary read-only Preview diagnostic. Never return raw errors or secrets.
  let staff;
  try {
    staff = await authenticatedStaffRole(request);
  } catch {
    return NextResponse.json({ error: "Unavailable", diagnostic: "staff_auth_unavailable" }, { status: 503 });
  }
  const user = staff?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { data, error } = await serviceSupabase().from("wt_google_calendar_connections")
      .select("google_email,calendar_id,sync_status,last_error,connected_at,updated_at")
      .eq("coach_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: "Unavailable", diagnostic: "calendar_query_failed" }, { status: 503 });
    const configuration = googleOAuthConfiguration(request.nextUrl.origin);
    return NextResponse.json({ connected: data?.sync_status === "connected", connection: data ?? null, configuration });
  } catch {
    return NextResponse.json({ error: "Unavailable", diagnostic: "calendar_service_unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const staff = await authenticatedStaffRole(request);
  const user = staff?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await serviceSupabase().from("wt_google_calendar_connections").delete().eq("coach_id", user.id);
  return NextResponse.json({ disconnected: true });
}
