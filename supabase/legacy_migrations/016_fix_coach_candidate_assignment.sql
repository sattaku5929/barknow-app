-- Restore the current coaching status constraint and coach candidate assignment RPC.
-- Run after 015_admin_user_directory.sql.

alter table public.wt_coaching_applications
  drop constraint if exists wt_coaching_applications_status_check;
alter table public.wt_coaching_applications
  add constraint wt_coaching_applications_status_check
  check (status in ('submitted', 'offered', 'assigned', 'consulting', 'payment_pending', 'active', 'closed'));

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
    select 1
    from public.wt_user_roles r
    where r.user_id = target_coach_id and r.role = 'coach'
  ) then
    raise exception 'selected user does not have coach role';
  end if;

  select application.owner_id, application.dog_id
  into target_owner_id, target_dog_id
  from public.wt_coaching_applications application
  where application.id = target_application_id
    and application.status <> 'closed'
  for update;

  if target_owner_id is null then
    raise exception 'coaching application not found or already closed';
  end if;

  if target_owner_id = target_coach_id then
    raise exception 'owner and coach must be different accounts';
  end if;

  delete from public.wt_coach_assignments assignment
  where assignment.dog_id = target_dog_id;

  insert into public.wt_coach_assignments (coach_id, owner_id, dog_id)
  values (target_coach_id, target_owner_id, target_dog_id);

  update public.wt_coaching_applications application
  set assigned_coach_id = target_coach_id,
      assigned_at = null,
      status = 'offered',
      updated_at = now()
  where application.id = target_application_id;
end;
$$;

revoke all on function public.wt_admin_assign_coaching_application(uuid, uuid) from public;
grant execute on function public.wt_admin_assign_coaching_application(uuid, uuid) to authenticated;
