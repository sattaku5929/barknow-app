import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";
import { membershipSummary } from "@/lib/membership";
import { resolveOwnerEntitlements, type OwnerCoachingStatus } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only, user-bound effective access. The database's RLS and online-session
 * INSERT trigger are always authoritative when enforcement is enabled.
 * No customer/checkout identifiers or staff-only information are returned.
 */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401, headers });

  try {
    const admin = serviceSupabase();
    const [subscription, application, control] = await Promise.all([
      admin.from("wt_subscriptions").select("plan_status,activated_at,updated_at").eq("user_id", user.id).maybeSingle(),
      admin.from("wt_coaching_applications")
        .select("status,dog_id,assigned_coach_id,owner_confirmed_at")
        .eq("owner_id", user.id).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("wt_coaching_access_control").select("enforce_paid").eq("singleton", true).maybeSingle(),
    ]);
    if (subscription.error || application.error) throw subscription.error || application.error;

    // Rolling upgrade: until the migration exists in production we must
    // preserve existing coaching routes. Other DB errors fail closed.
    const migrationNotApplied = control.error?.code === "42P01" ||
      control.error?.message?.includes("wt_coaching_access_control") && control.error?.code === "PGRST205";
    if (control.error && !migrationNotApplied) throw control.error;

    const enforcementActive = migrationNotApplied ? false : Boolean(control.data?.enforce_paid);
    const membership = membershipSummary(subscription.data);
    const coachId = application.data?.assigned_coach_id;
    const dogId = application.data?.dog_id;
    let hasMatchingAssignment = false;
    if (application.data?.owner_confirmed_at && coachId && dogId) {
      const assignment = await admin.from("wt_coach_assignments")
        .select("id").eq("owner_id", user.id).eq("dog_id", dogId).eq("coach_id", coachId).maybeSingle();
      if (assignment.error) throw assignment.error;
      hasMatchingAssignment = Boolean(assignment.data);
    }
    const policy = resolveOwnerEntitlements({
      membershipState: membership.state,
      coachingStatus: (application.data?.status ?? null) as OwnerCoachingStatus | null,
      assignedCoachId: hasMatchingAssignment ? coachId : null,
      ownerConfirmedAt: application.data?.owner_confirmed_at,
    });

    let temporaryAccess = false;
    if (enforcementActive && !policy.features.coachChat) {
      const grant = await admin.from("wt_coaching_trial_grants")
        .select("expires_at").eq("owner_id", user.id).maybeSingle();
      if (grant.error) throw grant.error;
      const expiresAt = grant.data?.expires_at ? new Date(grant.data.expires_at).getTime() : 0;
      // Do not grant an orphaned trial access without the same coach approval
      // the SQL guard checks.
      const coached = Boolean(
        application.data?.owner_confirmed_at && hasMatchingAssignment &&
        ["assigned", "consulting", "payment_pending", "active"].includes(application.data?.status ?? ""),
      );
      temporaryAccess = coached && Number.isFinite(expiresAt) && expiresAt > Date.now();
    }

    return NextResponse.json({
      enforcementActive,
      tier: policy.tier,
      availability: policy.availability,
      eligibleForChat: policy.features.coachChat || temporaryAccess,
      eligibleForBooking: policy.features.onlineCoachingBooking || temporaryAccess,
      temporaryAccess,
    }, { headers });
  } catch (error) {
    console.error("[Coaching access] authorization lookup failed", { userId: user.id, error });
    return NextResponse.json({ error: "コーチングの利用権限を確認できませんでした" }, { status: 503, headers });
  }
}
