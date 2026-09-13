import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { encryptRefreshToken, exchangeAuthorizationCode, googleAccountEmail } from "@/lib/server/google-calendar";
import { serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

function appRedirect(request: NextRequest, result: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  return NextResponse.redirect(new URL(`/?googleCalendar=${result}`, appUrl));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || request.nextUrl.searchParams.get("error")) return appRedirect(request, "denied");
  try {
    const admin = serviceSupabase();
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    const { data: storedState } = await admin.from("wt_google_oauth_states").select("coach_id,expires_at").eq("state_hash", stateHash).maybeSingle();
    await admin.from("wt_google_oauth_states").delete().eq("state_hash", stateHash);
    if (!storedState || new Date(storedState.expires_at).getTime() < Date.now()) throw new Error("OAuth state expired");
    const tokens = await exchangeAuthorizationCode(code);
    const email = await googleAccountEmail(tokens.access_token);
    const { data: existing } = await admin.from("wt_google_calendar_connections").select("encrypted_refresh_token,token_iv,token_tag").eq("coach_id", storedState.coach_id).maybeSingle();
    const encrypted = tokens.refresh_token ? encryptRefreshToken(tokens.refresh_token) : existing ? { encrypted: existing.encrypted_refresh_token, iv: existing.token_iv, tag: existing.token_tag } : null;
    if (!encrypted) throw new Error("Google did not return a refresh token");
    const { error } = await admin.from("wt_google_calendar_connections").upsert({
      coach_id: storedState.coach_id,
      google_email: email,
      calendar_id: "primary",
      encrypted_refresh_token: encrypted.encrypted,
      token_iv: encrypted.iv,
      token_tag: encrypted.tag,
      scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
      sync_status: "connected",
      last_error: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return appRedirect(request, "connected");
  } catch {
    return appRedirect(request, "error");
  }
}
