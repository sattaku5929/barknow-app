-- Fix the admin application RPC returning varchar values for text columns.
-- PostgreSQL requires RETURN QUERY column types to match the declared table exactly.
-- Run after 012_coach_acceptance_and_owner_notification.sql.

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
    d.name::text,
    coalesce(owner_user.email, '')::text,
    a.status::text,
    a.concern_categories,
    a.desired_outcome::text,
    a.note::text,
    a.assigned_coach_id,
    coach_user.email::text,
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

revoke all on function public.wt_admin_coaching_applications() from public;
grant execute on function public.wt_admin_coaching_applications() to authenticated;
