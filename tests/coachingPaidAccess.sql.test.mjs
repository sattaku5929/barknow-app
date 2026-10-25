import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261025093000_coaching_paid_enforcement_foundation.sql", import.meta.url), "utf8");
const additionalGuard = await readFile(new URL("../supabase/migrations/20261025112000_paid_activation_entitlement_guard.sql", import.meta.url), "utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const coach = "33333333-3333-4333-8333-333333333333";
const admin = "44444444-4444-4444-8444-444444444444";
const dog = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherDog = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const application = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const db = new PGlite();

await db.exec(`
create role authenticated;
create role anon;
create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user_id',true),'')::uuid$$;
create table public.wt_user_roles(user_id uuid primary key,role text);
create function public.wt_is_admin() returns boolean language sql stable security definer as $$
 select exists(select 1 from public.wt_user_roles where user_id=auth.uid() and role='admin')$$;
create function public.wt_is_coach() returns boolean language sql stable security definer as $$
 select exists(select 1 from public.wt_user_roles where user_id=auth.uid() and role='coach')$$;
create table public.wt_dogs(id uuid primary key, owner_id uuid not null);
create table public.wt_coaching_applications(
 id uuid primary key, owner_id uuid not null, dog_id uuid not null,
 assigned_coach_id uuid, owner_confirmed_at timestamptz, status text
);
create table public.wt_coach_assignments(
 id uuid primary key default gen_random_uuid(), owner_id uuid, dog_id uuid, coach_id uuid
);
create table public.wt_subscriptions(user_id uuid primary key, plan_status text not null);
create table public.wt_coach_messages(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 dog_id uuid not null, sender text not null, body text not null
);
create table public.wt_online_sessions(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 dog_id uuid not null, coach_id uuid, application_id uuid
);
alter table public.wt_coach_messages enable row level security;
create policy "Owners send owner messages" on public.wt_coach_messages for insert to authenticated
with check (owner_id = auth.uid() and sender = 'owner');
create policy "assigned staff reply" on public.wt_coach_messages for insert to authenticated
with check (sender = 'coach' and (
 public.wt_is_admin() or (public.wt_is_coach() and exists(
 select 1 from public.wt_coach_assignments a where a.coach_id=auth.uid() and a.dog_id=wt_coach_messages.dog_id and a.owner_id=wt_coach_messages.owner_id))));
create policy "Owners read their messages" on public.wt_coach_messages for select to authenticated
using (owner_id=auth.uid());
create policy "assigned staff read messages" on public.wt_coach_messages for select to authenticated
using (public.wt_is_admin() or (public.wt_is_coach() and exists(
  select 1 from public.wt_coach_assignments a where a.coach_id=auth.uid() and a.dog_id=wt_coach_messages.dog_id)));

grant usage on schema auth,public to authenticated;
grant select on public.wt_coach_assignments, public.wt_coach_messages to authenticated;
grant insert on public.wt_coach_messages to authenticated;
grant select,insert on public.wt_online_sessions to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function public.wt_is_admin() to authenticated;
grant execute on function public.wt_is_coach() to authenticated;
insert into auth.users(id) values ('${owner}'),('${other}'),('${coach}'),('${admin}');
insert into public.wt_user_roles values ('${owner}','owner'),('${other}','owner'),('${coach}','coach'),('${admin}','admin');
insert into public.wt_dogs values ('${dog}','${owner}'),('${otherDog}','${other}');
insert into public.wt_coaching_applications values ('${application}','${owner}','${dog}','${coach}',now(),'assigned');
-- A confirmed status without an actual assignment is not eligible for a pilot grant.
insert into public.wt_coaching_applications values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${other}','${otherDog}','${coach}',now(),'assigned');
insert into public.wt_coach_assignments(owner_id,dog_id,coach_id) values ('${owner}','${dog}','${coach}');
`);
await db.exec(migration);
await db.exec(additionalGuard);
async function actor(id) {
  await db.exec("reset role");
  await db.query("select set_config('app.user_id',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function root(sql, params = []) {
  await db.exec("reset role");
  return db.query(sql, params);
}
async function send(id, ownerId, dogId, sender) {
  await actor(id);
  return db.query("insert into public.wt_coach_messages(owner_id,dog_id,sender,body) values ($1,$2,$3,'hello') returning id", [ownerId,dogId,sender]);
}
async function book(id, ownerId, dogId) {
  await actor(id);
  return db.query("insert into public.wt_online_sessions(owner_id,dog_id) values($1,$2) returning id", [ownerId,dogId]);
}
test("feature switch defaults OFF; existing confirmed cohort gets time-limited trial", async () => {
  const settings = await root("select enforce_paid from public.wt_coaching_access_control where singleton=true");
  assert.equal(settings.rows[0].enforce_paid, false);
  const grants = await root("select owner_id,expires_at > now() as valid from public.wt_coaching_trial_grants");
  assert.equal(grants.rows.length, 1);
  assert.equal(grants.rows[0].owner_id, owner);
  assert.equal(grants.rows[0].valid, true);
  assert.notEqual(grants.rows[0].owner_id, other); // unlinked assignment cannot receive pilot access
});

test("before activation normal chat and booking remain unchanged", async () => {
  assert.equal((await send(other, other, otherDog, "owner")).rows.length,1);
  assert.equal((await book(other, other, otherDog)).rows.length,1);
  await assert.rejects(send(other, owner, dog, "owner"), /row-level security|violates row-level/);
});

test("activation is blocked until missing confirmed assignments are reconciled", async () => {
  await assert.rejects(
    root("update public.wt_coaching_access_control set enforce_paid=true where singleton=true"),
    /confirmed coach assignments require reconciliation/,
  );
  const check = await root("select enforce_paid from public.wt_coaching_access_control");
  assert.equal(check.rows[0].enforce_paid, false);
  // Resolve an inconsistent test-only application by closing it; the migration
  // never fixes or alters existing production applications automatically.
  await root("update public.wt_coaching_applications set status='closed' where owner_id=$1", [other]);
});

test("a repaired assignment is not enough if the existing owner has no subscription or valid trial grant", async () => {
  await root("update public.wt_coaching_trial_grants set expires_at = now() - interval '1 day' where owner_id=$1", [owner]);
  await assert.rejects(
    root("update public.wt_coaching_access_control set enforce_paid=true where singleton=true"),
    /active subscription or approved non-expired pilot grant/,
  );
  const check = await root("select enforce_paid from public.wt_coaching_access_control");
  assert.equal(check.rows[0].enforce_paid, false);
  await root("update public.wt_coaching_trial_grants set expires_at = now() + interval '180 days' where owner_id=$1", [owner]);
});

test("active enforcement blocks unpaid writes, but preserves existing trial", async () => {
  await root("update public.wt_coaching_access_control set enforce_paid=true,changed_at=now() where singleton=true");
  await assert.rejects(send(other, other, otherDog, "owner"), /row-level security|violates row-level/);
  await assert.rejects(book(other, other, otherDog), /月額契約/);
  assert.equal((await send(owner, owner, dog, "owner")).rows.length,1);
  assert.equal((await book(owner, owner, dog)).rows.length,1);
});

test("trial grant expiration stops access; verified paid member restores it", async () => {
  await root("update public.wt_coaching_trial_grants set expires_at=now() - interval '1 day' where owner_id=$1",[owner]);
  await assert.rejects(send(owner, owner, dog, "owner"), /row-level security|violates row-level/);
  await root("insert into public.wt_subscriptions(user_id,plan_status) values($1,'active_member')",[owner]);
  assert.equal((await send(owner, owner, dog, "owner")).rows.length,1);
  await root("update public.wt_subscriptions set plan_status='canceled' where user_id=$1",[owner]);
  await assert.rejects(book(owner, owner, dog), /月額契約/);
});

test("paying alone without coach acceptance never grants access", async () => {
  await root("insert into public.wt_subscriptions(user_id,plan_status) values($1,'active_member')",[other]);
  await assert.rejects(send(other, other, otherDog, "owner"), /row-level security|violates row-level/);
  await assert.rejects(book(other, other, otherDog), /月額契約/);
});

test("coach replies are blocked when client is unpaid; administrator support still works", async () => {
  await assert.rejects(send(coach, owner, dog, "coach"), /row-level security|violates row-level/);
  assert.equal((await send(admin, owner, dog, "coach")).rows.length,1);
});

test("non-admin owners cannot toggle enforcement or grant own trial", async () => {
  await actor(other);
  await assert.rejects(db.query("update public.wt_coaching_access_control set enforce_paid=false"), /permission denied/);
  await assert.rejects(db.query("insert into public.wt_coaching_trial_grants(owner_id,expires_at,reason) values($1,now()+interval '1 day','self')",[other]), /permission denied/);
  const original = await root("select enforce_paid from public.wt_coaching_access_control where singleton=true");
  assert.equal(original.rows[0].enforce_paid,true);
});
