# New member Slack notifications

Production Supabase project: `bkihicvavawchnkdhynj`.
Production endpoint: `https://barknow-app.vercel.app/api/signup-notification`.

Only registrations after migration `20261011121748_signup_admin_notifications.sql` are queued. Anonymous accounts are excluded; conversion to a non-anonymous email account queues once. Existing-member email edits and repeat logins do not queue. Email confirmation is not required for the initial notification.

The Auth trigger inserts a private outbox row with a unique user ID and random delivery capability. pg_net submits the request after commit. The server claims a two-minute lease, reads the member from Auth using the existing server-only service role, sends through the dedicated `SLACK_SIGNUP_WEBHOOK_URL`, and records delivery. It never falls back to `SLACK_COACHING_WEBHOOK_URL`; coaching notifications keep their existing destination. Following the security audit, Slack receives only a registration notice, Japanese registration time and the production management link. Member email addresses and consultation details remain in the authenticated management screen. Passwords and webhook credentials are never included or logged.

## Channel configuration

The intended registration destination is `#app-new-member-registration`. Slack Incoming Webhooks bind to the channel selected when creating the webhook; sending a channel name in the payload cannot switch that destination.

1. In the existing Slack app's Incoming Webhooks settings, add a new webhook to the workspace and select `app-new-member-registration`.
2. In the Vercel `barknow-app` project, add `SLACK_SIGNUP_WEBHOOK_URL` for Production with that webhook URL. Enter the credential directly in Vercel, never in chat or source control. Leave `SLACK_COACHING_WEBHOOK_URL` unchanged.
3. Redeploy so the new environment variable takes effect, then verify a labeled test notification in that channel.

Until the dedicated URL is configured, the endpoint returns 503 before claiming a job. Pending jobs are retained, no delivery attempts are consumed, and the minute retry picks them up after configuration and deployment. Creating the code setting alone does not configure Slack or Vercel.

pg_cron retries pending work every minute, at most 25 jobs per run. Claimed deliveries are limited to ten attempts. Delivered rows are skipped; concurrent claims are excluded. A provider timeout after Slack accepted a request, or a successful Slack response followed by a database failure, can still produce a duplicate on retry: Slack incoming webhooks do not provide transactional exactly-once delivery. Exhausted jobs remain available for operator inspection; set attempts to zero and clear claim_until/queued_at only after checking Slack before manually retrying. Deleting the Auth member cascades the job deletion.

RLS and explicit grants deny anon/authenticated outbox reads and claim RPC execution. Migration `20261011122354_signup_notification_transport_privacy.sql` attempts transport-table grant hardening where the migration role is the table owner. Hosted pg_net tables are owned by supabase_admin and retained PUBLIC grants; postgres cannot revoke that owner's grants. Therefore the required boundary is that **net must never be exposed by the Data API**. A production request using the deployed browser's public key and `Accept-Profile: net` was rejected with HTTP 406/PGRST106; only public and graphql_public are exposed. SQL administrators can inspect transport headers, as with other webhook systems. The endpoint accepts only the per-job capability, which can deliver only that genuine registered member's pending notification, never read/change member data. User IDs, email addresses or browser sessions cannot trigger notifications. Processing errors never roll back an Auth registration.

Validation: PGlite exercises signup/conversion, no backfill, email edits, denied grants, wrong capability, leases, retry and network enqueue failure. Route tests cover validation, message data/escaping/timezone, duplicate delivery and failure paths. TypeScript, ESLint and production build pass. Before/after counts and row digests for 20 existing application tables, six Auth users, existing public functions/policies, table columns/grants and existing Auth trigger are unchanged. Security advisor findings remain at the existing baseline.

A production transaction inserted a temporary test Auth user, asserted the real trigger created an outbox job and pg_net HTTP request, then rolled back. No test Slack message was sent and no test account or job remains. A later live test sent one labeled test-member notification successfully at 2026-10-11 22:55 JST through the previous shared webhook; the temporary account and job were then deleted and existing member/role digests were unchanged. The new dedicated channel still requires configuration and its own delivery verification.
