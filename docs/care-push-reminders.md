# Care reminder Web Push

Owners use the existing notification permission/subscription for both chat and care reminders. No browser timer sends care notifications. The scheduler runs independently of login and open tabs, in Asia/Tokyo, once per minute.

`wt-care-push-reminders` invokes `wt_private.dispatch_care_reminders()`. Active goals with an assigned reminder time are eligible when incomplete for their daily, Monday-based weekly, or monthly target. The queue checks table subscriptions and the existing metadata fallback. A private UUID capability authorizes only one queued job at `/api/care/reminders`; the service role claims it atomically and rechecks activity, time and progress. Owners/anonymous clients cannot access jobs or claim RPCs.

There is one job per goal per Japanese calendar day. New jobs are considered within two minutes of their scheduled time. Deliveries expire after five minutes and retry at most three claims. This prevents late catch-up notifications on login. Web Push uses a five-minute TTL and a per-goal/day tag. Care notifications do not increment the unread chat badge. Clicking opens `/?view=goals`. Device/OS delivery can still be delayed. Delivery acknowledgements cannot be transactional with an external push provider; a retry after an acknowledgement failure can reach the provider again, with the same notification tag.

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
