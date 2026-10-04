-- Connect owner records to coaching applications and coach assignments.
-- Run after 010_owner_coach_admin_roles.sql.

create table if not exists public.wt_coaching_applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  status text not null default 'submitted'
    check (status in ('submitted', 'assigned', 'consulting', 'payment_pending', 'active', 'closed')),
  concern_categories text[] not null default '{}',
  desired_outcome text not null,
  note text not null default '',
  assigned_coach_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  assigned_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists wt_coaching_applications_open_dog_idx
  on public.wt_coaching_applications(dog_id)
  where status <> 'closed';
create index if not exists wt_coaching_applications_status_idx
  on public.wt_coaching_applications(status, submitted_at desc);
create index if not exists wt_coaching_applications_coach_idx
  on public.wt_coaching_applications(assigned_coach_id, updated_at desc);

alter table public.wt_coaching_applications enable row level security;

drop policy if exists "owners create coaching applications" on public.wt_coaching_applications;
create policy "owners create coaching applications"
  on public.wt_coaching_applications for insert to authenticated
  with check (
    owner_id = auth.uid()
    and status = 'submitted'
    and assigned_coach_id is null
    and exists (
      select 1 from public.wt_dogs d
      where d.id = dog_id and d.owner_id = auth.uid()
    )
  );

drop policy if exists "owners read coaching applications" on public.wt_coaching_applications;
create policy "owners read coaching applications"
  on public.wt_coaching_applications for select to authenticated
  using (
    owner_id = auth.uid()
    or public.wt_is_admin()
    or (
      public.wt_is_coach()
      and assigned_coach_id = auth.uid()
    )
  );

grant select, insert on public.wt_coaching_applications to authenticated;

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
  if not public.wt_is_admin() then
    raise exception 'admin role required';
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
  order by
    case a.status
      when 'submitted' then 1
      when 'assigned' then 2
      when 'consulting' then 3
      when 'payment_pending' then 4
      when 'active' then 5
      else 6
    end,
    a.submitted_at desc;
end;
$$;

revoke all on function public.wt_admin_coaching_applications() from public;
grant execute on function public.wt_admin_coaching_applications() to authenticated;

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
      assigned_at = now(),
      status = 'assigned',
      updated_at = now()
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

revoke all on function public.wt_admin_assign_coaching_application(uuid, uuid) from public;
grant execute on function public.wt_admin_assign_coaching_application(uuid, uuid) to authenticated;

create or replace function public.wt_admin_update_coaching_status(
  target_application_id uuid,
  next_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if next_status not in ('submitted', 'assigned', 'consulting', 'payment_pending', 'active', 'closed') then
    raise exception 'invalid status';
  end if;
  if next_status in ('assigned', 'consulting', 'payment_pending', 'active')
    and not exists (
      select 1 from public.wt_coaching_applications
      where id = target_application_id and assigned_coach_id is not null
    ) then
    raise exception 'assign a coach first';
  end if;

  update public.wt_coaching_applications
  set status = next_status, updated_at = now()
  where id = target_application_id;

  if not found then
    raise exception 'application not found';
  end if;

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
