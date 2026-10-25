-- Admin accounts may exercise the owner-side premium feature set without a
-- paid subscription. This never writes to Stripe or wt_subscriptions.
-- Contract/assignment/ownership requirements remain IDENTICAL to paid owners.
-- Never accept a caller-provided "is_admin" or membership flag.
create or replace function public.wt_coaching_contract_ready(target_owner_id uuid, target_dog_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select target_owner_id is not null
    and target_dog_id is not null
    and exists (
      select 1 from public.wt_dogs dog
      where dog.id = target_dog_id and dog.owner_id = target_owner_id
    )
    and exists (
      select 1
      from public.wt_coaching_applications app
      join public.wt_coach_assignments assignment
        on assignment.owner_id = app.owner_id
       and assignment.dog_id = app.dog_id
       and assignment.coach_id = app.assigned_coach_id
      where app.owner_id = target_owner_id
        and app.dog_id = target_dog_id
        and app.assigned_coach_id is not null
        and app.owner_confirmed_at is not null
        and app.status in ('assigned','consulting','payment_pending','active')
    )
    and (
      exists (
        select 1 from public.wt_subscriptions sub
        where sub.user_id = target_owner_id and sub.plan_status = 'active_member'
      )
      or exists (
        select 1 from public.wt_coaching_trial_grants trial
        where trial.owner_id = target_owner_id and trial.expires_at > now()
      )
      or exists (
        select 1 from public.wt_user_roles staff
        where staff.user_id = target_owner_id and staff.role = 'admin'
      )
    );
$$;

-- Contract guard is internal to security/booking routines, never callable
-- directly through an untrusted Data API session.
revoke execute on function public.wt_coaching_contract_ready(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.wt_coaching_contract_ready(uuid, uuid)
  to service_role;
comment on function public.wt_coaching_contract_ready(uuid,uuid)
  is 'Verified Admin owner gets subscription-only exemption; own dog and confirmed matching coach required. No billing changes.';
