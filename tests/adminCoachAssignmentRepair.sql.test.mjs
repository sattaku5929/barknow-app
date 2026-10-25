import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261025110000_admin_coach_assignment_repair.sql", import.meta.url), "utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const admin = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const dog = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const appId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const db = new PGlite();
await db.exec([
"create role authenticated;",
"create role anon;",
"create role service_role;",
"create schema auth;",
"create table auth.users(id uuid primary key);",
"create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user_id',true),'')::uuid$$;",
"create table public.wt_user_roles(user_id uuid primary key, role text);",
"create function public.wt_is_admin() returns boolean language sql stable security definer as $$ select exists(select 1 from public.wt_user_roles where user_id=auth.uid() and role='admin') $$;",
"create table public.wt_dogs(id uuid primary key,owner_id uuid);",
"create table public.wt_coach_profiles(coach_id uuid primary key references auth.users(id));",
"create table public.wt_coaching_applications(id uuid primary key, owner_id uuid, dog_id uuid, status text, assigned_coach_id uuid, owner_confirmed_at timestamptz);",
"create table public.wt_online_sessions(id uuid primary key default gen_random_uuid(),application_id uuid, owner_id uuid, dog_id uuid, coach_id uuid);",
"create table public.wt_coach_assignments(id uuid primary key default gen_random_uuid(),coach_id uuid not null,owner_id uuid not null,dog_id uuid not null,unique(coach_id,dog_id));",
"grant usage on schema public,auth to authenticated;",
"grant execute on function auth.uid() to authenticated;",
"grant execute on function public.wt_is_admin() to authenticated;",
"insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');",
"insert into public.wt_user_roles values ('11111111-1111-4111-8111-111111111111','owner'),('22222222-2222-4222-8222-222222222222','admin'),('33333333-3333-4333-8333-333333333333','owner');",
"insert into public.wt_dogs values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');",
"insert into public.wt_coach_profiles values ('22222222-2222-4222-8222-222222222222');",
"insert into public.wt_coaching_applications values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','assigned','22222222-2222-4222-8222-222222222222',now());",
"insert into public.wt_online_sessions(application_id,owner_id,dog_id,coach_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');",
].join("\n"));
await db.exec(migration);

async function asUser(id) {
  await db.exec("reset role");
  await db.query("select set_config('app.user_id',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function root(sql, values = []) {
  await db.exec("reset role");
  return db.query(sql, values);
}
const repair = (reason = "管理者兼任コーチによる継続担当を双方確認して復旧") =>
  db.query("select public.wt_admin_reconcile_confirmed_assignment($1,$2) as outcome", [appId,reason]);

test("anonymous users cannot execute either admin-only repair RPC", async () => {
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select * from public.wt_admin_coaching_assignment_issues()"), /permission denied/);
  await assert.rejects(db.query("select public.wt_admin_reconcile_confirmed_assignment($1,$2)", [appId, "unsafe anonymous repair attempt"]), /permission denied/);
});

test("only an actual admin can inspect or repair missing assignments", async () => {
  await asUser(other);
  await assert.rejects(db.query("select * from public.wt_admin_coaching_assignment_issues()"), /admin role required/);
  await assert.rejects(repair(), /admin role required/);
  await assert.rejects(db.query("insert into public.wt_assignment_repair_audit(application_id,owner_id,dog_id,coach_id,repaired_by,justification) values($1,$2,$3,$4,$5,'manual repair')", [appId,owner,dog,admin,other]), /permission denied/);
});

test("admin review displays only currently confirmed applications missing assignments", async () => {
  await asUser(admin);
  const rows = await db.query("select * from public.wt_admin_coaching_assignment_issues()");
  assert.equal(rows.rows.length,1);
  assert.equal(rows.rows[0].application_id,appId);
  assert.equal(rows.rows[0].coach_role,"admin");
  assert.equal(rows.rows[0].coach_profile_exists,true);
  assert.equal(rows.rows[0].booked_sessions,1);
});

test("admin must state why original coach should continue", async () => {
  await asUser(admin);
  await assert.rejects(repair("ok"), /written confirmation/);
  const a = await root("select count(*)::int as n from public.wt_coach_assignments");
  assert.equal(a.rows[0].n,0);
});

test("repair inserts exactly one assignment with audit, preserving role and histories", async () => {
  await asUser(admin);
  const result = await repair();
  assert.equal(result.rows[0].outcome.repaired,true);
  const a = await root("select count(*)::int as n from public.wt_coach_assignments where owner_id=$1 and dog_id=$2 and coach_id=$3",[owner,dog,admin]);
  assert.equal(a.rows[0].n,1);
  const audit = await root("select count(*)::int as n from public.wt_assignment_repair_audit where repaired_by=$1 and application_id=$2",[admin,appId]);
  assert.equal(audit.rows[0].n,1);
  const unchanged = await root("select (select count(*)::int from public.wt_online_sessions) as sessions, (select count(*)::int from public.wt_coaching_applications) as applications, (select role from public.wt_user_roles where user_id=$1) as coach_role",[admin]);
  assert.equal(unchanged.rows[0].sessions,1);
  assert.equal(unchanged.rows[0].applications,1);
  assert.equal(unchanged.rows[0].coach_role,"admin");
});

test("running repair again never duplicates or replaces an existing assignment", async () => {
  await asUser(admin);
  await assert.rejects(repair(), /existing coach assignment/);
  const count = await root("select count(*)::int as n from public.wt_assignment_repair_audit");
  assert.equal(count.rows[0].n,1);
});

test("closed coaching applications cannot be restored as active assignments", async () => {
  await root("delete from public.wt_coach_assignments");
  await root("update public.wt_coaching_applications set status='closed'");
  await asUser(admin);
  const issues = await db.query("select * from public.wt_admin_coaching_assignment_issues()");
  assert.equal(issues.rows.length,0);
  await assert.rejects(repair(), /no currently confirmed coaching application/);
});
