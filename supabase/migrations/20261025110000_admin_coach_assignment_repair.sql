-- Repair only a verified, owner-confirmed historical coaching assignment.
-- No existing application, role, chat, session or contract data is modified.
-- The write is made only after an admin explicitly confirms the assignment.

create table if not exists public.wt_assignment_repair_audit (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.wt_coaching_applications(id),
  owner_id uuid not null references auth.users(id),
  dog_id uuid not null references public.wt_dogs(id),
  coach_id uuid not null references auth.users(id),
  repaired_by uuid not null references auth.users(id),
  justification text not null check (length(btrim(justification)) between 15 and 500),
  created_at timestamptz not null default now()
);
alter table public.wt_assignment_repair_audit enable row level security;
revoke all on table public.wt_assignment_repair_audit from public, anon, authenticated;
grant select on table public.wt_assignment_repair_audit to service_role;

-- Small read-only report for the existing Admin coaching-applications screen.
create or replace function public.wt_admin_coaching_assignment_issues()
returns table (
  application_id uuid,
  coach_role text,
  coach_profile_exists boolean,
  booked_sessions integer
)
language plpgsql
stable
security definer
set search_path = ''
as $wt_assignment_issues$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  return query
  select a.id,
    coalesce(r.role, 'none')::text,
    exists(select 1 from public.wt_coach_profiles cp where cp.coach_id = a.assigned_coach_id),
    (select count(*)::integer from public.wt_online_sessions s where s.application_id = a.id)
  from public.wt_coaching_applications a
  left join public.wt_user_roles r on r.user_id = a.assigned_coach_id
  where a.status in ('assigned','consulting','payment_pending','active')
    and a.owner_confirmed_at is not null
    and a.assigned_coach_id is not null
    and not exists (
      select 1 from public.wt_coach_assignments x
      where x.owner_id = a.owner_id
        and x.dog_id = a.dog_id
        and x.coach_id = a.assigned_coach_id
    );
end;
$wt_assignment_issues$;

revoke all on function public.wt_admin_coaching_assignment_issues() from public;
grant execute on function public.wt_admin_coaching_assignment_issues() to authenticated, service_role;

-- Confirmed by the operator via an explicit UI action with a written reason.
-- Unlike wt_admin_assign_customer, this does not replace or reassign anybody.
create or replace function public.wt_admin_reconcile_confirmed_assignment(
  target_application_id uuid,
  justification text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $wt_reconcile_assignment$
declare
  a public.wt_coaching_applications%rowtype;
  current_role text;
  inserted_id uuid;
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if justification is null or length(btrim(justification)) not between 15 and 500 then
    raise exception 'a written confirmation between 15 and 500 characters is required';
  end if;

  select * into a from public.wt_coaching_applications
  where id = target_application_id
  for update;
  if not found
     or a.status not in ('assigned','consulting','payment_pending','active')
     or a.owner_confirmed_at is null
     or a.assigned_coach_id is null then
    raise exception 'no currently confirmed coaching application found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(a.dog_id::text, 0));
  if a.owner_id = a.assigned_coach_id then
    raise exception 'owner cannot be own coach';
  end if;
  if not exists(select 1 from public.wt_dogs d where d.id = a.dog_id and d.owner_id = a.owner_id) then
    raise exception 'owner and dog do not match';
  end if;
  if not exists(select 1 from public.wt_user_roles r where r.user_id = a.owner_id and r.role='owner') then
    raise exception 'owner role mismatch';
  end if;

  select r.role into current_role from public.wt_user_roles r where r.user_id=a.assigned_coach_id;
  if current_role is null or current_role not in ('admin','coach')
     or not exists(select 1 from public.wt_coach_profiles c where c.coach_id=a.assigned_coach_id) then
    raise exception 'confirmed coach has no valid staff role or coach profile';
  end if;

  -- Never change an assignment belonging to another coach, even by accident.
  if exists(select 1 from public.wt_coach_assignments x where x.dog_id = a.dog_id) then
    raise exception 'an existing coach assignment must be reviewed separately';
  end if;
  if exists(
    select 1 from public.wt_online_sessions s
    where s.application_id = a.id
      and (s.owner_id <> a.owner_id
           or s.dog_id <> a.dog_id
           or s.coach_id <> a.assigned_coach_id)
  ) then
    raise exception 'historical online session identities do not match the application';
  end if;

  insert into public.wt_coach_assignments (owner_id, dog_id, coach_id)
  values (a.owner_id, a.dog_id, a.assigned_coach_id)
  returning id into inserted_id;

  insert into public.wt_assignment_repair_audit
    (application_id, owner_id, dog_id, coach_id, repaired_by, justification)
  values
    (a.id, a.owner_id, a.dog_id, a.assigned_coach_id, auth.uid(), btrim(justification));

  return jsonb_build_object('repaired',true,'assignment_id',inserted_id);
end;
$wt_reconcile_assignment$;

revoke all on function public.wt_admin_reconcile_confirmed_assignment(uuid, text) from public;
grant execute on function public.wt_admin_reconcile_confirmed_assignment(uuid, text) to authenticated, service_role;

comment on function public.wt_admin_reconcile_confirmed_assignment(uuid,text)
is 'Admin-confirmed audit-logged repair for existing owner-confirmed coach application; never changes roles or application history.';
