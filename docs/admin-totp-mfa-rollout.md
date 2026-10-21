# WanTone Admin TOTP rollout and recovery

## Production preflight 2026-10-21
- Supabase project bkihicvavawchnkdhynj.
- 1 admin account; 0 verified admin TOTP factors.
- 61 public RLS policies and 30 SECURITY DEFINER functions.
- Ten admin RPCs use wt_is_admin; two also use wt_is_staff.
- Full privileged API and RPC audit is still pending.

## Required phased rollout
1. Snapshot roles, schema, policies, and function definitions without recording secrets.
2. Deploy and verify enrollment UI for the existing admin first.
3. Confirm a verified TOTP factor and AAL2 session on every admin account.
4. Audit every privileged RPC, RLS, Storage policy, and service-role API; close AAL1 bypasses.
5. Test real owner, coach, admin AAL1 and admin AAL2 tokens on tables, RPCs and API routes.
6. Only after passing tests apply the AAL2 migration; repeat all access tests in production.
7. Roll back the migration from reviewed function snapshots if there is a regression.

## Lost device recovery
- Require verified out-of-band identity proof by an authorized operator.
- Use Supabase Auth administrative MFA-factor removal, then re-enroll TOTP.
- Never expose service-role keys or TOTP secrets to browser logs or email.
- Rehearse recovery in a nonproduction environment before enforcing AAL2.

## Current status
- Read-only live inventory and admin RPC guard checks completed.
- Static tests authored but real-token tests not performed.
- Production MFA enforcement is NOT applied and must remain blocked until prerequisites pass.