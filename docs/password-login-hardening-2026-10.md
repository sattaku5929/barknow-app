# WanTone Password & Login security hardening (2026-10-24)

**Scope:** UI and password-recovery flow only. No DB changes, no AAL2/RPC/RLS changes. This is a review draft; do not merge without checking redirect allowlist and email flows.

## Verified starting point

- Supabase Security Advisors emits `auth_leaked_password_protection` WARN (one). This is a hosted Auth project setting, **not enabled by this PR**.
- The main login view previously sent a password-reset email that redirected to `window.location.origin`, without a password-change form to complete recovery.
- Login field had `minLength={8}` even though that rule should be reserved for password creation (pre-existing shorter passwords should not be blocked client-side).
- Existing error normalization sometimes gave misleading advice on any Supabase password error.
- The deployment may still rely on Supabase's built-in SMTP limit. Production email delivery and reset links **are not yet verified**.

## Proposed changes

1. Dedicated recovery route `/auth/reset-password` and auth `PASSWORD_RECOVERY` event check.
2. Verify session via `supabase.auth.getUser()` before changing the password; require confirmation, >=8 characters, clear field contents upon success.
3. Login password visibility toggle; avoid blocking login for a historical password shorter than eight characters.
4. Suppress user-enumeration detail in successful reset-request notice.

## Deployment and verification gates

- Supabase Dashboard → Authentication → URL Configuration: allow `https://barknow-app.vercel.app/auth/reset-password`. For Preview/manual testing, explicitly allow only the particular testing Preview callback URL needed; avoid blanket `*.vercel.app` wildcard where possible.
- Verify reset request for a dedicated test user, email delivery, recovery link, password update, old password rejection and new password login, without exposing test passwords or reset tokens in logs/screenshots.
- Verify forged/expired/no-token links cannot submit a password update; verify the user logged in before a recovery link is not accidentally modified.
- Test login, signup and admin TOTP login unchanged. Avoid sending live password reset messages to unsuspecting users.
- Review Supabase Authentication → Settings → Password security for leaked password protection; enable only after impact and plan/availability are checked. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Review SMTP and rate limits before production release.
- If CI, redirect verification or email delivery tests fail, stop and do not merge.

## Explicitly deferred

- PR #140, DB/RPC AAL2 enforcement, recovery operations for lost TOTP device, role permission matrix tests.
