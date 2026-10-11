import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const foundation = await readFile(new URL("../supabase/legacy_migrations/030_observation_data_foundation.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261011063755_multiple_observation_themes.sql", import.meta.url), "utf8");
const db = new PGlite();
const dog = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const coach = "44444444-4444-4444-8444-444444444444";
await db.exec(`
  create role authenticated; create role anon; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select current_setting('test.owner_id')::uuid$$;
  create function wt_is_coach() returns boolean language sql stable as $$select current_setting('test.actor',true) = 'coach'$$;
  create function wt_is_admin() returns boolean language sql stable as $$select false$$;
  create table wt_dogs(id uuid primary key, owner_id uuid);
  create table wt_coach_assignments(dog_id uuid, coach_id uuid);
  insert into wt_dogs values ('${dog}','${owner}');
  insert into wt_coach_assignments values ('${dog}','${coach}');
`);
// Execute the original table, trigger and policies rather than parallel test-only definitions.
await db.exec(foundation.match(/create table public\.wt_dog_observation_themes \([\s\S]*?\n\);/)[0]);
await db.exec(foundation.slice(foundation.indexOf("create or replace function public.wt_touch_observation_theme()"), foundation.indexOf("-- Enforce the one-to-one")));
await db.exec("alter table wt_dog_observation_themes enable row level security;");
await db.exec(foundation.slice(foundation.indexOf('create policy "owners select own dog observation themes"'), foundation.indexOf("-- Common entries:")));
await db.exec(`grant usage on schema auth to authenticated;
  grant select on wt_dogs, wt_coach_assignments to authenticated;
  grant select,insert,update,delete on wt_dog_observation_themes to authenticated;
  insert into wt_dog_observation_themes(dog_id,theme_key,sort_order) values
  ('${dog}','barking',1),('${dog}','walk',2),('${dog}','alone',3);`);
const rows = () => db.query("select * from wt_dog_observation_themes order by sort_order").then(r => r.rows);
const before = await rows();
const policiesBefore = (await db.query("select * from pg_policies where tablename='wt_dog_observation_themes' order by policyname")).rows;
await assert.rejects(db.query("insert into wt_dog_observation_themes(dog_id,theme_key,sort_order) values ($1,'toilet',4)",[dog]), /check constraint/);
await db.exec(migration);
assert.deepEqual(await rows(), before, "existing IDs, order and timestamps must be unchanged");
assert.deepEqual((await db.query("select * from pg_policies where tablename='wt_dog_observation_themes' order by policyname")).rows, policiesBefore);
await db.exec(`set role authenticated; set test.owner_id='${owner}'; set test.actor='owner';`);
for (const [i,key] of ["toilet","dog_reaction","person_reaction","biting","meal","sleep_rest","grooming"].entries()) {
  await db.query("insert into wt_dog_observation_themes(dog_id,theme_key,sort_order) values ($1,$2,$3)",[dog,key,i+4]);
}
assert.equal((await rows()).length,10,"owner can save all available themes");
await assert.rejects(db.query("insert into wt_dog_observation_themes(dog_id,theme_key,sort_order) values ($1,'barking',11)",[dog]), /unique constraint/);
await assert.rejects(db.query("update wt_dog_observation_themes set sort_order=0 where theme_key='barking'"), /check constraint/);
await assert.rejects(db.query("update wt_dog_observation_themes set theme_key='invalid' where theme_key='barking'"), /check constraint/);
await assert.rejects(db.query("update wt_dog_observation_themes set sort_order=2 where theme_key='barking'"), /unique constraint/);
await db.exec(`set test.owner_id='${outsider}';`);
assert.equal((await rows()).length,0,"other owners cannot read themes");
assert.equal((await db.query("delete from wt_dog_observation_themes returning id")).rows.length,0);
await assert.rejects(db.query("insert into wt_dog_observation_themes(dog_id,theme_key,sort_order) values ($1,'barking',11)",[dog]), /row-level security/);
await db.exec(`set test.owner_id='${coach}'; set test.actor='coach';`);
assert.equal((await rows()).length,10,"assigned coach can read all selected themes");
assert.equal((await db.query("delete from wt_dog_observation_themes returning id")).rows.length,0,"coach remains read-only");
await db.exec(`set test.owner_id='${owner}'; set test.actor='owner';`);
await db.query("delete from wt_dog_observation_themes where theme_key='alone'");
await db.query("insert into wt_dog_observation_themes(dog_id,theme_key,sort_order) values ($1,'alone',3)",[dog]);
assert.equal((await rows()).length,10,"deleted positions can be reused");
await db.close();
console.log("Observation themes SQL: all ten selections, existing data preserved, canonical/unique/order constraints and owner/coach isolation passed.");
