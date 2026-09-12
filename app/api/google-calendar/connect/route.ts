import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, requireStaffRole, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user || !(await requireStaffRole(user.id))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !redirectUri) return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 503 });
    const state = crypto.randomBytes(32).toString("base64url");
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    const admin = serviceSupabase();
    await admin.from("wt_google_oauth_states").delete().eq("coach_id", user.id);
    const { error } = await admin.from("wt_google_oauth_states").insert({ state_hash: stateHash, coach_id: user.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (error) throw error;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy",
      state,
    });
    return NextResponse.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "OAuth could not start" }, { status: 500 });
  }
}
