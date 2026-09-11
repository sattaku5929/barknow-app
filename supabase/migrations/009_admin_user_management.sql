-- Admin-facing account and assignment management.
-- Run after 008_auth_roles_and_coach_assignments.sql.

create or replace function public.wt_admin_accounts()
returns table (
  user_id uuid,
  email text,
  role text,
  dog_id uuid,
  dog_name text,
  assigned_coach_id uuid
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;

  return query
  select
    u.id,
    coalesce(u.email, ''),
    r.role,
    d.id,
    d.name,
    (
      select a.coach_id from public.wt_coach_assignments a
      where a.dog_id = d.id order by a.created_at limit 1
    )
  from auth.users u
  join public.wt_user_roles r on r.user_id = u.id
  left join public.wt_dogs d on d.owner_id = u.id
  where u.email is not null
  order by (r.role = 'admin') desc, u.created_at;
end;
$$;

revoke all on function public.wt_admin_accounts() from public;
grant execute on function public.wt_admin_accounts() to authenticated;

create or replace function public.wt_admin_set_role(target_user_id uuid, next_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if next_role not in ('owner', 'admin') then
    raise exception 'invalid role';
  end if;
  if target_user_id = auth.uid() and next_role <> 'admin' then
    raise exception 'cannot remove your own admin role';
  end if;

  insert into public.wt_user_roles (user_id, role, updated_at)
  values (target_user_id, next_role, now())
  on conflict (user_id) do update
    set role = excluded.role, updated_at = now();

  if next_role = 'admin' then
    delete from public.wt_coach_assignments where owner_id = target_user_id;
  end if;
end;
$$;

revoke all on function public.wt_admin_set_role(uuid, text) from public;
grant execute on function public.wt_admin_set_role(uuid, text) to authenticated;

create or replace function public.wt_admin_assign_to_me(target_owner_id uuid, target_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if not exists (
    select 1 from public.wt_dogs d
    join public.wt_user_roles r on r.user_id = d.owner_id
    where d.id = target_dog_id and d.owner_id = target_owner_id and r.role = 'owner'
  ) then
    raise exception 'owner or dog not found';
  end if;
  if exists (
    select 1 from public.wt_coach_assignments a
    where a.dog_id = target_dog_id and a.coach_id <> auth.uid()
  ) then
    raise exception 'customer is already assigned';
  end if;

  insert into public.wt_coach_assignments (coach_id, owner_id, dog_id)
  values (auth.uid(), target_owner_id, target_dog_id)
  on conflict (coach_id, dog_id) do nothing;
end;
$$;

revoke all on function public.wt_admin_assign_to_me(uuid, uuid) from public;
grant execute on function public.wt_admin_assign_to_me(uuid, uuid) to authenticated;

create or replace function public.wt_admin_remove_assignment(target_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  delete from public.wt_coach_assignments
  where coach_id = auth.uid() and dog_id = target_dog_id;
end;
$$;

revoke all on function public.wt_admin_remove_assignment(uuid) from public;
grant execute on function public.wt_admin_remove_assignment(uuid) to authenticated;
