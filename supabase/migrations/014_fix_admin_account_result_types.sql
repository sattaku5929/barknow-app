-- Fix the admin account RPC returning varchar email values for a text column.
-- Run after 013_fix_admin_coaching_application_result_types.sql.

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
    coalesce(u.email, '')::text,
    r.role::text,
    d.id,
    d.name::text,
    (
      select a.coach_id
      from public.wt_coach_assignments a
      where a.dog_id = d.id
      order by a.created_at
      limit 1
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
