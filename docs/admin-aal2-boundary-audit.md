# Admin AAL2 boundary audit (2026-10-21)

Status: **read-only audit only**. Do not deploy AAL2 enforcement until privileged API review and real token matrix pass.

## Observed in production (Supabase bkihicvavawchnkdhynj)

- One verified TOTP factor observed. Verification alone does not prove every admin session has AAL2.
- `public.wt_is_admin()` and `public.wt_is_staff()` currently authorize based on role without checking JWT AAL.
- `wt_admin_set_role` is executable by authenticated clients and relies on `wt_is_admin()`. Thus an admin AAL1 token can potentially invoke role changes before DB enforcement.
- `wt_delete_user_data` is not executable by authenticated or anon roles; its SECURITY DEFINER body does not itself contain an authorization check. Keep execution privilege restricted to trusted service paths.
- `lib/server/supabase.ts` exports `requireStaffRole(userId)` which checks only role via service role; callers must separately verify a user-bound AAL2 JWT for admin-only access.
- Public RLS policies using `wt_is_admin()` cover roles, assignments, dogs, observation data, messages, profiles, and sessions. Storage policies also use `wt_is_admin()` / `wt_is_staff()`.

## Required before enabling the migration

1. Inventory **all** API route call sites of `serviceSupabase`, `requireStaffRole`, and other privileged service-role operations; guard admin-only endpoints with validated user JWT + AAL2 (not a client-supplied role or user ID). Preserve coach access where explicitly intended.
2. Audit all SECURITY DEFINER functions, RPC EXECUTE grants, RLS and Storage policies, including direct `wt_user_roles` queries and indirect authorization paths.
3. Snapshot exact production definitions of `wt_is_admin()` and `wt_is_staff()` for rollback; check verified TOTP enrollment for every admin.
4. Obtain **real** tokens for admin AAL1, admin AAL2, coach AAL1 and owner AAL1 in a controlled test environment. Never paste JWTs, secrets, or TOTP codes into issues or logs.
5. Verify admin AAL1 is denied by admin RPCs (including `wt_admin_set_role`), direct table RLS, Storage and admin-only API routes; admin AAL2 is allowed. Coach/owner operations must continue to work. Use non-destructive fixtures.
6. Apply `20261021150000_admin_mfa_aal2.sql` only after passing tests and explicit approval; repeat matrix in production and restore function snapshots on regression.

## Risk and rollback

The admin login UI and verified TOTP factor are working, but DB enforcement has **not** been applied. The existing AAL1 privilege path is a security gap; avoid treating the UI gate as server-side authorization. Never manually delete the sole verified factor. The staged enrollment fix PR #142 must be reviewed independently.
