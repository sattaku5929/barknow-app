-- Add administrator-managed display names and account activity to the user directory.
-- Run after 014_fix_admin_account_result_types.sql.

alter table public.wt_user_roles
  add column if not exists display_name text;

drop function if exists public.wt_admin_accounts();
create function public.wt_admin_accounts()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  dog_id uuid,
  dog_name text,
  assigned_coach_id uuid,
  last_sign_in_at timestamptz,
  created_at timestamptz
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
    coalesce(r.display_name, '')::text,
    r.role::text,
    d.id,
    d.name::text,
    (
      select a.coach_id
      from public.wt_coach_assignments a
      where a.dog_id = d.id
      order by a.created_at
      limit 1
    ),
    u.last_sign_in_at,
    u.created_at
  from auth.users u
  join public.wt_user_roles r on r.user_id = u.id
  left join public.wt_dogs d on d.owner_id = u.id
  where u.email is not null
  order by (r.role = 'admin') desc, u.created_at;
end;
$$;

revoke all on function public.wt_admin_accounts() from public;
grant execute on function public.wt_admin_accounts() to authenticated;

create or replace function public.wt_admin_set_display_name(
  target_user_id uuid,
  target_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := btrim(target_display_name);
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 60 then
    raise exception 'display name must be between 1 and 60 characters';
  end if;

  update public.wt_user_roles
  set display_name = normalized_name,
      updated_at = now()
  where user_id = target_user_id;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

revoke all on function public.wt_admin_set_display_name(uuid, text) from public;
grant execute on function public.wt_admin_set_display_name(uuid, text) to authenticated;
