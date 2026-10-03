-- Align the live Observation soft-delete rules with the final 030 definitions.
-- Owner soft delete uses a narrowly scoped RPC: an UPDATE with RETURNING would
-- also check the active-only SELECT policy against the newly deleted row.
-- SQL Editor application does not register this file in migration history.
begin;

-- Refuse to modify an unexpected policy set or disabled RLS.
do $$
begin
  if current_user <> 'postgres' then
    raise exception '035 must be applied by postgres so the narrow SECURITY DEFINER function can bypass entry RLS';
  end if;
  if (select relforcerowsecurity from pg_class where oid = 'public.wt_observation_entries'::regclass) then
    raise exception 'Unexpected FORCE ROW LEVEL SECURITY on wt_observation_entries';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.wt_observation_entries'::regclass) then
    raise exception 'RLS must be enabled on wt_observation_entries';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_entries'::regclass and polname = 'owners select own observation entries' and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners select own observation entries';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_entries'::regclass and polname = 'owners insert own observation entries' and polcmd = 'a' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners insert own observation entries';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_entries'::regclass and polname = 'owners update own observation entries' and polcmd = 'w' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners update own observation entries';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_entries'::regclass and polname = 'owners delete own observation entries' and polcmd = 'd' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners delete own observation entries';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_entries'::regclass and polname = 'assigned coaches read observation entries' and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: assigned coaches read observation entries';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_entries'::regclass and polname = 'admins manage observation entries' and polcmd = '*' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: admins manage observation entries';
  end if;
  if (select relforcerowsecurity from pg_class where oid = 'public.wt_daily_checks'::regclass) then
    raise exception 'Unexpected FORCE ROW LEVEL SECURITY on wt_daily_checks';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.wt_daily_checks'::regclass) then
    raise exception 'RLS must be enabled on wt_daily_checks';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_daily_checks'::regclass and polname = 'owners select own daily checks' and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners select own daily checks';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_daily_checks'::regclass and polname = 'owners insert own daily checks' and polcmd = 'a' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners insert own daily checks';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_daily_checks'::regclass and polname = 'owners update own daily checks' and polcmd = 'w' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners update own daily checks';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_daily_checks'::regclass and polname = 'owners delete own daily checks' and polcmd = 'd' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners delete own daily checks';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_daily_checks'::regclass and polname = 'assigned coaches read daily checks' and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: assigned coaches read daily checks';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_daily_checks'::regclass and polname = 'admins manage daily checks' and polcmd = '*' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: admins manage daily checks';
  end if;
  if (select relforcerowsecurity from pg_class where oid = 'public.wt_observation_events'::regclass) then
    raise exception 'Unexpected FORCE ROW LEVEL SECURITY on wt_observation_events';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.wt_observation_events'::regclass) then
    raise exception 'RLS must be enabled on wt_observation_events';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_events'::regclass and polname = 'owners select own observation events' and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners select own observation events';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_events'::regclass and polname = 'owners insert own observation events' and polcmd = 'a' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners insert own observation events';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_events'::regclass and polname = 'owners update own observation events' and polcmd = 'w' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners update own observation events';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_events'::regclass and polname = 'owners delete own observation events' and polcmd = 'd' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: owners delete own observation events';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_events'::regclass and polname = 'assigned coaches read observation events' and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: assigned coaches read observation events';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.wt_observation_events'::regclass and polname = 'admins manage observation events' and polcmd = '*' and polroles = array['authenticated'::regrole::oid]) then
    raise exception 'Unexpected policy: admins manage observation events';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.wt_observation_entries'::regclass) <> 6 then
    raise exception 'Unexpected policy count on wt_observation_entries';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.wt_daily_checks'::regclass) <> 6 then
    raise exception 'Unexpected policy count on wt_daily_checks';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.wt_observation_events'::regclass) <> 6 then
    raise exception 'Unexpected policy count on wt_observation_events';
  end if;
end;
$$;

create or replace function public.wt_validate_observation_subtype()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  expected_kind text := tg_argv[0];
begin
  if not exists (
    select 1 from public.wt_observation_entries entry
    where entry.id = new.entry_id
      and entry.entry_kind = expected_kind
      and entry.deleted_at is null
  ) then
    raise exception 'observation subtype requires an active entry_kind %', expected_kind
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter policy "owners select own observation entries"
  on public.wt_observation_entries
  using (
    deleted_at is null
    and owner_id = auth.uid()
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = wt_observation_entries.dog_id
        and dog.owner_id = auth.uid()
    )
  );

