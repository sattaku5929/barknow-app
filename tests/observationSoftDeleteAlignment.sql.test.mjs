import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/035_observation_soft_delete_alignment.sql", import.meta.url), "utf8");
const owner = "11111111-1111-4111-8111-111111111111";
const dog = "55555555-5555-4555-8555-555555555555";

const oldSubtype = `
create or replace function public.wt_validate_observation_subtype()
returns trigger language plpgsql set search_path=public,pg_catalog as $$
declare expected_kind text := tg_argv[0];
begin
  if not exists (select 1 from public.wt_observation_entries entry
    where entry.id=new.entry_id and entry.entry_kind=expected_kind) then
    raise exception 'observation subtype requires entry_kind %', expected_kind using errcode='23514';
  end if;
  return new;
end; $$;`;

const finalSubtype = `
create or replace function public.wt_validate_observation_subtype()
returns trigger language plpgsql set search_path=public,pg_catalog as $$
declare expected_kind text := tg_argv[0];
begin
  if not exists (select 1 from public.wt_observation_entries entry
    where entry.id=new.entry_id and entry.entry_kind=expected_kind and entry.deleted_at is null) then
    raise exception 'observation subtype requires an active entry_kind %', expected_kind using errcode='23514';
  end if;
  return new;
end; $$;`;

const finalRpc = `
create or replace function public.wt_owner_soft_delete_observation_entry(p_entry_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller_id uuid := auth.uid(); affected integer;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_entry_id is null then raise exception 'Observation entry not found or unavailable' using errcode='P0002'; end if;
  update public.wt_observation_entries entry set deleted_at=pg_catalog.now()
  where entry.id=p_entry_id and entry.owner_id=caller_id and entry.deleted_at is null
    and exists(select 1 from public.wt_dogs dog where dog.id=entry.dog_id and dog.owner_id=caller_id);
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Observation entry not found or unavailable' using errcode='P0002'; end if;
  return p_entry_id;
end; $$;
alter function public.wt_owner_soft_delete_observation_entry(uuid) owner to postgres;
revoke all on function public.wt_owner_soft_delete_observation_entry(uuid) from public,anon,authenticated;
grant execute on function public.wt_owner_soft_delete_observation_entry(uuid) to authenticated;`;

async function baseDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.user_id',true),'')::uuid$$;
    create function public.wt_is_coach() returns boolean language sql stable as $$select false$$;
    create function public.wt_is_admin() returns boolean language sql stable as $$select false$$;
    create table public.wt_dogs(id uuid primary key, owner_id uuid not null);
    create table public.wt_coach_assignments(dog_id uuid, coach_id uuid);
    create table public.wt_observation_entries(id uuid primary key, owner_id uuid not null, dog_id uuid not null, entry_kind text not null, source text not null default 'owner', deleted_at timestamptz);
    create table public.wt_daily_checks(entry_id uuid primary key, appetite_score smallint);
    create table public.wt_observation_events(entry_id uuid primary key, event_result text);
    insert into public.wt_dogs values ('${dog}','${owner}');
    alter table public.wt_observation_entries enable row level security;
    alter table public.wt_daily_checks enable row level security;
    alter table public.wt_observation_events enable row level security;
  `);
  return db;
}

const adminPolicies = `
create policy "admins manage observation entries" on public.wt_observation_entries for all to authenticated using(public.wt_is_admin()) with check(public.wt_is_admin());
create policy "admins manage daily checks" on public.wt_daily_checks for all to authenticated using(public.wt_is_admin()) with check(public.wt_is_admin());
create policy "admins manage observation events" on public.wt_observation_events for all to authenticated using(public.wt_is_admin()) with check(public.wt_is_admin());`;

function policySql(active, finalUpdateCheck, keepDeletes=true) {
  const entryActive = active ? "deleted_at is null and " : "";
  const childActive = active ? " and entry.deleted_at is null" : "";
  const updateCheckActive = finalUpdateCheck ? "deleted_at is null and " : "";
  return `
