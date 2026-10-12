# Care reminder Web Push

Owners use the existing notification permission/subscription for both chat and care reminders. No browser timer sends care notifications. The scheduler runs independently of login and open tabs, in Asia/Tokyo, once per minute.

Since migration `20261012074037_weekly_care_dates_and_push_devices.sql`, subscriptions are unique by `(user_id, endpoint)`. Turning on another device preserves existing ones. Status, test delivery and disabling use the current browser endpoint; disabling or expiry must not remove other devices. Delivery fans out to valid table subscriptions plus the legacy metadata endpoint, deduplicated by endpoint. A successful provider response is acceptance, not proof that an OS displayed a notification. The owner's My Page offers a test notification for the current device.

Weekly goals have an optional `reminder_date`. When present, the reminder is eligible only on that Japanese calendar date, at the configured time, while the weekly target is incomplete. It is a specific date, without automatic weekly recurrence. Clearing it restores the previous reminder behavior. Goal counts and completion history are unchanged. Home and goal settings persist and display this date.

Postflight for this migration: goals 19, completions 44, subscriptions 2. The existing-field hashes before/after matched: goals `dc247734d8687cbc28035b5fcdd2ff54`, completions `28af503953cf8cd6741bf850527143b3`, subscriptions `f3f66c28b60793576212131e6835ee71`; existing policy hash remained `12bfd368027e4dcffd7b6362f32234e1`. Existing security advisor counts did not increase. Run `node tests/pushDevices.test.cjs` for device fanout, legacy deduplication and per-device status/disable/expiry checks.

`wt-care-push-reminders` invokes `wt_private.dispatch_care_reminders()`. Active goals with an assigned reminder time are eligible when incomplete for their daily, Monday-based weekly, or monthly target. The queue checks table subscriptions and the existing metadata fallback. A private UUID capability authorizes only one queued job at `/api/care/reminders`; the service role claims it atomically and rechecks activity, time and progress. Owners/anonymous clients cannot access jobs or claim RPCs.

There is one job per goal, Japanese calendar day and configured reminder time. Changing to a different future time on the same day creates a new slot even if the earlier slot was already delivered; the same time slot still deduplicates. New jobs are considered within two minutes of their scheduled time. Deliveries expire after five minutes and retry at most three claims. This prevents late catch-up notifications on login. Web Push uses a five-minute TTL and a per-job tag. Care notifications do not increment the unread chat badge. Clicking opens `/?view=goals`. Device/OS delivery can still be delayed. Delivery acknowledgements cannot be transactional with an external push provider; a retry after an acknowledgement failure can reach the provider again, with the same notification tag.

Migration `20261012070901_care_push_reminders.sql` was applied to project `bkihicvavawchnkdhynj` on 2026-10-12, leaving the job inactive until the API is released. Enable it only after Production builds successfully and capability-authenticated requests with nonexistent job IDs return `{ "accepted": true }`:

```sql
select cron.alter_job((select jobid from cron.job where jobname='wt-care-push-reminders'),active:=true);
```

To pause reminders, use the same statement with `active:=false`. Existing goals, completion history, user notification preferences and chat notifications stay intact.

## Preflight / postflight

| Check | Before | After migration |
|---|---|---|
| Care goals | 19 | 19 |
| Completion records | 44 | 44 |
| Goal rows MD5 | `5fdd280d60005120f64701488979a2ed` | identical |
| Completion rows MD5 | `909ecc0af265e4ca49a52f336881d21d` | identical |
| Existing care/dog/subscription policies MD5 | `12bfd368027e4dcffd7b6362f32234e1` | identical |
| Security advisor counts | 5 info; warnings 1/27/1 | identical |
| Reminder queue | absent | empty, RLS enabled |
| Anonymous/owner queue access | absent | denied |
| Owner claim RPC | absent | denied |
| Service role claim RPC | absent | permitted |

Run SQL/API/SW checks with `node tests/careReminders.sql.test.mjs`, `node tests/careReminderRoute.test.cjs`, `node tests/chatPushNotification.test.cjs`, `node tests/loginNotifications.test.cjs`, and `node tests/careClock.test.cjs`. SQL tests execute the migration in PGlite with controlled pg_cron/pg_net transports. They check subscription gating, period boundaries, archive/time-change cancellation, wrong capabilities, leases, retries, expiry, daily dedup and private grants. Production provider delivery requires a subscribed device receiving a naturally scheduled reminder.

Migration `20261012075927_care_reminder_rescheduled_times.sql` fixes same-day rescheduling being blocked by an earlier delivered reminder. Before/after counts and hashes matched for goals (19), completions (44), subscriptions (3), delivery history (2) and existing policies. The SQL regression test executes an earlier delivered slot followed by a different scheduled time and verifies that the new slot enqueues and claims exactly once.
