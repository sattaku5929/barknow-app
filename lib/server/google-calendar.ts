import crypto from "node:crypto";
import { serviceSupabase } from "./supabase";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function googleOAuthRedirectUri(requestOrigin?: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || requestOrigin;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  let expected: string;
  try {
    expected = new URL("/api/google-calendar/callback", appUrl).toString();
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid https URL");
  }
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured && configured !== expected) {
    throw new Error(`GOOGLE_OAUTH_REDIRECT_URI must exactly match ${expected}`);
  }
  return configured || expected;
}

export function googleOAuthConfiguration(requestOrigin?: string) {
  const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter((name) => !process.env[name]?.trim());
  try {
    const redirectUri = googleOAuthRedirectUri(requestOrigin);
    if (missing.length) return { configured: false, redirectUri, error: `未設定: ${missing.join(", ")}` };
    encryptionKey();
    return { configured: true, redirectUri, error: "" };
  } catch (error) {
    return { configured: false, redirectUri: "", error: error instanceof Error ? error.message : "Google OAuth configuration is invalid" };
  }
}

function encryptionKey() {
  const key = Buffer.from(required("GOOGLE_TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64 encoded 32-byte key");
  return key;
}

export function encryptRefreshToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { encrypted: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function decryptRefreshToken(encrypted: string, iv: string, tag: string) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

export async function exchangeAuthorizationCode(code: string, redirectUri: string) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description ?? payload.error ?? "Google OAuth token exchange failed");
  return payload as { access_token: string; refresh_token?: string; scope?: string; expires_in: number };
}

export async function googleAccountEmail(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json();
  if (!response.ok) throw new Error("Google account information could not be loaded");
  return String(payload.email ?? "");
}

async function accessTokenForCoach(coachId: string) {
  const admin = serviceSupabase();
  const { data, error } = await admin.from("wt_google_calendar_connections").select("encrypted_refresh_token,token_iv,token_tag").eq("coach_id", coachId).eq("sync_status", "connected").single();
  if (error || !data) throw new Error("Google Calendar is not connected");
  const refreshToken = decryptRefreshToken(data.encrypted_refresh_token, data.token_iv, data.token_tag);
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: required("GOOGLE_CLIENT_ID"), client_secret: required("GOOGLE_CLIENT_SECRET"), grant_type: "refresh_token" }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const status = payload.error === "invalid_grant" ? "revoked" : "error";
    await admin.from("wt_google_calendar_connections").update({ sync_status: status, last_error: String(payload.error_description ?? payload.error), updated_at: new Date().toISOString() }).eq("coach_id", coachId);
    throw new Error(payload.error_description ?? payload.error ?? "Google token refresh failed");
  }
  return String(payload.access_token);
}

async function googleFetch(coachId: string, path: string, init: RequestInit = {}) {
  const accessToken = await accessTokenForCoach(coachId);
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init.headers },
  });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Google Calendar API request failed");
  return payload;
}

export async function googleBusyRanges(coachId: string, timeMin: string, timeMax: string) {
  const admin = serviceSupabase();
  const { data } = await admin.from("wt_google_calendar_connections").select("calendar_id,sync_status").eq("coach_id", coachId).maybeSingle();
  if (!data || data.sync_status !== "connected") return [] as { start: string; end: string }[];
  const payload = await googleFetch(coachId, "/freeBusy", { method: "POST", body: JSON.stringify({ timeMin, timeMax, timeZone: "Asia/Tokyo", items: [{ id: data.calendar_id }] }) });
  return (payload?.calendars?.[data.calendar_id]?.busy ?? []) as { start: string; end: string }[];
}

