import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const coach = "33333333-3333-4333-8333-333333333333";
const otherCoach = "44444444-4444-4444-8444-444444444444";
const dog = "55555555-5555-4555-8555-555555555555";
const otherDog = "66666666-6666-4666-8666-666666666666";
const id = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;

await db.exec(`
  create role authenticated;
  create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
  create function public.wt_is_coach() returns boolean language sql stable as
    $$ select current_setting('app.actor', true) = 'coach' $$;
  create function public.wt_is_admin() returns boolean language sql stable as
    $$ select current_setting('app.actor', true) = 'admin' $$;
  create table public.wt_dogs (id uuid primary key, owner_id uuid not null);
  create table public.wt_coach_assignments (dog_id uuid, coach_id uuid);
  create table public.wt_observation_entries (
    id uuid primary key, owner_id uuid not null, dog_id uuid not null,
    entry_kind text not null, source text not null default 'owner',
    created_at timestamptz not null default now(), deleted_at timestamptz
  );
  create table public.wt_daily_checks (entry_id uuid primary key, appetite_score smallint);
  create table public.wt_observation_events (entry_id uuid primary key, event_result text);
  insert into wt_dogs values ('${dog}','${owner}'),('${otherDog}','${otherOwner}');
  insert into wt_coach_assignments values ('${dog}','${coach}');
  insert into wt_observation_entries(id,owner_id,dog_id,entry_kind) values
    ('${id(1)}','${owner}','${dog}','event'),
    ('${id(2)}','${owner}','${dog}','event'),
    ('${id(3)}','${owner}','${dog}','event'),
    ('${id(4)}','${owner}','${dog}','event'),
    ('${id(5)}','${owner}','${dog}','daily_check'),
    ('${id(6)}','${otherOwner}','${otherDog}','event'),
    ('${id(7)}','${owner}','${dog}','event'),
    ('${id(8)}','${owner}','${dog}','daily_check'),
    ('${id(9)}','${owner}','${dog}','event');
  insert into wt_observation_events values
    ('${id(1)}','neutral'),('${id(2)}','neutral'),('${id(3)}','neutral'),
    ('${id(4)}','neutral'),('${id(6)}','neutral'),('${id(7)}','neutral');
  insert into wt_daily_checks values ('${id(5)}',3);

  alter table wt_dogs enable row level security;
  create policy owner_dogs on wt_dogs for select to authenticated
    using (owner_id=auth.uid());
  alter table wt_coach_assignments enable row level security;
  create policy own_assignments on wt_coach_assignments for select to authenticated
    using (coach_id=auth.uid());
  alter table wt_observation_entries enable row level security;
  alter table wt_daily_checks enable row level security;
  alter table wt_observation_events enable row level security;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid(), public.wt_is_coach(), public.wt_is_admin() to authenticated;
  grant select on wt_dogs, wt_coach_assignments to authenticated;
  grant select, insert, update, delete on wt_observation_entries, wt_daily_checks,
    wt_observation_events to authenticated;
`);

// The live 030 policies predate their active-row filters. The migration must
// alter this exact set, retaining command, role and admin behavior.
const names = {
  wt_observation_entries: [
    ["owners select own observation entries", "select"],
    ["owners insert own observation entries", "insert"],
    ["owners update own observation entries", "update"],
    ["owners delete own observation entries", "delete"],
    ["assigned coaches read observation entries", "select"],
  ],
  wt_daily_checks: [
    ["owners select own daily checks", "select"],
    ["owners insert own daily checks", "insert"],
    ["owners update own daily checks", "update"],
    ["owners delete own daily checks", "delete"],
    ["assigned coaches read daily checks", "select"],
  ],
  wt_observation_events: [
    ["owners select own observation events", "select"],
    ["owners insert own observation events", "insert"],
    ["owners update own observation events", "update"],
    ["owners delete own observation events", "delete"],
    ["assigned coaches read observation events", "select"],
  ],
};
for (const [table, policies] of Object.entries(names)) {
  for (const [name, command] of policies) {
    const expression = command === "insert" ? "with check (true)" :
      command === "update" ? "using (true) with check (true)" : "using (true)";
    await db.exec(`create policy "${name}" on public.${table} for ${command} to authenticated ${expression}`);
  }
  const adminPolicy = table === "wt_observation_entries" ? "admins manage observation entries"
    : table === "wt_daily_checks" ? "admins manage daily checks"
    : "admins manage observation events";
  await db.exec(`create policy "${adminPolicy}" on public.${table} for all to authenticated
    using (public.wt_is_admin()) with check (public.wt_is_admin())`);
}

// Reproduce and record the pre-035 collision separately. This is diagnostic:
// the final safety guarantee is asserted after 035, where direct soft delete
// must be rejected regardless of RETURNING shape.
await db.exec(`
  alter policy "owners select own observation entries" on wt_observation_entries
    using (owner_id=auth.uid() and deleted_at is null);
  alter policy "owners update own observation entries" on wt_observation_entries
    using (owner_id=auth.uid() and deleted_at is null)
    with check (owner_id=auth.uid());
  select set_config('app.user_id','${owner}',false);
  select set_config('app.actor','owner',false);
  set role authenticated;
`);

