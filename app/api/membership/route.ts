import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, requireStaffRole, serviceSupabase } from "@/lib/server/supabase";
import { membershipSummary } from "@/lib/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Read-only membership information for the signed-in user.
 * No payment IDs, billing operations, other user IDs or raw Supabase rows are exposed.
 */
export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: "ログインしてください" }, 401);

  try {
    const admin = serviceSupabase();
    const { data, error } = await admin
      .from("wt_subscriptions")
      .select("plan_status,activated_at,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    // The billing record remains untouched. Admin owner mode gets premium
    // functionality without representing a paid Stripe subscription.
    const staffPremiumAccess = await requireStaffRole(user.id) === "admin";
    return json({ ...membershipSummary(data), staffPremiumAccess });
  } catch (error) {
    console.error("[Membership] status lookup failed", { userId: user.id, error });
    return json({ error: "会員情報を確認できませんでした。再度お試しください。" }, 503);
  }
}
