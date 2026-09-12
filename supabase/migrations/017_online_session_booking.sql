-- Coach profiles, shared availability, atomic online-session booking and notifications.
-- Run after 016_fix_coach_candidate_assignment.sql.

create extension if not exists btree_gist;

alter table public.wt_coaching_applications
  add column if not exists owner_confirmed_at timestamptz;

create table if not exists public.wt_coach_profiles (
  coach_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  headline text not null default '',
  bio text not null default '',
  credentials text not null default '',
  avatar_url text,
  meet_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wt_coach_availability_slots (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (coach_id, starts_at)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wt_coach_availability_no_overlap') then
    alter table public.wt_coach_availability_slots
      add constraint wt_coach_availability_no_overlap
      exclude using gist (
        coach_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (active);
  end if;
end $$;

create table if not exists public.wt_online_sessions (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.wt_coach_availability_slots(id) on delete restrict,
  application_id uuid not null references public.wt_coaching_applications(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  session_type text not null check (session_type in ('initial', 'followup')),
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meet_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wt_online_sessions_live_slot_idx
  on public.wt_online_sessions(slot_id)
  where status <> 'cancelled';
create index if not exists wt_online_sessions_coach_date_idx
  on public.wt_online_sessions(coach_id, starts_at);
create index if not exists wt_online_sessions_owner_date_idx
  on public.wt_online_sessions(owner_id, starts_at);

create table if not exists public.wt_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wt_notifications_user_date_idx
  on public.wt_notifications(user_id, created_at desc);

alter table public.wt_coach_profiles enable row level security;
alter table public.wt_coach_availability_slots enable row level security;
alter table public.wt_online_sessions enable row level security;
alter table public.wt_notifications enable row level security;

drop policy if exists "authenticated read coach profiles" on public.wt_coach_profiles;
create policy "authenticated read coach profiles" on public.wt_coach_profiles
  for select to authenticated using (true);
drop policy if exists "coaches manage own profile" on public.wt_coach_profiles;
create policy "coaches manage own profile" on public.wt_coach_profiles
  for all to authenticated
  using ((coach_id = auth.uid() and public.wt_is_coach()) or public.wt_is_admin())
  with check ((coach_id = auth.uid() and public.wt_is_coach()) or public.wt_is_admin());

drop policy if exists "authenticated read active slots" on public.wt_coach_availability_slots;
create policy "authenticated read active slots" on public.wt_coach_availability_slots
  for select to authenticated using (active or coach_id = auth.uid() or public.wt_is_admin());
drop policy if exists "coaches manage own slots" on public.wt_coach_availability_slots;
create policy "coaches manage own slots" on public.wt_coach_availability_slots
  for all to authenticated
  using ((coach_id = auth.uid() and public.wt_is_coach()) or public.wt_is_admin())
  with check ((coach_id = auth.uid() and public.wt_is_coach()) or public.wt_is_admin());

drop policy if exists "participants read online sessions" on public.wt_online_sessions;
create policy "participants read online sessions" on public.wt_online_sessions
  for select to authenticated
  using (owner_id = auth.uid() or coach_id = auth.uid() or public.wt_is_admin());

drop policy if exists "users read own notifications" on public.wt_notifications;
create policy "users read own notifications" on public.wt_notifications
  for select to authenticated using (user_id = auth.uid() or public.wt_is_admin());
drop policy if exists "users update own notifications" on public.wt_notifications;
create policy "users update own notifications" on public.wt_notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.wt_coach_profiles to authenticated;
grant select, insert, update, delete on public.wt_coach_availability_slots to authenticated;
grant select on public.wt_online_sessions to authenticated;
grant select, update on public.wt_notifications to authenticated;

create or replace function public.wt_owner_confirm_coach(target_application_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.wt_coaching_applications
  set owner_confirmed_at = now(), updated_at = now()
  where id = target_application_id
    and owner_id = auth.uid()
    and assigned_coach_id is not null
    and status in ('assigned', 'consulting', 'payment_pending', 'active');
  if not found then raise exception '担当コーチを確定できません'; end if;
  insert into public.wt_notifications (user_id, notification_type, title, body)
  select owner_id, 'coach_confirmed', '担当コーチが決定しました', 'オンライン診断を予約できます'
  from public.wt_coaching_applications where id = target_application_id
  union all
  select assigned_coach_id, 'owner_confirmed', 'オーナーが担当を確定しました', '空き枠と予約状況をご確認ください'
  from public.wt_coaching_applications where id = target_application_id;
end;
$$;
revoke all on function public.wt_owner_confirm_coach(uuid) from public;
grant execute on function public.wt_owner_confirm_coach(uuid) to authenticated;

create or replace function public.wt_owner_available_slots(target_application_id uuid)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare target_coach_id uuid;
begin
  select assigned_coach_id into target_coach_id
  from public.wt_coaching_applications
  where id = target_application_id and owner_id = auth.uid() and owner_confirmed_at is not null;
  if target_coach_id is null then raise exception '担当コーチの確定が必要です'; end if;
  return query
  select slot.id, slot.starts_at, slot.ends_at
  from public.wt_coach_availability_slots slot
  where slot.coach_id = target_coach_id and slot.active and slot.starts_at > now()
    and not exists (
      select 1 from public.wt_online_sessions session
      where session.slot_id = slot.id and session.status <> 'cancelled'
    )
  order by slot.starts_at limit 60;
end;
$$;
revoke all on function public.wt_owner_available_slots(uuid) from public;
grant execute on function public.wt_owner_available_slots(uuid) to authenticated;

create or replace function public.wt_book_online_session(
  target_application_id uuid,
  target_slot_id uuid,
  requested_session_type text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  application_row public.wt_coaching_applications%rowtype;
  slot_row public.wt_coach_availability_slots%rowtype;
  new_session_id uuid;
  stored_meet_url text;
begin
  if requested_session_type not in ('initial', 'followup') then raise exception 'invalid session type'; end if;
  select * into application_row from public.wt_coaching_applications
  where id = target_application_id and owner_id = auth.uid() for update;
  if application_row.id is null or application_row.owner_confirmed_at is null then
    raise exception '担当コーチの確定が必要です';
  end if;
  if requested_session_type = 'initial' and exists (
    select 1 from public.wt_online_sessions
    where application_id = target_application_id and session_type = 'initial' and status <> 'cancelled'
  ) then raise exception '初回オンライン診断は予約済みです'; end if;

  select * into slot_row from public.wt_coach_availability_slots
  where id = target_slot_id and active for update;
  if slot_row.id is null or slot_row.starts_at <= now() then raise exception 'この枠は利用できません'; end if;
  if slot_row.coach_id <> application_row.assigned_coach_id then raise exception '担当コーチの枠ではありません'; end if;
  if exists (select 1 from public.wt_online_sessions where slot_id = target_slot_id and status <> 'cancelled') then
    raise exception 'この枠は直前に予約されました';
  end if;

  select meet_url into stored_meet_url from public.wt_coach_profiles where coach_id = slot_row.coach_id;
  insert into public.wt_online_sessions (
    slot_id, application_id, owner_id, dog_id, coach_id, session_type,
    starts_at, ends_at, meet_url
  ) values (
    slot_row.id, application_row.id, application_row.owner_id, application_row.dog_id,
    slot_row.coach_id, requested_session_type, slot_row.starts_at, slot_row.ends_at, stored_meet_url
  ) returning id into new_session_id;

  insert into public.wt_notifications (user_id, notification_type, title, body)
  values
    (application_row.owner_id, 'session_booked', 'オンライン診断を予約しました', to_char(slot_row.starts_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI')),
    (slot_row.coach_id, 'session_booked', 'オンライン診断の予約が入りました', to_char(slot_row.starts_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI'));
  return new_session_id;
exception when unique_violation then
  raise exception 'この枠は直前に予約されました';
end;
$$;
revoke all on function public.wt_book_online_session(uuid, uuid, text) from public;
grant execute on function public.wt_book_online_session(uuid, uuid, text) to authenticated;

create or replace function public.wt_staff_online_sessions()
returns table (
  session_id uuid, owner_email text, dog_name text, session_type text, status text,
  starts_at timestamptz, ends_at timestamptz, meet_url text
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  return query
  select session.id, coalesce(owner_user.email, '')::text, dog.name::text,
    session.session_type::text, session.status::text, session.starts_at, session.ends_at,
    session.meet_url::text
  from public.wt_online_sessions session
  join auth.users owner_user on owner_user.id = session.owner_id
  join public.wt_dogs dog on dog.id = session.dog_id
  where public.wt_is_admin() or session.coach_id = auth.uid()
  order by session.starts_at;
end;
$$;
revoke all on function public.wt_staff_online_sessions() from public;
grant execute on function public.wt_staff_online_sessions() to authenticated;

create or replace function public.wt_staff_update_online_session(target_session_id uuid, next_status text)
returns void language plpgsql security definer set search_path = public as $$
declare updated_session public.wt_online_sessions%rowtype;
begin
  if next_status not in ('completed', 'cancelled') then raise exception 'invalid status'; end if;
  update public.wt_online_sessions
  set status = next_status, updated_at = now()
  where id = target_session_id and (public.wt_is_admin() or coach_id = auth.uid());
  if not found then raise exception 'session not found'; end if;
  select * into updated_session from public.wt_online_sessions where id = target_session_id;
  insert into public.wt_notifications (user_id, notification_type, title, body)
  values (
    updated_session.owner_id,
    'session_' || next_status,
    case when next_status = 'completed' then 'オンライン診断が完了しました' else 'オンライン診断がキャンセルされました' end,
    to_char(updated_session.starts_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI')
  );
end;
$$;
revoke all on function public.wt_staff_update_online_session(uuid, text) from public;
grant execute on function public.wt_staff_update_online_session(uuid, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wt_coach_availability_slots') then
    alter publication supabase_realtime add table public.wt_coach_availability_slots;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wt_online_sessions') then
    alter publication supabase_realtime add table public.wt_online_sessions;
  end if;
end $$;
