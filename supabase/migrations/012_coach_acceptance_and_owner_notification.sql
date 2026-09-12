-- Add coach acceptance between admin matching and owner confirmation.
-- Run after 011_coaching_application_funnel.sql.

alter table public.wt_coaching_applications
  drop constraint if exists wt_coaching_applications_status_check;
alter table public.wt_coaching_applications
  add constraint wt_coaching_applications_status_check
  check (status in ('submitted', 'offered', 'assigned', 'consulting', 'payment_pending', 'active', 'closed'));

create or replace function public.wt_admin_coaching_applications()
returns table (
  application_id uuid,
  owner_id uuid,
  dog_id uuid,
  dog_name text,
  owner_email text,
  status text,
  concern_categories text[],
  desired_outcome text,
  note text,
  assigned_coach_id uuid,
  coach_email text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.wt_is_staff() then
    raise exception 'staff role required';
  end if;

  return query
  select
    a.id,
    a.owner_id,
    a.dog_id,
    d.name,
    coalesce(owner_user.email, ''),
    a.status,
    a.concern_categories,
    a.desired_outcome,
    a.note,
    a.assigned_coach_id,
    coach_user.email,
    a.submitted_at
  from public.wt_coaching_applications a
  join public.wt_dogs d on d.id = a.dog_id
  join auth.users owner_user on owner_user.id = a.owner_id
  left join auth.users coach_user on coach_user.id = a.assigned_coach_id
  where public.wt_is_admin() or a.assigned_coach_id = auth.uid()
  order by
    case a.status
      when 'submitted' then 1
      when 'offered' then 2
      when 'assigned' then 3
      when 'consulting' then 4
      when 'payment_pending' then 5
      when 'active' then 6
      else 7
    end,
    a.submitted_at desc;
end;
$$;

create or replace function public.wt_admin_assign_coaching_application(
  target_application_id uuid,
  target_coach_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner_id uuid;
  target_dog_id uuid;
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if not exists (
    select 1 from public.wt_user_roles
    where user_id = target_coach_id and role = 'coach'
  ) then
    raise exception 'coach role required';
  end if;

  select owner_id, dog_id
  into target_owner_id, target_dog_id
  from public.wt_coaching_applications
  where id = target_application_id and status <> 'closed';

  if target_owner_id is null then
    raise exception 'application not found';
  end if;

  delete from public.wt_coach_assignments where dog_id = target_dog_id;
  insert into public.wt_coach_assignments (coach_id, owner_id, dog_id)
  values (target_coach_id, target_owner_id, target_dog_id);

  update public.wt_coaching_applications
  set assigned_coach_id = target_coach_id,
      assigned_at = null,
      status = 'offered',
      updated_at = now()
  where id = target_application_id;
end;
$$;

create or replace function public.wt_coach_accept_application(target_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_owner_id uuid;
  target_dog_id uuid;
begin
  if not public.wt_is_coach() then
    raise exception 'coach role required';
  end if;

  select owner_id, dog_id
  into target_owner_id, target_dog_id
  from public.wt_coaching_applications
  where id = target_application_id
    and assigned_coach_id = auth.uid()
    and status = 'offered'
  for update;

  if target_owner_id is null then
    raise exception 'offer not found';
  end if;

  update public.wt_coaching_applications
  set status = 'assigned', assigned_at = now(), updated_at = now()
  where id = target_application_id;

  insert into public.wt_coach_messages (owner_id, dog_id, sender, body)
  values (
    target_owner_id,
    target_dog_id,
    'coach',
    '担当コーチが決まりました。これまでの記録を見ながら、まずは今いちばん気になることから一緒に整理していきましょう。'
  );
end;
$$;

revoke all on function public.wt_coach_accept_application(uuid) from public;
grant execute on function public.wt_coach_accept_application(uuid) to authenticated;

create or replace function public.wt_coach_decline_application(target_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_dog_id uuid;
begin
  if not public.wt_is_coach() then
    raise exception 'coach role required';
  end if;

  select dog_id into target_dog_id
  from public.wt_coaching_applications
  where id = target_application_id
    and assigned_coach_id = auth.uid()
    and status = 'offered'
  for update;

  if target_dog_id is null then
    raise exception 'offer not found';
  end if;

  update public.wt_coaching_applications
  set status = 'submitted',
      assigned_coach_id = null,
      assigned_at = null,
      updated_at = now()
  where id = target_application_id;

  delete from public.wt_coach_assignments
  where dog_id = target_dog_id and coach_id = auth.uid();
end;
$$;

revoke all on function public.wt_coach_decline_application(uuid) from public;
grant execute on function public.wt_coach_decline_application(uuid) to authenticated;

create or replace function public.wt_admin_update_coaching_status(
  target_application_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if next_status not in ('submitted', 'consulting', 'payment_pending', 'active', 'closed') then
    raise exception 'coach acceptance required';
  end if;

  select status into current_status
  from public.wt_coaching_applications
  where id = target_application_id;

  if current_status is null then
    raise exception 'application not found';
  end if;
  if next_status in ('consulting', 'payment_pending', 'active')
    and current_status not in ('assigned', 'consulting', 'payment_pending', 'active') then
    raise exception 'coach acceptance required';
  end if;

  update public.wt_coaching_applications
  set status = next_status, updated_at = now()
  where id = target_application_id;

  if next_status = 'closed' then
    delete from public.wt_coach_assignments
    where dog_id = (
      select dog_id from public.wt_coaching_applications
      where id = target_application_id
    );
  end if;
end;
$$;

revoke all on function public.wt_admin_update_coaching_status(uuid, text) from public;
grant execute on function public.wt_admin_update_coaching_status(uuid, text) to authenticated;

create or replace function public.wt_coach_assignment_notification_details(target_application_id uuid)
returns table (
  owner_email text,
  dog_name text,
  coach_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.wt_is_coach() then
    raise exception 'coach role required';
  end if;

  return query
  select
    coalesce(owner_user.email, ''),
    d.name,
    coalesce(coach_user.email, '')
  from public.wt_coaching_applications a
  join public.wt_dogs d on d.id = a.dog_id
  join auth.users owner_user on owner_user.id = a.owner_id
  join auth.users coach_user on coach_user.id = a.assigned_coach_id
  where a.id = target_application_id
    and a.assigned_coach_id = auth.uid()
    and a.status in ('assigned', 'consulting', 'payment_pending', 'active');
end;
$$;

revoke all on function public.wt_coach_assignment_notification_details(uuid) from public;
grant execute on function public.wt_coach_assignment_notification_details(uuid) to authenticated;

create or replace function public.wt_admin_customer_overview()
returns table (
  assignment_id uuid,
  owner_id uuid,
  dog_id uuid,
  dog_name text,
  breed text,
  records_7d bigint,
  concerns_7d bigint,
  latest_message text,
  latest_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.wt_is_staff() then
    raise exception 'staff role required';
  end if;

  return query
  select
    a.id,
    a.owner_id,
    d.id,
    d.name,
    coalesce(d.breed, ''),
    count(r.id) filter (where r.recorded_on >= current_date - 6),
    count(r.id) filter (
      where r.recorded_on >= current_date - 6
        and (
          r.appetite = '気になる'
          or r.activity = '気になる'
          or r.toilet = '気になる'
          or r.sleep = '気になる'
          or coalesce(r.behavior_intensity, 0) >= 7
        )
    ),
    (
      select m.body from public.wt_coach_messages m
      where m.dog_id = d.id order by m.created_at desc limit 1
    ),
    (
      select m.created_at from public.wt_coach_messages m
      where m.dog_id = d.id order by m.created_at desc limit 1
    )
  from public.wt_coach_assignments a
  join public.wt_dogs d on d.id = a.dog_id
  left join public.wt_daily_records r on r.dog_id = d.id
  where (public.wt_is_admin() or a.coach_id = auth.uid())
    and not exists (
      select 1 from public.wt_coaching_applications application
      where application.dog_id = a.dog_id and application.status = 'offered'
    )
  group by a.id, a.owner_id, d.id, d.name, d.breed
  order by 9 desc nulls last, d.name;
end;
$$;
