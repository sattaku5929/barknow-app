import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function serviceSupabase() {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function authenticatedSupabase(accessToken: string) {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const client = authenticatedSupabase(token);
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

export async function requireStaffRole(userId: string) {
  const admin = serviceSupabase();
  const { data } = await admin.from("wt_user_roles").select("role").eq("user_id", userId).maybeSingle();
  return data?.role === "admin" || data?.role === "coach" ? data.role : null;
}

/**
 * Validate the bearer token against Supabase Auth before trusting its AAL claim.
 * Admin access requires a current AAL2 JWT; coach access remains role-based.
 * Use this instead of requireStaffRole(userId) in privileged HTTP routes.
 */
export async function authenticatedStaffRole(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  const client = authenticatedSupabase(token);
  const { data: userData, error } = await client.auth.getUser(token);
  if (error || !userData.user) return null;
  const role = await requireStaffRole(userData.user.id);
  if (!role) return null;
  if (role === "admin") {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { sub?: string; aal?: string };
      if (claims.sub !== userData.user.id || claims.aal !== "aal2") return null;
    } catch {
      return null;
    }
  }
  return { user: userData.user, role };
}
