import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const outsider = "22222222-2222-4222-8222-222222222222";
const coach = "77777777-7777-4777-8777-777777777777";
const otherCoach = "88888888-8888-4888-8888-888888888888";
const dog = "33333333-3333-4333-8333-333333333333";
const otherDog = "44444444-4444-4444-8444-444444444444";
const father = "55555555-5555-4555-8555-555555555555";
const mother = "66666666-6666-4666-8666-666666666666";
await db.exec(`
  create role authenticated;
  create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('app.owner_id', true), '')::uuid $$;
  create function public.wt_is_coach() returns boolean language sql stable as
    $$ select current_setting('app.role',true) = 'coach' $$;
  create table public.wt_dogs (id uuid primary key, owner_id uuid not null);
  create table public.wt_coach_assignments (dog_id uuid, coach_id uuid);
  create table public.wt_observation_entries (
    id uuid primary key, dog_id uuid, owner_id uuid, entry_kind text,
    local_date date, deleted_at timestamptz, theme_key text
  );
  create table public.wt_observation_events (
    entry_id uuid primary key, event_result text, handled_by_member_id uuid,
    distance_band text, intensity smallint, recovery_seconds integer
  );
  create table public.wt_daily_checks (
    entry_id uuid primary key, appetite_score smallint, sleep_rest_score smallint,
    activity_score smallint, exploration_score smallint, calmness_score smallint,
    toilet_score smallint
  );
  create table public.wt_household_members (
    id uuid primary key, owner_id uuid, display_name text, deleted_at timestamptz
  );
  insert into public.wt_dogs values ('${dog}', '${owner}'), ('${otherDog}', '${outsider}');
  insert into public.wt_coach_assignments values ('${dog}', '${coach}'), ('${otherDog}', '${otherCoach}');
  insert into public.wt_household_members values
    ('${father}', '${owner}', 'パパ', now()), ('${mother}', '${owner}', 'ママ', null);
`);
async function event(date, result, handler, options = {}) {
  const id = randomUUID();
  await db.query("insert into wt_observation_entries values ($1,$2,$3,'event',$4,$5,'dog_reaction')",
    [id, options.other ? otherDog : dog, options.other ? outsider : owner, date, options.deleted ? new Date().toISOString() : null]);
  await db.query("insert into wt_observation_events values ($1,$2,$3,$4,$5,$6)",
    [id, result, handler, options.distance ?? null, options.intensity ?? null, options.recovery ?? null]);
}
async function daily(date, calmness, appetite) {
  const id = randomUUID();
  await db.query("insert into wt_observation_entries values ($1,$2,$3,'daily_check',$4,null,null)",
    [id, dog, owner, date]);
  await db.query("insert into wt_daily_checks values ($1,$2,null,null,null,$3,null)", [id, appetite, calmness]);
}
const results = ["success", "success", "success", "concern", "success", "neutral", "concern"];
for (let i = 0; i < 7; i++) {
  await event(`2026-09-${22+i}`, results[i], i < 4 ? father : mother, {
    distance: i < 3 ? "1_3m" : "5_10m",
    intensity: i < 3 ? [2, 4, 5][i] : null,
    recovery: i < 3 ? [60, 120, 180][i] : null,
  });
}
for (let i = 0; i < 5; i++) await event(`2026-09-${15+i}`,
  ["success", "success", "concern", "concern", "concern"][i], mother);
await event("2026-09-28", "concern", null, { other: true });
await event("2026-09-28", "concern", null, { deleted: true });
await daily("2026-09-22", 2, 4);
await daily("2026-09-23", null, null);
await daily("2026-09-24", 4, 5);
await daily("2026-09-15", 1, 3);
await daily("2026-09-16", 2, 4);
await daily("2026-09-17", 3, 5);

await db.exec(`
  alter table wt_dogs enable row level security;
  create policy owner_dog on wt_dogs for select to authenticated using (owner_id = auth.uid());
  alter table wt_coach_assignments enable row level security;
  create policy coach_assignment on wt_coach_assignments for select to authenticated
    using (wt_is_coach() and coach_id = auth.uid());
  create policy coach_dog on wt_dogs for select to authenticated using
    (wt_is_coach() and exists (select 1 from wt_coach_assignments a where a.dog_id=id and a.coach_id=auth.uid()));
  alter table wt_observation_entries enable row level security;
  create policy owner_entry on wt_observation_entries for select to authenticated
    using (owner_id = auth.uid() and deleted_at is null);
  create policy coach_entry on wt_observation_entries for select to authenticated using
    (wt_is_coach() and deleted_at is null and exists
      (select 1 from wt_coach_assignments a where a.dog_id=dog_id and a.coach_id=auth.uid()));
  alter table wt_observation_events enable row level security;
  create policy owner_event on wt_observation_events for select to authenticated
    using (exists (select 1 from wt_observation_entries e where e.id=entry_id));
  create policy coach_event on wt_observation_events for select to authenticated
    using (wt_is_coach() and exists (select 1 from wt_observation_entries e where e.id=entry_id));
  alter table wt_daily_checks enable row level security;
  create policy owner_daily on wt_daily_checks for select to authenticated
    using (exists (select 1 from wt_observation_entries e where e.id=entry_id));
  create policy coach_daily on wt_daily_checks for select to authenticated
    using (wt_is_coach() and exists (select 1 from wt_observation_entries e where e.id=entry_id));
  alter table wt_household_members enable row level security;
  create policy owner_member on wt_household_members for select to authenticated using (owner_id = auth.uid());
  create policy coach_member on wt_household_members for select to authenticated using
    (wt_is_coach() and exists (select 1 from wt_dogs d join wt_coach_assignments a on a.dog_id=d.id
      where d.owner_id=wt_household_members.owner_id and a.coach_id=auth.uid()));
  grant select on wt_dogs, wt_coach_assignments, wt_observation_entries,
    wt_observation_events, wt_daily_checks, wt_household_members to authenticated;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid(), public.wt_is_coach() to authenticated;
`);

