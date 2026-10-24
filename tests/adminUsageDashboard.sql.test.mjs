import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261024123000_admin_usage_dashboard.sql", import.meta.url), "utf8");
const [admin,owner,coach] = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const db = new PGlite();
await db.exec(`create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user_id',true),'')::uuid$$;
create table public.wt_user_roles(user_id uuid primary key,role text);
create table public.wt_app_visits(owner_id uuid,visited_on date,created_at timestamptz);
create table public.wt_observation_entries(id uuid primary key,owner_id uuid,entry_kind text,local_date date,deleted_at timestamptz);
create table public.wt_daily_checks(entry_id uuid primary key);
create table public.wt_coaching_applications(id uuid primary key,submitted_at timestamptz);
create function public.wt_is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.wt_user_roles where user_id=auth.uid() and role='admin')
$$;
insert into public.wt_user_roles values ('${admin}','admin'),('${owner}','owner'),('${coach}','coach');
grant usage on schema public,auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function public.wt_is_admin() to authenticated;
`);
await db.exec(migration);
async function actor(id) {
  await db.exec(`reset role; select set_config('app.user_id','${id}',false); set role authenticated;`);
}
test("Admin aggregate is restricted to administrators", async () => {
  await actor(owner);
  await assert.rejects(db.query("select public.wt_admin_usage_dashboard()"), /Admin access required|permission denied/);
  await actor(coach);
  await assert.rejects(db.query("select public.wt_admin_usage_dashboard()"), /Admin access required|permission denied/);
  await actor(admin);
  const result = await db.query("select public.wt_admin_usage_dashboard() as stats");
  assert.equal(result.rows[0].stats.owner_count,1);
  assert.equal(result.rows[0].stats.coach_count,1);
  assert.equal(result.rows[0].stats.active_owners_7d,0);
  assert.equal(result.rows[0].stats.daily.length,7);
  assert.equal(result.rows[0].stats.daily_check_users_7d,0);
});
test("Anonymous role cannot execute the aggregate", async () => {
  await db.exec("reset role;set role anon");
  await assert.rejects(db.query("select public.wt_admin_usage_dashboard()"), /permission denied/);
});

test("Daily Check and visit counts deduplicate by user/day and ignore deleted entries", async () => {
  await db.exec("reset role");
  await db.query("insert into public.wt_app_visits(owner_id,visited_on) values ($1,(now() at time zone 'Asia/Tokyo')::date),($1,(now() at time zone 'Asia/Tokyo')::date)",[owner]);
  await db.query("insert into public.wt_observation_entries(id,owner_id,entry_kind,local_date) values ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',$1,'daily_check',(now() at time zone 'Asia/Tokyo')::date)",[owner]);
  await db.query("insert into public.wt_daily_checks(entry_id) values ('aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1')");
  await db.query("insert into public.wt_observation_entries(id,owner_id,entry_kind,local_date,deleted_at) values ('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2',$1,'daily_check',(now() at time zone 'Asia/Tokyo')::date,now())",[owner]);
  await db.query("insert into public.wt_daily_checks(entry_id) values ('aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2')");
  await actor(admin);
  const { rows } = await db.query("select public.wt_admin_usage_dashboard() as stats");
  assert.equal(rows[0].stats.active_owners_7d, 1);
  assert.equal(rows[0].stats.daily_check_users_7d, 1);
  assert.equal(rows[0].stats.daily_check_days_7d, 1);
  assert.equal(rows[0].stats.daily.at(-1).daily_check_users, 1);
});