create policy "owners select own observation entries" on public.wt_observation_entries for select to authenticated
 using(${entryActive}owner_id=auth.uid() and exists(select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()));
create policy "owners insert own observation entries" on public.wt_observation_entries for insert to authenticated
 with check(${entryActive}owner_id=auth.uid() and source='owner' and exists(select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()));
create policy "owners update own observation entries" on public.wt_observation_entries for update to authenticated
 using(${entryActive}owner_id=auth.uid() and exists(select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()))
 with check(${updateCheckActive}owner_id=auth.uid() and exists(select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()));
${keepDeletes ? `create policy "owners delete own observation entries" on public.wt_observation_entries for delete to authenticated using(${entryActive}owner_id=auth.uid() and exists(select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()));` : ""}
create policy "assigned coaches read observation entries" on public.wt_observation_entries for select to authenticated using(${entryActive}public.wt_is_coach() and exists(select 1 from public.wt_coach_assignments assignment where assignment.coach_id=auth.uid() and assignment.dog_id=wt_observation_entries.dog_id));

create policy "owners select own daily checks" on public.wt_daily_checks for select to authenticated using(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid()${childActive}));
create policy "owners insert own daily checks" on public.wt_daily_checks for insert to authenticated with check(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid()${childActive}));
create policy "owners update own daily checks" on public.wt_daily_checks for update to authenticated using(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid()${childActive})) with check(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid()${childActive}));
${keepDeletes ? `create policy "owners delete own daily checks" on public.wt_daily_checks for delete to authenticated using(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid()${childActive}));` : ""}
create policy "assigned coaches read daily checks" on public.wt_daily_checks for select to authenticated using(public.wt_is_coach() and exists(select 1 from public.wt_observation_entries entry join public.wt_coach_assignments assignment on assignment.dog_id=entry.dog_id where entry.id=wt_daily_checks.entry_id and assignment.coach_id=auth.uid()${childActive}));

