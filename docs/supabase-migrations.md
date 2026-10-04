# Supabase migration baseline

WanTone uses the repository's Supabase migration chain as the source of truth.

## Active migration chain

- Active migrations live in `supabase/migrations/`.
- The production baseline is `20261004043000_production_baseline.sql`.
- Historical pre-baseline migrations `001` through `035` are retained in `supabase/legacy_migrations/` for auditability and SQL regression tests only.
- Do not move a legacy migration back into the active chain and do not re-run `001` through `035` against production.

## Fresh local database

Requirements:

- Docker
- Node.js
- Supabase CLI 2.119.0 or a compatible newer CLI

Commands:

```bash
npx supabase@2.119.0 start
npx supabase@2.119.0 db reset
```

`supabase/seed.sql` is intentionally empty. Production user data is not copied into local development.

## Creating a migration

Always create a timestamped migration with the CLI:

```bash
npx supabase@2.119.0 migration new <description>
```

This creates a filename like:

```text
YYYYMMDDHHMMSS_description.sql
```

Write only the forward change needed from the current schema. Do not edit the production baseline after migration history has been synchronized, except to correct the baseline procedure itself before any subsequent migration exists.

## Verification before production

Run at minimum:

```bash
npx supabase@2.119.0 db reset
npm run lint
npm run test:insights
npm run test:observations
npm run build
git diff --check
```

When a migration touches RLS, RPC/functions, triggers, grants, Storage policies, or extensions, verify those objects explicitly as well.

## Production history synchronization

The production schema existed before Supabase migration history was initialized. The baseline migration therefore must be marked as already applied in production **without executing the baseline SQL against production**.

Expected production history after synchronization:

```text
20261004043000  production_baseline
```

Before changing migration history:

1. Reconfirm the production schema snapshot and user-data snapshot.
2. Reconfirm that a fresh database built from the baseline is semantically equivalent to production.
3. Change migration history only.
4. Re-run migration list / dry-run checks.
5. Confirm schema and application data are unchanged.

## Legacy objects

Production contains legacy public relations `CUSTOMERS`, `dogs`, and `messages`. They are preserved in the baseline so a fresh schema matches production, but WanTone should not use them for new development.

The baseline recreates their schema only. It does not copy production rows.

## Storage and auth customizations

The baseline explicitly preserves:

- `coach-avatars` and `dog-avatars` Storage buckets
- Storage object policies for those buckets
- the WanTone auth-user trigger
- Realtime publication membership required by the current production schema

These are part of reproducible system configuration even though Storage bucket rows are not application user data.
