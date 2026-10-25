-- Paid-gate activation must preserve existing verified coaching access.
-- Reconciled assignments alone do not imply a paid subscription or pilot grant.
-- This is intentionally a separate trigger from the assignment-consistency guard.
create or replace function public.wt_check_paid_entitlements_on_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $wt_paid_entitlements$
begin
  if new.enforce_paid and not old.enforce_paid and exists (
    select 1 from public.wt_coaching_applications a
    where a.owner_confirmed_at is not null
      and a.assigned_coach_id is not null
      and a.status in ('assigned','consulting','payment_pending','active')
      and not public.wt_coaching_contract_ready(a.owner_id, a.dog_id)
  ) then
    raise exception 'Cannot enable paid coaching: confirmed owners need an active subscription or approved non-expired pilot grant';
  end if;
  return new;
end;
$wt_paid_entitlements$;

revoke execute on function public.wt_check_paid_entitlements_on_activation()
from public, anon, authenticated;

drop trigger if exists wt_check_paid_entitlements_on_activation on public.wt_coaching_access_control;
create trigger wt_check_paid_entitlements_on_activation
before update of enforce_paid on public.wt_coaching_access_control
for each row execute function public.wt_check_paid_entitlements_on_activation();

-- This migration never updates enforce_paid, subscriptions, or trial grants.