create policy "owners select own observation events" on public.wt_observation_events for select to authenticated using(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid()${childActive}));
create policy "owners insert own observation events" on public.wt_observation_events for insert to authenticated with check(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid()${childActive}));
create policy "owners update own observation events" on public.wt_observation_events for update to authenticated using(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid()${childActive})) with check(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid()${childActive}));
${keepDeletes ? `create policy "owners delete own observation events" on public.wt_observation_events for delete to authenticated using(exists(select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid()${childActive}));` : ""}
create policy "assigned coaches read observation events" on public.wt_observation_events for select to authenticated using(public.wt_is_coach() and exists(select 1 from public.wt_observation_entries entry join public.wt_coach_assignments assignment on assignment.dog_id=entry.dog_id where entry.id=wt_observation_events.entry_id and assignment.coach_id=auth.uid()${childActive}));
${adminPolicies}`;
}

async function installState(db, state) {
  if (state === "old") {
    await db.exec(policySql(false,false,true));
    await db.exec(oldSubtype);
    return;
  }
  if (state === "partial") {
    await db.exec(policySql(true,false,true));
    await db.exec(finalSubtype);
    await db.exec(finalRpc);
    return;
  }
  if (state === "final") {
    await db.exec(policySql(true,true,false));
    await db.exec(finalSubtype);
    await db.exec(finalRpc);
    await db.exec(`comment on function public.wt_owner_soft_delete_observation_entry(uuid) is 'Owner-only soft delete for one active Observation entry. Missing, already-deleted, and non-owned UUIDs are intentionally indistinguishable.';`);
  }
}

async function assertFinal(db) {
  const { rows:[counts] } = await db.query(`select
    (select count(*)::int from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname='wt_observation_entries') entries,
    (select count(*)::int from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname='wt_daily_checks') daily,
    (select count(*)::int from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname='wt_observation_events') events`);
  assert.deepEqual(counts,{entries:5,daily:5,events:5});
  const { rows:[update] } = await db.query(`select lower(pg_get_expr(p.polwithcheck,p.polrelid)) check_expr from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname='wt_observation_entries' and p.polname='owners update own observation entries'`);
  assert.match(update.check_expr,/deleted_at is null/);
  const { rows:[rpc] } = await db.query(`select p.prosecdef,p.proconfig,r.rolname owner_name,md5(regexp_replace(lower(p.prosrc),'\\s+','','g')) body_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.proname='wt_owner_soft_delete_observation_entry'`);
  assert.equal(rpc.prosecdef,true); assert.equal(rpc.owner_name,'postgres'); assert.deepEqual(rpc.proconfig,['search_path=""']); assert.equal(rpc.body_hash,'76977a6fd2800e8015ce724c48c8f8fa');
}


test("A0 old-state preflight fingerprints", async () => {
  const db=await baseDb();
  await installState(db,"old");
  const { rows: policies } = await db.query(`
    select c.relname table_name,p.polname,
      md5(regexp_replace(lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'\\s+','','g')) using_md5,
      md5(regexp_replace(lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),'\\s+','','g')) check_md5
    from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events')
    order by c.relname,p.polname
  `);
  const byName=new Map(policies.map(row=>[`${row.table_name}:${row.polname}`,row]));
  assert.equal(byName.get("wt_observation_entries:owners select own observation entries").using_md5,"ba198383004b57209da3642439100224");
  assert.equal(byName.get("wt_observation_entries:owners insert own observation entries").check_md5,"909d4158199ed321cdc00f4c11f4abe5");
  assert.equal(byName.get("wt_observation_entries:owners update own observation entries").using_md5,"ba198383004b57209da3642439100224");
  assert.equal(byName.get("wt_observation_entries:assigned coaches read observation entries").using_md5,"e5feb1dcb23eb97c017b59c8656bbea0");
  assert.equal(byName.get("wt_daily_checks:owners select own daily checks").using_md5,"f64bca5cdd1ec0605701b9b77e1c35d1");
  assert.equal(byName.get("wt_daily_checks:assigned coaches read daily checks").using_md5,"9004bf683a85e110522bd26bf51f65af");
  assert.equal(byName.get("wt_observation_events:owners select own observation events").using_md5,"90475b7968b68116070eabebf9d6fcfb");
  assert.equal(byName.get("wt_observation_events:assigned coaches read observation events").using_md5,"406a7e35b8cc549bb3a74f147a4b4e9e");
  const { rows:[subtype] }=await db.query(`select md5(regexp_replace(lower(prosrc),'\\s+','','g')) hash from pg_proc where proname='wt_validate_observation_subtype'`);
  assert.equal(subtype.hash,"b8410c9c13d0f2a8c8d7361653dba203");
  await db.close();
});


test("A1 old-state migration preflight only", async () => {
  const db=await baseDb();
  await installState(db,"old");
  const cut=migration.indexOf("-- Align subtype validation");
  assert.ok(cut>0);
  await assert.rejects(
    db.exec(migration.slice(0,cut)+"rollback;"),
    /(035 must be applied by postgres|Unexpected wt_validate_observation_subtype overload set|Unexpected wt_validate_observation_subtype definition|Unexpected wt_owner_soft_delete_observation_entry overload set|Unexpected soft delete RPC definition|Unexpected soft delete RPC EXECUTE grants|Unexpected soft delete RPC grantee|Unexpected soft delete RPC comment)/
  );
  await db.close();
});


test("A2 old-state metadata preflight", async () => {
  const db=await baseDb();
  await installState(db,"old");
  const { rows:[who] }=await db.query("select current_user");
  assert.equal(who.current_user,"postgres");
  const { rows:tables }=await db.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events') order by c.relname`);
  assert.equal(tables.length,3);
  for(const row of tables){ assert.equal(row.relrowsecurity,true); assert.equal(row.relforcerowsecurity,false); }
  const { rows:badRoles }=await db.query(`select c.relname,p.polname,p.polroles from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events') and p.polroles<>array['authenticated'::regrole::oid]`);
  assert.equal(badRoles.length,0);
  const { rows:[subtype] }=await db.query(`select pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) result,l.lanname,p.prosecdef,r.rolname owner_name,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname='wt_validate_observation_subtype'`);
  assert.equal(subtype.args,""); assert.equal(subtype.result,"trigger"); assert.equal(subtype.lanname,"plpgsql"); assert.equal(subtype.prosecdef,false); assert.equal(subtype.owner_name,"postgres"); assert.deepEqual(subtype.proconfig,["search_path=public, pg_catalog"]);
  const { rows:[rpcCount] }=await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='wt_owner_soft_delete_observation_entry'`);
  assert.equal(rpcCount.n,0);
  await db.close();
});


test("A3 migration expected-state setup only", async () => {
  const db=await baseDb();
  await installState(db,"old");
  const cut=migration.indexOf("-- Strict preflight");
  assert.ok(cut>0);
  await db.exec(migration.slice(0,cut)+"rollback;");
  await db.close();
});


test("A4 old-state policy preflight matrix", async () => {
  const db=await baseDb();
  await installState(db,"old");
  const cut=migration.indexOf("-- Strict preflight");
  assert.ok(cut>0);
  await db.exec(migration.slice(0,cut));
  const { rows:[unknown] }=await db.query(`
    select count(*)::int n
    from pg_policy p
    join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    left join wt035_expected_policy e on e.table_name=c.relname and e.policy_name=p.polname
    where n.nspname='public'
      and c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events')
      and e.policy_name is null
  `);
  assert.equal(unknown.n,0);
  const { rows:mismatches }=await db.query(`
    select e.table_name,e.policy_name,
           p.polcmd,p.polroles,
           md5(regexp_replace(lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'\\s+','','g')) using_md5,
           md5(regexp_replace(lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),'\\s+','','g')) check_md5,
           e.old_using_md5,e.old_check_md5,e.final_using_md5,e.final_check_md5,e.allow_known_mixed
    from wt035_expected_policy e
    left join pg_class c on c.relname=e.table_name
    left join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    left join pg_policy p on p.polrelid=c.oid and p.polname=e.policy_name
    where not (
      p.polcmd=e.polcmd
      and p.polroles=array['authenticated'::regrole::oid]
      and (
        (md5(regexp_replace(lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'\\s+','','g'))=e.old_using_md5
         and md5(regexp_replace(lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),'\\s+','','g'))=e.old_check_md5)
        or
        (md5(regexp_replace(lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'\\s+','','g'))=e.final_using_md5
         and md5(regexp_replace(lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),'\\s+','','g'))=e.final_check_md5)
        or
        (e.allow_known_mixed
         and md5(regexp_replace(lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'\\s+','','g'))=e.final_using_md5
         and md5(regexp_replace(lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),'\\s+','','g'))=e.old_check_md5)
      )
    )
  `);
  assert.deepEqual(mismatches,[]);
  await db.exec("rollback;");
  await db.close();
});

for (const [label,state] of [["A full old","old"],["B production-like partial","partial"],["C already final","final"]]) {
  test(label, async () => {
    const db=await baseDb(); await installState(db,state); await db.exec(migration); await assertFinal(db);
    if (state==='final') { await db.exec(migration); await assertFinal(db); }
    await db.close();
  });
}

test("D wrong same-name RPC stops preflight", async () => {
  const db=await baseDb(); await installState(db,"partial");
  await db.exec(`create or replace function public.wt_owner_soft_delete_observation_entry(p_entry_id uuid) returns uuid language plpgsql security definer set search_path='' as $$begin return p_entry_id; end;$$;`);
  await assert.rejects(db.exec(migration),/Unexpected soft delete RPC definition/); await db.close();
});

test("E unexpected policy body stops preflight", async () => {
  const db=await baseDb(); await installState(db,"partial");
  await db.exec(`alter policy "owners update own observation entries" on public.wt_observation_entries using (deleted_at is null and (owner_id=auth.uid() or true)) with check(owner_id=auth.uid());`);
  await assert.rejects(db.exec(migration),/Unexpected policy definition/); await db.close();
});