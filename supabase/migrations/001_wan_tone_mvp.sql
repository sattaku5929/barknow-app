-- Wan Tone owner MVP schema.
-- Run this in the Supabase SQL editor, then enable Anonymous Sign-Ins in
-- Authentication > Providers so owners can start without a password.

create extension if not exists pgcrypto;

create table if not exists public.wt_dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  breed text,
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

create table if not exists public.wt_daily_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  recorded_on date not null default current_date,
  mood smallint not null check (mood between 1 and 5),
  appetite text not null check (appetite in ('良い', 'ふつう', '気になる')),
  activity text not null check (activity in ('良い', 'ふつう', '気になる')),
  toilet text not null check (toilet in ('良い', 'ふつう', '気になる')),
  sleep text not null check (sleep in ('良い', 'ふつう', '気になる')),
  behavior_note text,
  good_moment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dog_id, recorded_on)
);

create table if not exists public.wt_coach_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  sender text not null check (sender in ('owner', 'coach')),
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists wt_daily_records_owner_date_idx
  on public.wt_daily_records(owner_id, recorded_on desc);
create index if not exists wt_coach_messages_owner_created_idx
  on public.wt_coach_messages(owner_id, created_at);

alter table public.wt_dogs enable row level security;
alter table public.wt_daily_records enable row level security;
alter table public.wt_coach_messages enable row level security;

create policy "Owners manage their dog"
  on public.wt_dogs for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage their records"
  on public.wt_daily_records for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners read their messages"
  on public.wt_coach_messages for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Owners send owner messages"
  on public.wt_coach_messages for insert
  to authenticated
  with check (owner_id = auth.uid() and sender = 'owner');

-- Coach replies should be written by a separate authenticated coach portal or
-- trusted server using explicit assignment checks. Do not expose service-role keys
-- in this client application.
