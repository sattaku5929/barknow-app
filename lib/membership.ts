/**
 * WanTone account membership, independent from a payment provider.
 * This is a read model for customer-facing status, not an authority to grant
 * coach/chat access. The entitlements enforcement will be separate work.
 */
export type MembershipState = "standard" | "active" | "payment_attention" | "ended";

export type MembershipSummary = {
  state: MembershipState;
  label: string;
  hasActiveMembership: boolean;
  activatedAt: string | null;
  updatedAt: string | null;
};

type MembershipRow = {
  plan_status: string | null;
  activated_at: string | null;
  updated_at: string | null;
};

function validTimestamp(value: string | null | undefined) {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/**
 * Map database status to an app-owned, provider-neutral representation.
 * Fail closed for unknown future payment status strings.
 */
export function membershipSummary(row: MembershipRow | null | undefined): MembershipSummary {
  const base = {
    activatedAt: validTimestamp(row?.activated_at),
    updatedAt: validTimestamp(row?.updated_at),
  };
  switch (row?.plan_status) {
    case "active_member":
      return { ...base, state: "active", label: "月額会員", hasActiveMembership: true };
    case "past_due":
      return { ...base, state: "payment_attention", label: "お支払いの確認が必要", hasActiveMembership: false };
    case "canceled":
      return { ...base, state: "ended", label: "契約終了", hasActiveMembership: false };
    default:
      return { ...base, state: "standard", label: "一般会員", hasActiveMembership: false };
  }
}
