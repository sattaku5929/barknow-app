-- Safe availability CRUD for coaches/admins.
-- Booked slots stay immutable and historical rows are preserved with soft deletion.

drop function if exists public.wt_staff_availability_slots();
create function public.wt_staff_availability_slots()
returns table (
  slot_id uuid, coach_id uuid, coach_name text, coach_email text,
  starts_at timestamptz, ends_at timestamptz, active boolean,
  session_id uuid, session_status text, owner_name text
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  return query
  select slot.id, slot.coach_id,
    coalesce(profile.display_name, coach.email, 'コーチ')::text,
    coalesce(coach.email, '')::text,
    slot.starts_at, slot.ends_at, slot.active,
    session.id, session.status::text,
    coalesce(owner_profile.display_name, owner.email, '')::text
  from public.wt_coach_availability_slots slot
  join auth.users coach on coach.id = slot.coach_id
  left join public.wt_coach_profiles profile on profile.coach_id = slot.coach_id
  left join lateral (
    select booked.* from public.wt_online_sessions booked
    where booked.slot_id = slot.id
    order by booked.created_at desc limit 1
  ) session on true
  left join auth.users owner on owner.id = session.owner_id
  left join public.wt_user_roles owner_profile on owner_profile.user_id = session.owner_id
  where slot.starts_at > now()
    and (slot.active or session.id is not null)
    and (public.wt_is_admin() or slot.coach_id = auth.uid())
  order by slot.starts_at;
end;
$$;
revoke all on function public.wt_staff_availability_slots() from public;
grant execute on function public.wt_staff_availability_slots() to authenticated;

create or replace function public.wt_staff_create_availability_slot(
  target_coach_id uuid, next_starts_at timestamptz, next_ends_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_slot_id uuid;
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  if not public.wt_is_admin() and target_coach_id <> auth.uid() then
    raise exception '自分以外の対応枠は追加できません';
  end if;
  if not exists (select 1 from public.wt_user_roles where user_id = target_coach_id and role = 'coach') then
    raise exception 'コーチを選択してください';
  end if;
  if next_starts_at <= now() or next_ends_at <= next_starts_at then
    raise exception '現在より後の正しい時間を選択してください';
  end if;
  insert into public.wt_coach_availability_slots (coach_id, starts_at, ends_at)
  values (target_coach_id, next_starts_at, next_ends_at)
  returning id into new_slot_id;
  return new_slot_id;
exception when exclusion_violation or unique_violation then
  raise exception '同じ時間帯に別の対応枠があります';
end;
$$;
revoke all on function public.wt_staff_create_availability_slot(uuid, timestamptz, timestamptz) from public;
grant execute on function public.wt_staff_create_availability_slot(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.wt_staff_update_availability_slot(
  target_slot_id uuid, next_starts_at timestamptz, next_ends_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
declare slot_row public.wt_coach_availability_slots%rowtype;
begin
  select * into slot_row from public.wt_coach_availability_slots
  where id = target_slot_id for update;
  if slot_row.id is null then raise exception '対応枠が見つかりません'; end if;
  if not public.wt_is_admin() and not (public.wt_is_coach() and slot_row.coach_id = auth.uid()) then
    raise exception 'この対応枠は編集できません';
  end if;
  if exists (select 1 from public.wt_online_sessions where slot_id = target_slot_id and status <> 'cancelled') then
    raise exception '予約済みの枠です。先に予約をキャンセルするか、予約日時を個別に変更してください';
  end if;
  if next_starts_at <= now() or next_ends_at <= next_starts_at then
    raise exception '現在より後の正しい時間を選択してください';
  end if;
  update public.wt_coach_availability_slots
  set starts_at = next_starts_at, ends_at = next_ends_at, active = true, updated_at = now()
  where id = target_slot_id;
exception when exclusion_violation or unique_violation then
  raise exception '同じ時間帯に別の対応枠があります';
end;
$$;
revoke all on function public.wt_staff_update_availability_slot(uuid, timestamptz, timestamptz) from public;
grant execute on function public.wt_staff_update_availability_slot(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.wt_staff_delete_availability_slot(target_slot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare slot_row public.wt_coach_availability_slots%rowtype;
begin
  select * into slot_row from public.wt_coach_availability_slots
  where id = target_slot_id for update;
  if slot_row.id is null then raise exception '対応枠が見つかりません'; end if;
  if not public.wt_is_admin() and not (public.wt_is_coach() and slot_row.coach_id = auth.uid()) then
    raise exception 'この対応枠は削除できません';
  end if;
  if exists (select 1 from public.wt_online_sessions where slot_id = target_slot_id and status <> 'cancelled') then
    raise exception '予約済みの枠です。先に予約をキャンセルするか、予約日時を個別に変更してください';
  end if;
  update public.wt_coach_availability_slots
  set active = false, updated_at = now()
  where id = target_slot_id;
end;
$$;
revoke all on function public.wt_staff_delete_availability_slot(uuid) from public;
grant execute on function public.wt_staff_delete_availability_slot(uuid) to authenticated;

-- Add coach identity fields used by the booking calendar cards.
drop function if exists public.wt_staff_online_sessions();
create function public.wt_staff_online_sessions()
returns table (
  session_id uuid, owner_id uuid, owner_email text, owner_name text, dog_name text,
  coach_id uuid, coach_name text, coach_avatar_url text, coach_headline text,
  session_type text, status text, starts_at timestamptz, ends_at timestamptz,
  meet_url text, calendar_sync_status text, calendar_sync_error text
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  return query
  select session.id, session.owner_id, coalesce(owner_user.email, '')::text,
    coalesce(owner_profile.display_name, owner_user.email, 'オーナー')::text,
    dog.name::text, session.coach_id,
    coalesce(coach_profile.display_name, coach_user.email, 'コーチ')::text,
    coalesce(coach_profile.avatar_url, '')::text,
    coalesce(coach_profile.headline, '')::text,
    session.session_type::text, session.status::text, session.starts_at, session.ends_at,
    session.meet_url::text, session.calendar_sync_status::text, session.calendar_sync_error::text
  from public.wt_online_sessions session
  join auth.users owner_user on owner_user.id = session.owner_id
  join auth.users coach_user on coach_user.id = session.coach_id
  join public.wt_dogs dog on dog.id = session.dog_id
  left join public.wt_user_roles owner_profile on owner_profile.user_id = session.owner_id
  left join public.wt_coach_profiles coach_profile on coach_profile.coach_id = session.coach_id
  where public.wt_is_admin() or session.coach_id = auth.uid()
  order by session.starts_at;
end;
$$;
revoke all on function public.wt_staff_online_sessions() from public;
grant execute on function public.wt_staff_online_sessions() to authenticated;
