create table if not exists public.wt_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_status text not null default 'inactive'
    check (plan_status in ('inactive', 'active_member', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  stripe_price_id text,
  stripe_event_id text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wt_subscriptions enable row level security;

drop policy if exists "users read own subscription" on public.wt_subscriptions;
create policy "users read own subscription"
  on public.wt_subscriptions for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.wt_subscriptions from anon, authenticated;
grant select on public.wt_subscriptions to authenticated;
