import { NextRequest, NextResponse } from "next/server";
import { googleOAuthConfiguration } from "@/lib/server/google-calendar";
import { authenticatedUser, requireStaffRole, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user || !(await requireStaffRole(user.id))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await serviceSupabase().from("wt_google_calendar_connections").select("google_email,calendar_id,sync_status,last_error,connected_at,updated_at").eq("coach_id", user.id).maybeSingle();
  const configuration = googleOAuthConfiguration(request.nextUrl.origin);
  return NextResponse.json({ connected: data?.sync_status === "connected", connection: data ?? null, configuration });
}

export async function DELETE(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user || !(await requireStaffRole(user.id))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await serviceSupabase().from("wt_google_calendar_connections").delete().eq("coach_id", user.id);
  return NextResponse.json({ disconnected: true });
}