alter policy "owners insert own observation entries"
  on public.wt_observation_entries
  with check (
    deleted_at is null
    and owner_id = auth.uid()
    and source = 'owner'
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = wt_observation_entries.dog_id
        and dog.owner_id = auth.uid()
    )
  );

alter policy "owners update own observation entries"
  on public.wt_observation_entries
  using (
    deleted_at is null
    and owner_id = auth.uid()
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = wt_observation_entries.dog_id
        and dog.owner_id = auth.uid()
    )
  )
  with check (
    deleted_at is null
    and owner_id = auth.uid()
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = wt_observation_entries.dog_id
        and dog.owner_id = auth.uid()
    )
  );

alter policy "owners delete own observation entries"
  on public.wt_observation_entries
  using (
    deleted_at is null
    and owner_id = auth.uid()
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = wt_observation_entries.dog_id
        and dog.owner_id = auth.uid()
    )
  );

alter policy "assigned coaches read observation entries"
  on public.wt_observation_entries
  using (
    deleted_at is null
    and public.wt_is_coach()
    and exists (
      select 1 from public.wt_coach_assignments assignment
      where assignment.coach_id = auth.uid()
        and assignment.dog_id = wt_observation_entries.dog_id
    )
  );

alter policy "owners select own daily checks"
  on public.wt_daily_checks
  using (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_daily_checks.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "owners insert own daily checks"
  on public.wt_daily_checks
  with check (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_daily_checks.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "owners update own daily checks"
  on public.wt_daily_checks
  using (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_daily_checks.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_daily_checks.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "owners delete own daily checks"
  on public.wt_daily_checks
  using (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_daily_checks.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "assigned coaches read daily checks"
  on public.wt_daily_checks
  using (
    public.wt_is_coach()
    and exists (
      select 1
      from public.wt_observation_entries entry
      join public.wt_coach_assignments assignment on assignment.dog_id = entry.dog_id
      where entry.id = wt_daily_checks.entry_id
        and assignment.coach_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "owners select own observation events"
  on public.wt_observation_events
  using (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_observation_events.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "owners insert own observation events"
  on public.wt_observation_events
  with check (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_observation_events.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "owners update own observation events"
  on public.wt_observation_events
  using (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_observation_events.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_observation_events.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "owners delete own observation events"
  on public.wt_observation_events
  using (
    exists (
      select 1 from public.wt_observation_entries entry
      where entry.id = wt_observation_events.entry_id
        and entry.owner_id = auth.uid()
        and entry.deleted_at is null
    )
  );

alter policy "assigned coaches read observation events"
  on public.wt_observation_events
  using (
    public.wt_is_coach()
    and exists (
      select 1
      from public.wt_observation_entries entry
      join public.wt_coach_assignments assignment on assignment.dog_id = entry.dog_id
      where entry.id = wt_observation_events.entry_id
        and assignment.coach_id = auth.uid()
        and entry.deleted_at is null
    )
  );

-- The function is created by the database owner. It must bypass entry SELECT
-- RLS only for this one UPDATE; the predicates explicitly enforce ownership.
-- Missing, already-deleted and another owner's entries share one error so the
-- caller cannot distinguish another owner's entry by probing its UUID.
create or replace function public.wt_owner_soft_delete_observation_entry(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  affected integer;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_entry_id is null then
    raise exception 'Observation entry not found or unavailable' using errcode = 'P0002';
  end if;

  update public.wt_observation_entries entry
  set deleted_at = pg_catalog.now()
  where entry.id = p_entry_id
    and entry.owner_id = caller_id
    and entry.deleted_at is null
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = entry.dog_id and dog.owner_id = caller_id
    );
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Observation entry not found or unavailable' using errcode = 'P0002';
  end if;
  return p_entry_id;
end;
$$;

alter function public.wt_owner_soft_delete_observation_entry(uuid) owner to postgres;

revoke all on function public.wt_owner_soft_delete_observation_entry(uuid) from public, anon, authenticated;
grant execute on function public.wt_owner_soft_delete_observation_entry(uuid) to authenticated;

comment on function public.wt_owner_soft_delete_observation_entry(uuid) is
  'Owner-only soft delete for one active Observation entry. Missing, already-deleted, and non-owned UUIDs are intentionally indistinguishable.';

commit;
