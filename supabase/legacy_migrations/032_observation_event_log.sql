-- Phase 1C: household handlers and atomic owner Event Log writes.
-- Apply after 031_save_daily_check.sql. No legacy daily record changes.
create table public.wt_household_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  relation_key text not null check (relation_key in ('self','father','mother','partner','child','grandparent','other')),
  sort_order integer not null default 0 check (sort_order >= 0),
  deleted_at timestamptz, -- hide from new selections while retaining historical event attribution
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index wt_household_members_owner_order_idx on public.wt_household_members(owner_id, sort_order, created_at);
alter table public.wt_household_members enable row level security;
create policy "owners manage own household members" on public.wt_household_members
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "assigned coaches read household members" on public.wt_household_members
  for select to authenticated using (
    public.wt_is_coach() and exists (
      select 1 from public.wt_dogs dog
      join public.wt_coach_assignments assignment on assignment.dog_id = dog.id
      where dog.owner_id = wt_household_members.owner_id
        and assignment.coach_id = auth.uid()
    )
  );
create policy "admins manage household members" on public.wt_household_members
  for all to authenticated using (public.wt_is_admin()) with check (public.wt_is_admin());
grant select, insert, update, delete on public.wt_household_members to authenticated;

create function public.wt_guard_household_member()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'household owner cannot change' using errcode = '23514';
  end if;
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.wt_guard_household_member() from public, anon, authenticated;
create trigger wt_guard_household_member_before_write before insert or update
  on public.wt_household_members for each row execute function public.wt_guard_household_member();

alter table public.wt_observation_events
  add column handled_by_member_id uuid references public.wt_household_members(id);
create index wt_observation_events_handler_idx on public.wt_observation_events(handled_by_member_id)
  where handled_by_member_id is not null;
comment on column public.wt_observation_events.handled_by_member_id is
  'Single primary handler; nullable. Member ownership matches the parent observation owner.';

-- Also enforce the relationship for direct table writes and privileged imports.
create function public.wt_guard_event_handler()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.handled_by_member_id is not null and not exists (
    select 1 from public.wt_household_members member
    join public.wt_observation_entries entry on entry.owner_id = member.owner_id
    where member.id = new.handled_by_member_id and entry.id = new.entry_id
  ) then
    raise exception 'handler does not belong to observation owner' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.wt_guard_event_handler() from public, anon, authenticated;
create trigger wt_guard_event_handler_before_write before insert or update
  on public.wt_observation_events for each row execute function public.wt_guard_event_handler();

create function public.wt_owner_save_observation_event(
  target_dog_id uuid, next_theme_key text, next_event_result text,
  next_occurred_at timestamptz, next_timezone text,
  next_entry_id uuid default null, next_handled_by_member_id uuid default null,
  next_state_before text default null, next_environment_key text default null,
  next_target_type text default null, next_distance_band text default null,
  next_intensity smallint default null, next_duration_seconds integer default null,
  next_owner_response_keys text[] default null, next_outcome text default null,
  next_recovery_seconds integer default null, next_note text default null,
  next_theme_data jsonb default '{}'::jsonb
) returns uuid language plpgsql security invoker set search_path = public, pg_catalog as $$
declare
  owner_user_id uuid := auth.uid();
  saved_entry_id uuid;
begin
  if owner_user_id is null or not exists (
    select 1 from public.wt_dogs dog where dog.id = target_dog_id and dog.owner_id = owner_user_id
  ) then
    raise exception 'dog is not owned by the current user' using errcode = '42501';
  end if;
  if next_theme_key is null or next_theme_key not in (
    'barking','walk','alone','toilet','dog_reaction','person_reaction',
    'biting','meal','sleep_rest','grooming'
  ) or next_event_result is null or next_event_result not in ('success','neutral','concern') then
    raise exception 'invalid observation theme or result' using errcode = '22023';
  end if;
  if next_occurred_at is null or next_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = next_timezone
  ) or next_theme_data is null or jsonb_typeof(next_theme_data) <> 'object' then
    raise exception 'invalid event timestamp, timezone or details' using errcode = '22023';
  end if;
  if next_handled_by_member_id is not null and not exists (
    select 1 from public.wt_household_members member
    where member.id = next_handled_by_member_id and member.owner_id = owner_user_id
      and member.deleted_at is null
  ) and not (
    next_entry_id is not null and exists (
      select 1 from public.wt_household_members member
      join public.wt_observation_events event_row on event_row.handled_by_member_id = member.id
      join public.wt_observation_entries entry on entry.id = event_row.entry_id
      where entry.id = next_entry_id and entry.dog_id = target_dog_id
        and entry.owner_id = owner_user_id and entry.deleted_at is null
        and member.id = next_handled_by_member_id and member.owner_id = owner_user_id
    )
  ) then
    raise exception 'handler is not owned by the current user' using errcode = '42501';
  end if;

  if next_entry_id is null then
    insert into public.wt_observation_entries (
      owner_id,dog_id,entry_kind,theme_key,occurred_at,timezone,local_date,note,source
    ) values (
      owner_user_id,target_dog_id,'event',next_theme_key,next_occurred_at,next_timezone,
      (next_occurred_at at time zone next_timezone)::date,next_note,'owner'
    ) returning id into saved_entry_id;
    insert into public.wt_observation_events (
      entry_id,event_result,handled_by_member_id,state_before,environment_key,
      target_type,distance_band,intensity,duration_seconds,owner_response_keys,
      outcome,recovery_seconds,theme_data
    ) values (
      saved_entry_id,next_event_result,next_handled_by_member_id,next_state_before,
      next_environment_key,next_target_type,next_distance_band,next_intensity,
      next_duration_seconds,next_owner_response_keys,next_outcome,next_recovery_seconds,next_theme_data
    );
  else
    select entry.id into saved_entry_id from public.wt_observation_entries entry
    where entry.id = next_entry_id and entry.dog_id = target_dog_id
      and entry.owner_id = owner_user_id and entry.entry_kind = 'event'
      and entry.source = 'owner' and entry.deleted_at is null for update;
    if saved_entry_id is null then
      raise exception 'event is not editable by current user' using errcode = '42501';
    end if;
    update public.wt_observation_entries
    set theme_key = next_theme_key, occurred_at = next_occurred_at,
      timezone = next_timezone, note = next_note
    where id = saved_entry_id;
    update public.wt_observation_events
    set event_result = next_event_result, handled_by_member_id = next_handled_by_member_id,
      state_before = next_state_before, environment_key = next_environment_key,
      target_type = next_target_type, distance_band = next_distance_band,
      intensity = next_intensity, duration_seconds = next_duration_seconds,
      owner_response_keys = next_owner_response_keys, outcome = next_outcome,
      recovery_seconds = next_recovery_seconds, theme_data = next_theme_data
    where entry_id = saved_entry_id;
    if not found then
      raise exception 'event details are missing' using errcode = '23514';
    end if;
  end if;
  return saved_entry_id;
end;
$$;
revoke all on function public.wt_owner_save_observation_event(
  uuid,text,text,timestamptz,text,uuid,uuid,text,text,text,text,smallint,integer,text[],text,integer,text,jsonb
) from public, anon;
grant execute on function public.wt_owner_save_observation_event(
  uuid,text,text,timestamptz,text,uuid,uuid,text,text,text,text,smallint,integer,text[],text,integer,text,jsonb
) to authenticated;
