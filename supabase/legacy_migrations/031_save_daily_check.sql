-- Phase 1B: one atomic, owner-only write for a dog's daily check.
-- Apply after 030_observation_data_foundation.sql.
create function public.wt_owner_save_daily_check(
  target_dog_id uuid,
  next_occurred_at timestamptz,
  next_timezone text,
  next_appetite_score smallint default null,
  next_sleep_rest_score smallint default null,
  next_activity_score smallint default null,
  next_exploration_score smallint default null,
  next_calmness_score smallint default null,
  next_toilet_score smallint default null,
  next_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  owner_user_id uuid := auth.uid();
  target_local_date date;
  saved_entry_id uuid;
begin
  if owner_user_id is null or not exists (
    select 1 from public.wt_dogs dog
    where dog.id = target_dog_id and dog.owner_id = owner_user_id
  ) then
    raise exception 'dog is not owned by the current user' using errcode = '42501';
  end if;

  if next_occurred_at is null or next_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names zone where zone.name = next_timezone
  ) then
    raise exception 'invalid daily check date or timezone' using errcode = '22023';
  end if;

  if num_nonnulls(
    next_appetite_score, next_sleep_rest_score, next_activity_score,
    next_exploration_score, next_calmness_score, next_toilet_score
  ) = 0 then
    raise exception 'daily check requires at least one score' using errcode = '23514';
  end if;

  -- The same expression is used by the 030 trigger. It is only used here to
  -- find/lock the date; the trigger remains responsible for stored local_date.
  target_local_date := (next_occurred_at at time zone next_timezone)::date;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_dog_id::text || ':' || target_local_date::text, 0)
  );

  select entry.id into saved_entry_id
  from public.wt_observation_entries entry
  where entry.dog_id = target_dog_id
    and entry.owner_id = owner_user_id
    and entry.entry_kind = 'daily_check'
    and entry.local_date = target_local_date
    and entry.deleted_at is null
  for update;

  if saved_entry_id is null then
    insert into public.wt_observation_entries (
      owner_id, dog_id, entry_kind, occurred_at, timezone, local_date, note, source
    ) values (
      owner_user_id, target_dog_id, 'daily_check', next_occurred_at,
      next_timezone, target_local_date, next_note, 'owner'
    )
    -- Protect against other clients writing directly to the 030 tables.
    on conflict (dog_id, local_date)
      where entry_kind = 'daily_check' and deleted_at is null
    do nothing
    returning id into saved_entry_id;

    if saved_entry_id is null then
      select entry.id into saved_entry_id
      from public.wt_observation_entries entry
      where entry.dog_id = target_dog_id
        and entry.owner_id = owner_user_id
        and entry.entry_kind = 'daily_check'
        and entry.local_date = target_local_date
        and entry.deleted_at is null
      for update;
    end if;
  end if;

  if saved_entry_id is null then
    raise exception 'daily check could not be saved' using errcode = '40001';
  end if;

  update public.wt_observation_entries
  set occurred_at = next_occurred_at, timezone = next_timezone, note = next_note
  where id = saved_entry_id;

  insert into public.wt_daily_checks (
    entry_id, appetite_score, sleep_rest_score, activity_score,
    exploration_score, calmness_score, toilet_score
  ) values (
    saved_entry_id, next_appetite_score, next_sleep_rest_score,
    next_activity_score, next_exploration_score, next_calmness_score,
    next_toilet_score
  )
  on conflict (entry_id) do update set
    appetite_score = excluded.appetite_score,
    sleep_rest_score = excluded.sleep_rest_score,
    activity_score = excluded.activity_score,
    exploration_score = excluded.exploration_score,
    calmness_score = excluded.calmness_score,
    toilet_score = excluded.toilet_score;

  return saved_entry_id;
end;
$$;

comment on function public.wt_owner_save_daily_check(
  uuid, timestamptz, text, smallint, smallint, smallint,
  smallint, smallint, smallint, text
) is 'Atomically create or replace one active daily check per dog and local date under the caller RLS policies.';

revoke all on function public.wt_owner_save_daily_check(
  uuid, timestamptz, text, smallint, smallint, smallint,
  smallint, smallint, smallint, text
) from public, anon;
grant execute on function public.wt_owner_save_daily_check(
  uuid, timestamptz, text, smallint, smallint, smallint,
  smallint, smallint, smallint, text
) to authenticated;
