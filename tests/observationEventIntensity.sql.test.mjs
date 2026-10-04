import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/legacy_migrations/034_observation_event_intensity_five_levels.sql", import.meta.url), "utf8");

async function database(values) {
  const db = new PGlite();
  await db.exec(`create schema if not exists public;
    create table public.wt_observation_events (
      entry_id integer primary key,
      intensity smallint check (intensity is null or intensity between 1 and 10),
      duration_seconds integer,
      recovery_seconds integer
    );`);
  for (let index = 0; index < values.length; index++) {
    const [intensity, duration, recovery] = values[index];
    await db.query("insert into public.wt_observation_events values ($1,$2,$3,$4)", [index + 1, intensity, duration, recovery]);
  }
  await db.exec(migration);
  return db;
}

const existingFive = await database([[null, null, null], [1, 10, 30], [5, 60, 0]]);
assert.deepEqual((await existingFive.query("select intensity,duration_seconds,recovery_seconds from public.wt_observation_events order by entry_id")).rows,
  [{ intensity: null, duration_seconds: null, recovery_seconds: null }, { intensity: 1, duration_seconds: 10, recovery_seconds: 30 }, { intensity: 5, duration_seconds: 60, recovery_seconds: 0 }]);
await assert.rejects(existingFive.query("insert into public.wt_observation_events values (4,6,10,30)"), /check constraint/);
await existingFive.close();

const legacyTen = await database(Array.from({ length: 10 }, (_, index) => [index + 1, 10, 30]));
assert.deepEqual((await legacyTen.query("select intensity from public.wt_observation_events order by entry_id")).rows.map((row) => row.intensity),
  [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
assert.deepEqual((await legacyTen.query("select distinct duration_seconds,recovery_seconds from public.wt_observation_events")).rows,
  [{ duration_seconds: 10, recovery_seconds: 30 }]);
await legacyTen.close();
console.log("034 intensity constraint and seconds preservation passed");