const migration = await readFile(new URL("../supabase/legacy_migrations/033_observation_trends.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(`select set_config('app.owner_id','${owner}',false); set role authenticated;`);
const { rows: [trend] } = await db.query("select wt_observation_trends($1,'Asia/Tokyo',$2::date) as result", [dog, "2026-09-28"]);
const data = trend.result;
assert.deepEqual([data.current_start, data.previous_start, data.previous_end],
  ["2026-09-22", "2026-09-15", "2026-09-21"]);
const current = data.event_themes.find((row) => row.period === "current");
const previous = data.event_themes.find((row) => row.period === "previous");
assert.deepEqual([current.total_count, current.success_count, current.neutral_count, current.concern_count], [7,4,1,2]);
assert.deepEqual([current.success_rate, current.neutral_rate, current.concern_rate], [57.1,14.3,28.6]);
assert.deepEqual([previous.total_count, previous.concern_count], [5,3]);
const archivedHandler = data.handlers.find((row) => row.handled_by_member_id === father);
assert.deepEqual([archivedHandler.archived, archivedHandler.display_name, archivedHandler.total_count,
  archivedHandler.success_rate, archivedHandler.concern_rate], [true, "パパ", 4, 75, 25]);
const metrics = data.numeric_metrics.find((row) => row.period === "current");
assert.deepEqual([metrics.intensity_count, metrics.intensity_avg, metrics.intensity_median,
  metrics.recovery_count, metrics.recovery_avg_seconds, metrics.recovery_median_seconds], [3,3.67,4,3,120,120]);
const distance = data.distances.find((row) => row.period === "current" && row.distance_band === "5_10m");
assert.deepEqual([distance.total_count, distance.concern_count, distance.concern_rate], [4,2,50]);
const calmness = data.daily_metrics.find((row) => row.period === "current" && row.metric_key === "calmness_score");
assert.deepEqual([calmness.entered_days, calmness.average_score, calmness.median_score, calmness.minimum_score, calmness.maximum_score], [2,3,3,2,4]);
assert.equal(data.daily_metrics.find((row) => row.period === "current" && row.metric_key === "appetite_score").entered_days, 2);
assert.equal(data.daily_metrics.find((row) => row.period === "previous" && row.metric_key === "calmness_score").average_score, 2);
const day = data.daily_event_days.find((row) => row.local_date === "2026-09-22");
assert.deepEqual([day.calmness_score, day.event_count, day.concern_count], [2,1,0]);
assert.equal(data.daily_event_days.length, 14);
let denied = false;
try { await db.query("select wt_observation_trends($1,'Asia/Tokyo',$2::date)", [otherDog, "2026-09-28"]); }
catch (error) { denied = error.code === "42501"; }
assert.equal(denied, true);
await db.exec(`reset role; select set_config('app.owner_id','${coach}',false); select set_config('app.role','coach',false); set role authenticated;`);
const { rows: [coachTrend] } = await db.query("select wt_observation_trends($1,'Asia/Tokyo',$2::date) as result", [dog, "2026-09-28"]);
assert.equal(coachTrend.result.event_overall.find((row) => row.period === "current").total_count, 7);
assert.equal(coachTrend.result.handlers.find((row) => row.handled_by_member_id === father).display_name, "パパ");
const { rows: [visible] } = await db.query("select count(*)::integer as total from wt_observation_entries where dog_id=$1", [dog]);
assert.equal(visible.total, 18); // Twelve events and six Daily Checks; the soft-deleted event is excluded.
let otherDenied = false;
try { await db.query("select wt_observation_trends($1,'Asia/Tokyo',$2::date)", [otherDog, "2026-09-28"]); }
catch (error) { otherDenied = error.code === "42501"; }
assert.equal(otherDenied, true);
await db.exec(`reset role; delete from wt_coach_assignments where dog_id='${dog}'; set role authenticated;`);
const { rows: [afterRemoval] } = await db.query("select count(*)::integer as total from wt_observation_entries where dog_id=$1", [dog]);
assert.equal(afterRemoval.total, 0);
let revoked = false;
try { await db.query("select wt_observation_trends($1,'Asia/Tokyo',$2::date)", [dog, "2026-09-28"]); }
catch (error) { revoked = error.code === "42501"; }
assert.equal(revoked, true);
console.log(JSON.stringify({ current, previous, calmness, metrics, archived_handler: archivedHandler, linked_day: day,
  owner_boundary: "42501", coach_assigned_events: 7, other_coach_boundary: otherDenied, coach_revoked: revoked }));
await db.close();
