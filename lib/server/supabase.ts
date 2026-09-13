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
