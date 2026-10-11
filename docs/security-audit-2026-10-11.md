# WanTone security audit — 2026-10-11

Scope: application source, dependency lockfile, production public-table RLS/grants/functions, Storage configuration, chat attachment delivery, notification payloads, push destinations and browser cache isolation. This is a targeted audit, not a guarantee that every vulnerability or past incident has been identified. No evidence of an actual customer-data breach was established by these checks.

Release: [PR #132](https://github.com/sattaku5929/barknow-app/pull/132) merged; Vercel production status succeeded for `8c86d25f11182206f3000aeb7c37a7787597e7fb`. Both migrations applied, with their history versions aligned to the committed filenames. All 29 public tables, six Auth users and three Storage objects retained their counts/digests. Dog bucket is private, coach bucket remains public, attachment guard is active. An existing unsigned dog-photo URL now returns HTTP 400; production home returns 200 with security headers and unauthenticated media POST returns 401/private/no-store. Cloudflare R2 public-access disablement remains outstanding.

## Findings, ordered by priority

| Priority | Finding | Remediation / status |
| --- | --- | --- |
| High | Chat attachments used permanent public R2 URLs. Anyone holding a URL could bypass application authorization. | Application now reads attachment keys through the caller's message RLS and issues five-minute signed URLs. New uploads use private/no-store caching and logical `r2://` references. **Cloudflare public access must still be disabled separately**, including both r2.dev and any custom domain. Until then, old public URLs can remain accessible. |
| High | Dog profile photos were in a public Supabase bucket. | All dog-photo readers use five-minute signed URLs. Storage SELECT is limited to the owner, assigned coach and admin; phase two switches only `dog-avatars` to private. Public coach profile photos are preserved. |
| High | Four legacy tables accepted inconsistent owner/dog pairs. Chat writes could attach another uploader's guessed object key or quote another conversation. | Database triggers enforce actual dog ownership, uploader namespace, safe keys, attachment scheme/type and same-conversation replies. API also checks the stored R2 object's MIME type and size. Existing messages and records are preserved. |
| High | User-controlled push endpoints could cause server requests to arbitrary hosts, including metadata fallback. | Validate destinations at both subscription storage and send time against supported Google, Apple, Mozilla and Windows push-service hosts. HTTPS only, no credentials or nonstandard ports. |
| High | Runtime dependency audit included critical/high findings. | Next.js and eslint-config-next updated to 16.4.0; compatible transitive patches applied. `npm audit --omit=dev`: zero known findings. |
| Medium | Registration and consultation alerts copied customer details to Slack/admin email. | Keep alerts and existing destinations, remove customer email/name/dog name/concerns/free-text notes; link to the authenticated management screen. Owner transactional assignment email is preserved. |
| Medium | Anonymous users inherited execution privileges for 28 security-definer functions, though examined function bodies checked authorization. | Revoke PUBLIC/anon execution and public-table access. Preserve existing explicit authenticated/service access. Trigger-only functions are not directly callable by authenticated clients. No anonymous data read was demonstrated. |
| Medium | Owner cache was not tied to a verified account. | Bind cache to verified user ID; clear legacy/other-account caches and in-memory owner data; preserve same-account offline data. Clear/reload on cross-tab sign-out or account switch. |
| Medium | Missing browser hardening headers and explicit sensitive-API caching policy. | Add nosniff, DENY framing, no-referrer, and API private/no-store. |

## Deployment sequence

1. Compare production data snapshot with `security-audit-preflight.json`; halt on unexplained differences.
2. Apply `20261011145334_security_access_hardening.sql`. No customer-row edits. The attachment validation function is created but its trigger waits for phase two so the currently deployed upload client continues to work.
3. Verify data hashes, intended grants/policies/triggers and advisors. Merge/deploy signed readers and updated upload API. Check Vercel's successful production status.
4. Apply `20261011150823_private_media_activation.sql`: enable the attachment trigger and mark the dog bucket private. Recheck application/Auth rows and Storage object counts/digests; coach bucket remains public.
5. Cloudflare operator: R2 → chat bucket → Settings → disable Public Development URL (r2.dev), and remove/disable any Custom Domains that serve the bucket. If a domain was cached, purge its cached objects. Keep S3 API access, bucket contents and existing upload CORS; signed GET/PUT requests use the authenticated S3 endpoint and do not require public access. Verify an old public URL fails and an authorized signed URL still opens.

Supabase bucket privacy and R2 domain privacy are separate controls. The application change alone cannot revoke a Cloudflare public domain. Signed URLs remain bearer capabilities until their five-minute expiry; do not paste them into public channels.

## Validation and limits

- PGlite executes the actual migrations with captured production policy bodies: owner/assigned coach/admin access, denied unrelated owner/coach, anonymous denial, foreign-dog writes, foreign attachment keys, unsafe URLs, cross-conversation replies and self-promotion. No production customer data is copied into local tests.
- Phase-one production postflight: all 29 public-table counts/digests and six Auth users match preflight; all six existing accounts' real message/photo SELECT scopes match expected owner/assignment/admin access in a rolled-back transaction. Anonymous function execution and table SELECT privileges are zero. Service-only account deletion remains inaccessible to authenticated/anonymous clients. The advisor's anonymous security-definer findings fall from 28 to zero; 27 authenticated-function warnings remain for guarded app RPCs.
- API tests cover RLS-selected attachment signing, five-minute lifetime, no caching, unsafe paths/hosts, push endpoints, account cache isolation, minimal alerts and payment processing. Existing signup SQL/route, insights, observations, care, calendar, profile and home-event regression tests pass.
- TypeScript and production build pass. Targeted edited-file ESLint has zero errors. Repository-wide ESLint has 50 pre-existing errors (49 in legacy CommonJS test files and one initial-view effect in `app/page.tsx`); these were not introduced by this patch. Two private-image `<img>` warnings are intentional: signed customer media is not routed through a shared optimizer cache.
- Docker is unavailable in this workspace, so a full `supabase db reset` could not run. SQL regression checks use local PGlite; production metadata and data integrity are checked separately before/after migration.
- Real local Next production server: home returns 200 with security headers; unauthenticated media POST returns 401 with private/no-store. Authenticated media behavior is covered by route mocks plus real database authorization checks; a customer-browser end-to-end upload/download has not been exercised here.
- Full dependency audit retains five high findings in the **build-only** eslint/fast-glob/micromatch/braces chain. No compatible nonbreaking fix is offered by npm; forced downgrade was avoided. Keep CI inputs trusted and track upstream patches. Runtime audit is zero.
- Tracked-source secret scan found no actual credentials matching the checked Slack/Stripe/JWT patterns. This does not cover complete Git history or external account configuration. Rotate any credentials known to have been shared elsewhere.

## Account / operational controls still needed

- Supabase advisor reports leaked-password protection disabled: enable it in Auth settings if supported by the plan. See the [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
- Enable MFA for administrator accounts in GitHub, Vercel, Supabase and Slack; review membership and grant the least access needed. Application-admin MFA is a separate future feature, not added silently to the current login flow.
- Confirm managed database backup/PITR retention and recovery procedure, and separately protect/restore R2 objects. Count/hash snapshots in this repository are integrity evidence, **not backups**.
- Keep `net` out of exposed Data API schemas. Hosted pg_net transport tables are owned by `supabase_admin`; postgres cannot revoke their managed PUBLIC grants. Existing public-key Data API verification rejected `Accept-Profile: net` with 406/PGRST106.
- Security-definer helpers callable by authenticated users remain because the app needs them; inspected definitions authorize against database roles/assignments. Intentional service-only Google integration/outbox tables retain RLS with no client policies. The existing public `btree_gist` extension was not moved, avoiding booking-constraint breakage.
- Consultation alerts can still be retriggered by the same authenticated owner for their own application; add a private delivery outbox/rate limit in a subsequent operational hardening pass if notification abuse becomes a concern. Signup alerts already have a leased/deduplicated private outbox.

References: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Cloudflare R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