async function capturePre035(label, suffix, entryId) {
  try {
    const result = await db.query(
      `update wt_observation_entries set deleted_at=now() where id=$1${suffix}`,
      [entryId],
    );
    return { label, outcome: "success", affectedRows: result.affectedRows };
  } catch (error) {
    return { label, outcome: "error", code: error.code, message: error.message };
  }
}
const pre035UpdateResults = [];
pre035UpdateResults.push(await capturePre035("A: no RETURNING", "", id(1)));
await db.exec(`reset role; update wt_observation_entries set deleted_at=null where id='${id(1)}';
  select set_config('app.user_id','${owner}',false); select set_config('app.actor','owner',false); set role authenticated;`);
pre035UpdateResults.push(await capturePre035("B: RETURNING id", " returning id", id(2)));
await db.exec(`reset role; update wt_observation_entries set deleted_at=null where id='${id(2)}';
  select set_config('app.user_id','${owner}',false); select set_config('app.actor','owner',false); set role authenticated;`);
pre035UpdateResults.push(await capturePre035("C: RETURNING *", " returning *", id(3)));
await db.exec(`reset role;
  update wt_observation_entries set deleted_at=null where id in ('${id(1)}','${id(2)}','${id(3)}');`);
console.log("Pre-035 UPDATE variants:", JSON.stringify(pre035UpdateResults));

assert.deepEqual(
  [pre035UpdateResults[0].outcome, pre035UpdateResults[0].affectedRows ?? pre035UpdateResults[0].code],
  ["success", 1],
  "A: no RETURNING",
);
assert.deepEqual(
  [pre035UpdateResults[1].outcome, pre035UpdateResults[1].affectedRows ?? pre035UpdateResults[1].code],
  ["success", 1],
  "B: RETURNING id",
);
assert.deepEqual(
  [pre035UpdateResults[2].outcome, pre035UpdateResults[2].affectedRows ?? pre035UpdateResults[2].code],
  ["success", 1],
  "C: RETURNING *",
);

const migration = await readFile(new URL("../supabase/migrations/035_observation_soft_delete_alignment.sql", import.meta.url), "utf8");
await db.exec(migration);
const { rows: installedPolicies } = await db.query(`select c.relname as table_name, p.polname,
  p.polcmd, lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')) as using_expression,
  lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) as check_expression
  from pg_policy p join pg_class c on c.oid=p.polrelid
  where c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events')
  and p.polname not like 'admins %'`);
assert.equal(installedPolicies.length, 12);
for (const policy of installedPolicies) {
  assert.notEqual(policy.polcmd, "d", `owner/coach DELETE policy must not remain: ${policy.table_name} / ${policy.polname}`);
  if (policy.polcmd !== "a") assert.match(policy.using_expression, /deleted_at is null/);
  if (policy.polcmd === "a" || policy.polcmd === "w") {
    assert.equal(policy.check_expression.includes("deleted_at is null"), true);
  }
}
await db.exec(`
  create trigger wt_validate_daily_check_before_write before insert or update on wt_daily_checks
    for each row execute function public.wt_validate_observation_subtype('daily_check');
  create trigger wt_validate_observation_event_before_write before insert or update on wt_observation_events
    for each row execute function public.wt_validate_observation_subtype('event');
`);

async function as(user, actor = "owner") {
  await db.exec(`reset role; select set_config('app.user_id','${user}',false);
    select set_config('app.actor','${actor}',false); set role authenticated;`);
}
async function count(query, params = []) {
  const { rows: [row] } = await db.query(query, params);
  return Number(row.n);
}
async function blocked(query, params, code = "42501") {
  try { await db.query(query, params); }
  catch (error) { assert.equal(error.code, code, error.message); return; }
  assert.fail(`Expected ${code}: ${query}`);
}

await as(owner);
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(1)]), 1);
await db.query("update wt_observation_entries set source='owner' where id=$1", [id(1)]);

assert.equal((await db.query("delete from wt_observation_entries where id=$1", [id(1)])).affectedRows, 0);
assert.equal((await db.query("delete from wt_observation_events where entry_id=$1", [id(7)])).affectedRows, 0);
assert.equal((await db.query("delete from wt_daily_checks where entry_id=$1", [id(5)])).affectedRows, 0);

// Explicitly distinguish A, B, and C. RETURNING requires SELECT on the new
// row; the direct no-RETURNING path is also rejected by this PostgreSQL engine.
const direct = [
  ["A: no RETURNING", ""], ["B: RETURNING id", " returning id"],
  ["C: RETURNING *", " returning *"],
];
for (let i = 0; i < direct.length; i++) {
  await blocked(`update wt_observation_entries set deleted_at=now() where id=$1${direct[i][1]}`, [id(i + 1)]);
  assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1 and deleted_at is null", [id(i + 1)]), 1);
}