export async function processCalendarSyncJobs(options: { coachId?: string; sessionId?: string; limit?: number } = {}) {
  const admin = serviceSupabase();
  let query = admin.from("wt_calendar_sync_jobs").select("id,session_id,coach_id,action,status,attempts").in("status", ["pending", "failed"]).lte("run_after", new Date().toISOString()).order("created_at").limit(options.limit ?? 5);
  if (options.coachId) query = query.eq("coach_id", options.coachId);
  if (options.sessionId) query = query.eq("session_id", options.sessionId);
  const { data: jobs } = await query;
  for (const job of jobs ?? []) {
    const { data: claimed } = await admin.from("wt_calendar_sync_jobs")
      .update({ status: "processing", attempts: job.attempts + 1, updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", job.status).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const { data: session, error } = await admin.from("wt_online_sessions").select("id,owner_id,dog_id,coach_id,session_type,status,starts_at,ends_at,google_event_id").eq("id", job.session_id).single();
      if (error || !session) throw new Error("Session not found");
      const [{ data: dog }, ownerResult, { data: connection }] = await Promise.all([
        admin.from("wt_dogs").select("name").eq("id", session.dog_id).single(),
        admin.auth.admin.getUserById(session.owner_id),
        admin.from("wt_google_calendar_connections").select("calendar_id,sync_status").eq("coach_id", session.coach_id).maybeSingle(),
      ]);
      if (!connection || connection.sync_status !== "connected") {
        await admin.from("wt_online_sessions").update({ calendar_sync_status: "not_connected", calendar_sync_error: null }).eq("id", session.id);
        await admin.from("wt_calendar_sync_jobs").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", job.id);
        continue;
      }
      const calendarId = encodeURIComponent(connection.calendar_id);
      if (job.action === "cancel" || session.status === "cancelled") {
        if (session.google_event_id) {
          try { await googleFetch(session.coach_id, `/calendars/${calendarId}/events/${encodeURIComponent(session.google_event_id)}?sendUpdates=all`, { method: "DELETE" }); } catch (error) { if (!(error instanceof Error && error.message.includes("not found"))) throw error; }
        }
        await admin.from("wt_online_sessions").update({ calendar_sync_status: "synced", calendar_sync_error: null }).eq("id", session.id);
      } else {
        const ownerEmail = ownerResult.data.user?.email;
        const eventBody = {
          summary: `Wan Tone ${session.session_type === "initial" ? "初回" : "継続"}オンライン診断｜${dog?.name ?? "愛犬"}`,
          description: "Wan Toneで予約されたオンライン診断です。",
          start: { dateTime: session.starts_at, timeZone: "Asia/Tokyo" },
          end: { dateTime: session.ends_at, timeZone: "Asia/Tokyo" },
          attendees: ownerEmail ? [{ email: ownerEmail }] : [],
          conferenceData: { createRequest: { requestId: `wantone-${session.id}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
        };
        const path = session.google_event_id
          ? `/calendars/${calendarId}/events/${encodeURIComponent(session.google_event_id)}?conferenceDataVersion=1&sendUpdates=all`
          : `/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`;
        const event = await googleFetch(session.coach_id, path, { method: session.google_event_id ? "PATCH" : "POST", body: JSON.stringify(eventBody) });
        let latestEvent = event;
        let meetUrl = latestEvent.hangoutLink ?? latestEvent.conferenceData?.entryPoints?.find((item: { entryPointType: string }) => item.entryPointType === "video")?.uri ?? null;
        for (let retry = 0; !meetUrl && retry < 3; retry += 1) {
          await new Promise((resolve) => setTimeout(resolve, 350 * (retry + 1)));
          latestEvent = await googleFetch(session.coach_id, `/calendars/${calendarId}/events/${encodeURIComponent(event.id)}`);
          meetUrl = latestEvent.hangoutLink ?? latestEvent.conferenceData?.entryPoints?.find((item: { entryPointType: string }) => item.entryPointType === "video")?.uri ?? null;
        }
        await admin.from("wt_online_sessions").update({ google_event_id: event.id, google_event_etag: latestEvent.etag ?? event.etag, meet_url: meetUrl, calendar_sync_status: meetUrl ? "synced" : "pending", calendar_sync_error: meetUrl ? null : "Google Meet URLを生成中です" }).eq("id", session.id);
        if (!meetUrl) throw new Error("Google Meet URLを生成中です");
      }
      await admin.from("wt_calendar_sync_jobs").update({ status: "completed", last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Calendar sync failed";
      const attempts = job.attempts + 1;
      await Promise.all([
        admin.from("wt_calendar_sync_jobs").update({ status: "failed", last_error: message, run_after: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id),
        admin.from("wt_online_sessions").update({ calendar_sync_status: "error", calendar_sync_error: message }).eq("id", job.session_id),
      ]);
    }
  }
}
