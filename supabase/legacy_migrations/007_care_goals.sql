create table if not exists public.wt_care_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  goal_type text not null check (goal_type in ('brush','teeth','paws','bath','nails','ears','training','custom')),
  target_count smallint not null check (target_count between 1 and 31),
  period text not null check (period in ('day','week','month')),
  reminder_time time,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.wt_care_goals
  add column if not exists reminder_time time;

create table if not exists public.wt_care_goal_completions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.wt_care_goals(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  completed_on date not null default current_date,
  completed_at timestamptz not null default now()
);

create index if not exists wt_care_goals_owner_active_idx
  on public.wt_care_goals(owner_id, active);
create index if not exists wt_care_goal_completions_owner_date_idx
  on public.wt_care_goal_completions(owner_id, completed_on desc);
create index if not exists wt_care_goal_completions_goal_date_idx
  on public.wt_care_goal_completions(goal_id, completed_on desc);

alter table public.wt_care_goals enable row level security;
alter table public.wt_care_goal_completions enable row level security;

drop policy if exists "owners manage care goals" on public.wt_care_goals;
create policy "owners manage care goals"
  on public.wt_care_goals for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "owners manage care completions" on public.wt_care_goal_completions;
create policy "owners manage care completions"
  on public.wt_care_goal_completions for all
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.wt_care_goals goal
      where goal.id = goal_id and goal.owner_id = auth.uid()
    )
  );
