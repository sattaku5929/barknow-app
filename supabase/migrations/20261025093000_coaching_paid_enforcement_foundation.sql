-- Rollout-safe paid-coaching enforcement foundation.
-- The switch defaults OFF. Do not enable in production until billing and all
-- app/API clients are deployed and the pilot cohort has been reviewed.
-- This migration preserves all existing chat reads, writes and bookings while off.

create table if not exists public.wt_coaching_access_control (
  singleton boolean primary key default true check (singleton),
  enforce_paid boolean not null default false,
  changed_at timestamptz not null default now()
);

insert into public.wt_coaching_access_control (singleton, enforce_paid)
values (true, false)
on conflict (singleton) do nothing;

alter table public.wt_coaching_access_control enable row level security;
revoke all on public.wt_coaching_access_control from public, anon, authenticated;

create table if not exists public.wt_coaching_trial_grants (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  reason text not null,
  granted_at timestamptz not null default now()
);

alter table public.wt_coaching_trial_grants enable row level security;
revoke all on public.wt_coaching_trial_grants from public, anon, authenticated;

-- Preserve currently CONFIRMED coaching test users; do not seed from merely
-- submitted/offered/closed applications. Time-limited, admin review required
-- before enabling paid enforcement.
insert into public.wt_coaching_trial_grants (owner_id, expires_at, reason)
select distinct owner_id, now() + interval '180 days', 'pre-launch confirmed coaching cohort'
from public.wt_coaching_applications
where assigned_coach_id is not null
  and owner_confirmed_at is not null
  and status in ('assigned', 'consulting', 'payment_pending', 'active')
on conflict (owner_id) do nothing;

create or replace function public.wt_coaching_paid_enforcement_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.enforce_paid from public.wt_coaching_access_control c where c.singleton = true),
    false
  );
$$;

create or replace function public.wt_coaching_contract_ready(target_owner_id uuid, target_dog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_owner_id is not null
    and target_dog_id is not null
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = target_dog_id and dog.owner_id = target_owner_id
    )
    and exists (
      select 1 from public.wt_coaching_applications app
      join public.wt_coach_assignments assignment
        on assignment.owner_id = app.owner_id
       and assignment.dog_id = app.dog_id
       and assignment.coach_id = app.assigned_coach_id
      where app.owner_id = target_owner_id
        and app.dog_id = target_dog_id
        and app.assigned_coach_id is not null
        and app.owner_confirmed_at is not null
        and app.status in ('assigned', 'consulting', 'payment_pending', 'active')
    )
    and (
      exists (
        select 1 from public.wt_subscriptions sub
        where sub.user_id = target_owner_id
          and sub.plan_status = 'active_member'
      )
      or exists (
        select 1 from public.wt_coaching_trial_grants trial
        where trial.owner_id = target_owner_id and trial.expires_at > now()
      )
    );
$$;

create or replace function public.wt_coaching_write_allowed(target_owner_id uuid, target_dog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.wt_coaching_paid_enforcement_enabled()
    or public.wt_coaching_contract_ready(target_owner_id, target_dog_id);
$$;

-- These functions are used by RLS/DB triggers, not as client-supplied
-- identifiers for granting paid access.
revoke all on function public.wt_coaching_paid_enforcement_enabled() from public;
revoke all on function public.wt_coaching_contract_ready(uuid, uuid) from public;
revoke all on function public.wt_coaching_write_allowed(uuid, uuid) from public;
grant execute on function public.wt_coaching_paid_enforcement_enabled() to authenticated, service_role;
grant execute on function public.wt_coaching_contract_ready(uuid, uuid) to authenticated, service_role;
grant execute on function public.wt_coaching_write_allowed(uuid, uuid) to authenticated, service_role;

-- Preserve the original identity and sender policies while the switch is OFF.
-- In the paid phase they also check server-owned membership + coach approval.
alter policy "Owners send owner messages"
on public.wt_coach_messages
with check (
  owner_id = auth.uid()
  and sender = 'owner'
  and public.wt_coaching_write_allowed(owner_id, dog_id)
);

alter policy "assigned staff reply"
on public.wt_coach_messages
with check (
  sender = 'coach'
  and (
    public.wt_is_admin()
    or (
      public.wt_is_coach()
      and exists (
        select 1 from public.wt_coach_assignments assignment
        where assignment.coach_id = auth.uid()
          and assignment.dog_id = wt_coach_messages.dog_id
          and assignment.owner_id = wt_coach_messages.owner_id
      )
    )
  )
  and (
    public.wt_is_admin()
    or public.wt_coaching_write_allowed(owner_id, dog_id)
  )
);

-- Catches INSERTs done through wt_book_online_session SECURITY DEFINER,
-- not only the Next.js booking endpoint, so direct RPC calls cannot bypass it.
create or replace function public.wt_gate_paid_online_session_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wt_coaching_paid_enforcement_enabled()
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and not public.wt_is_admin()
    and not public.wt_coaching_contract_ready(new.owner_id, new.dog_id)
  then
    raise exception '有効な月額契約と担当コーチの確定が必要です';
  end if;
  return new;
end;
$$;

revoke all on function public.wt_gate_paid_online_session_insert() from public;

drop trigger if exists wt_gate_paid_online_session_insert on public.wt_online_sessions;
create trigger wt_gate_paid_online_session_insert
before insert on public.wt_online_sessions
for each row execute function public.wt_gate_paid_online_session_insert();

-- NO UPDATE to enforce_paid=true in this migration. Explicitly review pilot
-- grants and Stripe/provider lifecycle before switching this on in a later PR.
