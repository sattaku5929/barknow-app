import type { MembershipState } from "@/lib/membership";

/**
 * Product policy only. This module does not authorize API calls, bypass RLS,
 * assign coaches, or grant a subscription. Enforcement will be rolled out
 * separately once billing / migration / pilot-user handling is validated.
 */
export type OwnerCoachingStatus =
  | "submitted" | "offered" | "assigned" | "consulting"
  | "payment_pending" | "active" | "closed";

export type OwnerEntitlementInput = {
  membershipState: MembershipState;
  coachingStatus?: OwnerCoachingStatus | null;
  assignedCoachId?: string | null;
  ownerConfirmedAt?: string | null;
};

export type OwnerCoachingAvailability =
  | "upgrade_required"
  | "payment_attention"
  | "awaiting_coach"
  | "ready";

export type OwnerEntitlements = {
  tier: "free" | "paid";
  features: {
    dogProfile: true;
    dailyCheck: true;
    quickLog: true;
    trends: true;
    careAndCalendar: true;
    coachingConsultationRequest: true;
    dedicatedCoach: boolean;
    coachChat: boolean;
    onlineCoachingBooking: boolean;
  };
  availability: OwnerCoachingAvailability;
};

const confirmedStatuses: ReadonlySet<OwnerCoachingStatus> =
  new Set(["assigned", "consulting", "payment_pending", "active"]);

/**
 * Treat payment and coach assignment as independent requirements:
 * - active subscription + confirmed coach => coaching ready
 * - active subscription but unassigned => awaiting coach
 * - no paid subscription => no new coaching entitlement
 *
 * Existing coaching data/history is NOT deleted when membership ends.
 */
export function resolveOwnerEntitlements(input: OwnerEntitlementInput): OwnerEntitlements {
  const paid = input.membershipState === "active";
  const confirmedCoach = Boolean(
    input.assignedCoachId?.trim() &&
    input.ownerConfirmedAt &&
    input.coachingStatus &&
    confirmedStatuses.has(input.coachingStatus),
  );
  const coachingReady = paid && confirmedCoach;
  const availability: OwnerCoachingAvailability =
    input.membershipState === "payment_attention" ? "payment_attention"
      : !paid ? "upgrade_required"
        : !confirmedCoach ? "awaiting_coach"
          : "ready";

  return {
    tier: paid ? "paid" : "free",
    availability,
    features: {
      dogProfile: true,
      dailyCheck: true,
      quickLog: true,
      trends: true,
      careAndCalendar: true,
      coachingConsultationRequest: true,
      dedicatedCoach: coachingReady,
      coachChat: coachingReady,
      onlineCoachingBooking: coachingReady,
    },
  };
}

export const membershipFeatureComparison = [
  { key: "dogProfile", label: "愛犬のプロフィール管理", free: true, paid: true },
  { key: "dailyCheck", label: "Daily Check・できごとの記録", free: true, paid: true },
  { key: "trends", label: "日々の変化・傾向の振り返り", free: true, paid: true },
  { key: "careAndCalendar", label: "お世話管理・カレンダー", free: true, paid: true },
  { key: "dedicatedCoach", label: "担当コーチによる伴走", free: false, paid: true },
  { key: "coachChat", label: "コーチとの個別チャット", free: false, paid: true },
  { key: "onlineCoachingBooking", label: "オンラインコーチング・予約", free: false, paid: true },
] as const satisfies readonly {
  key: keyof OwnerEntitlements["features"];
  label: string;
  free: boolean;
  paid: boolean;
}[];