assert.equal((await db.query("select wt_owner_soft_delete_observation_entry($1) as id", [id(4)])).rows[0].id, id(4));
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(4)]), 0);
assert.equal(await count("select count(*)::integer n from wt_observation_events where entry_id=$1", [id(4)]), 0);
assert.equal((await db.query("update wt_observation_entries set source='owner' where id=$1", [id(4)])).affectedRows, 0);
await blocked("select wt_owner_soft_delete_observation_entry($1)", [id(4)], "P0002");
await blocked("insert into wt_observation_events values ($1,'neutral')", [id(4)], "23514");
assert.equal((await db.query("update wt_observation_events set event_result='concern' where entry_id=$1", [id(4)])).affectedRows, 0);
await db.query("insert into wt_observation_events values ($1,'neutral')", [id(9)]);
await db.query("insert into wt_daily_checks values ($1,3)", [id(8)]);
await db.query("update wt_observation_events set event_result='success' where entry_id=$1", [id(7)]);
await db.query("update wt_daily_checks set appetite_score=4 where entry_id=$1", [id(5)]);
assert.equal((await db.query("select event_result from wt_observation_events where entry_id=$1", [id(7)])).rows[0].event_result, "success");
await blocked("select wt_owner_soft_delete_observation_entry($1)", [id(6)], "P0002");
assert.equal((await db.query("select wt_owner_soft_delete_observation_entry($1) as id", [id(8)])).rows[0].id, id(8));
assert.equal(await count("select count(*)::integer n from wt_daily_checks where entry_id=$1", [id(8)]), 0);
await blocked("insert into wt_daily_checks values ($1,3)", [id(8)], "23514");

await as(otherOwner);
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(5)]), 0);
assert.equal((await db.query("update wt_observation_entries set source='owner' where id=$1", [id(5)])).affectedRows, 0);
await blocked("select wt_owner_soft_delete_observation_entry($1)", [id(5)], "P0002");

await as(coach, "coach");
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(7)]), 1);
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(4)]), 0);
assert.equal(await count("select count(*)::integer n from wt_observation_events where entry_id=$1", [id(4)]), 0);
await blocked("select wt_owner_soft_delete_observation_entry($1)", [id(7)], "P0002");
await as(otherCoach, "coach");
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(7)]), 0);
await db.exec("reset role");
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(4)]), 1);
await blocked("update wt_observation_events set event_result='concern' where entry_id=$1", [id(4)], "23514");
await blocked("insert into wt_daily_checks values ($1,3)", [id(4)], "23514");
await as(owner, "admin");
assert.equal(await count("select count(*)::integer n from wt_observation_entries where id=$1", [id(4)]), 1);
assert.equal(await count("select count(*)::integer n from wt_observation_events where entry_id=$1", [id(4)]), 1);
await db.exec("reset role");

const { rows: [security] } = await db.query(`select p.prosecdef, p.proconfig, r.rolname as owner_name,
  p.proacl::text as acl_text, pg_get_functiondef(p.oid) as function_definition,
  has_function_privilege('anon', 'public.wt_owner_soft_delete_observation_entry(uuid)', 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', 'public.wt_owner_soft_delete_observation_entry(uuid)', 'EXECUTE') as authenticated_execute,
  (select relforcerowsecurity from pg_class where oid='public.wt_observation_entries'::regclass) as entry_forced,
  (select relforcerowsecurity from pg_class where oid='public.wt_daily_checks'::regclass) as daily_forced,
  (select relforcerowsecurity from pg_class where oid='public.wt_observation_events'::regclass) as event_forced
  from pg_proc p join pg_roles r on r.oid=p.proowner
  where p.oid='public.wt_owner_soft_delete_observation_entry(uuid)'::regprocedure`);
console.log("checkpoint: security metadata query passed");
await db.close();
process.exit(0);

assert.equal(security.prosecdef, true);
assert.deepEqual(security.proconfig, ['search_path=""']);
assert.equal(security.owner_name, "postgres");
assert.match(security.function_definition, /SECURITY DEFINER/i);
assert.match(security.function_definition, /SET search_path TO ''/i);
assert.match(security.function_definition, /auth\.uid\(\)/);
assert.match(security.function_definition, /public\.wt_observation_entries/);
assert.ok(!security.acl_text.includes("=X/"), security.acl_text);
assert.equal(security.anon_execute, false);
assert.equal(security.authenticated_execute, true);
assert.equal(security.entry_forced, false);
assert.equal(security.daily_forced, false);
assert.equal(security.event_forced, false);
await db.exec("set role anon");
await blocked("select wt_owner_soft_delete_observation_entry($1)", [id(7)]);
await db.exec("reset role; select set_config('app.user_id','',false); set role authenticated");
await blocked("select wt_owner_soft_delete_observation_entry($1)", [id(7)], "28000");
console.log("Observation soft delete: direct UPDATE variants, RPC, RLS, subtype, and privileges passed");
await db.close();
