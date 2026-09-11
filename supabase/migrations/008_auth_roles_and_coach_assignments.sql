-- Email authentication, role routing, and coach/customer assignments.
-- Run after the existing Wan Tone migrations.

create table if not exists public.wt_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wt_user_roles (user_id, role)
select id, 'owner' from auth.users
on conflict (user_id) do nothing;

create or replace function public.wt_create_default_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wt_user_roles (user_id, role)
  values (new.id, 'owner')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists wt_on_auth_user_created on auth.users;
create trigger wt_on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.wt_create_default_role();

create or replace function public.wt_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wt_user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.wt_is_admin() from public;
grant execute on function public.wt_is_admin() to authenticated;

create table if not exists public.wt_coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coach_id, dog_id),
  check (coach_id <> owner_id)
);

create index if not exists wt_coach_assignments_coach_idx
  on public.wt_coach_assignments(coach_id, created_at desc);
create index if not exists wt_coach_assignments_owner_idx
  on public.wt_coach_assignments(owner_id);

alter table public.wt_user_roles enable row level security;
alter table public.wt_coach_assignments enable row level security;

drop policy if exists "users read own role" on public.wt_user_roles;
create policy "users read own role"
  on public.wt_user_roles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "admins manage roles" on public.wt_user_roles;
create policy "admins manage roles"
  on public.wt_user_roles for all to authenticated
  using (public.wt_is_admin())
  with check (public.wt_is_admin());

drop policy if exists "coaches read assignments" on public.wt_coach_assignments;
create policy "coaches read assignments"
  on public.wt_coach_assignments for select to authenticated
  using (coach_id = auth.uid() and public.wt_is_admin());

drop policy if exists "admins manage assignments" on public.wt_coach_assignments;
create policy "admins manage assignments"
  on public.wt_coach_assignments for all to authenticated
  using (public.wt_is_admin())
  with check (public.wt_is_admin());

drop policy if exists "assigned coaches read dogs" on public.wt_dogs;
create policy "assigned coaches read dogs"
  on public.wt_dogs for select to authenticated
  using (
    public.wt_is_admin() and exists (
      select 1 from public.wt_coach_assignments a
      where a.coach_id = auth.uid() and a.dog_id = wt_dogs.id
    )
  );

drop policy if exists "assigned coaches read records" on public.wt_daily_records;
create policy "assigned coaches read records"
  on public.wt_daily_records for select to authenticated
  using (
    public.wt_is_admin() and exists (
      select 1 from public.wt_coach_assignments a
      where a.coach_id = auth.uid() and a.dog_id = wt_daily_records.dog_id
    )
  );

drop policy if exists "assigned coaches read messages" on public.wt_coach_messages;
create policy "assigned coaches read messages"
  on public.wt_coach_messages for select to authenticated
  using (
    public.wt_is_admin() and exists (
      select 1 from public.wt_coach_assignments a
      where a.coach_id = auth.uid() and a.dog_id = wt_coach_messages.dog_id
    )
  );

drop policy if exists "assigned coaches reply" on public.wt_coach_messages;
create policy "assigned coaches reply"
  on public.wt_coach_messages for insert to authenticated
  with check (
    sender = 'coach' and public.wt_is_admin() and exists (
      select 1 from public.wt_coach_assignments a
      where a.coach_id = auth.uid()
        and a.dog_id = wt_coach_messages.dog_id
        and a.owner_id = wt_coach_messages.owner_id
    )
  );

drop policy if exists "assigned coaches read care goals" on public.wt_care_goals;
create policy "assigned coaches read care goals"
  on public.wt_care_goals for select to authenticated
  using (
    public.wt_is_admin() and exists (
      select 1 from public.wt_coach_assignments a
      where a.coach_id = auth.uid() and a.dog_id = wt_care_goals.dog_id
    )
  );

drop policy if exists "assigned coaches read care completions" on public.wt_care_goal_completions;
create policy "assigned coaches read care completions"
  on public.wt_care_goal_completions for select to authenticated
  using (
    public.wt_is_admin() and exists (
      select 1 from public.wt_coach_assignments a
      where a.coach_id = auth.uid() and a.dog_id = wt_care_goal_completions.dog_id
    )
  );

create or replace function public.wt_admin_customer_overview()
returns table (
  assignment_id uuid,
  owner_id uuid,
  dog_id uuid,
  dog_name text,
  breed text,
  records_7d bigint,
  concerns_7d bigint,
  latest_message text,
  latest_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;

  return query
  select
    a.id,
    a.owner_id,
    d.id,
    d.name,
    coalesce(d.breed, ''),
    count(r.id) filter (where r.recorded_on >= current_date - 6),
    count(r.id) filter (
      where r.recorded_on >= current_date - 6
        and (
          r.appetite = '気になる'
          or r.activity = '気になる'
          or r.toilet = '気になる'
          or r.sleep = '気になる'
          or coalesce(r.behavior_intensity, 0) >= 7
        )
    ),
    (
      select m.body from public.wt_coach_messages m
      where m.dog_id = d.id order by m.created_at desc limit 1
    ),
    (
      select m.created_at from public.wt_coach_messages m
      where m.dog_id = d.id order by m.created_at desc limit 1
    )
  from public.wt_coach_assignments a
  join public.wt_dogs d on d.id = a.dog_id
  left join public.wt_daily_records r on r.dog_id = d.id
  where a.coach_id = auth.uid()
  group by a.id, a.owner_id, d.id, d.name, d.breed
  order by latest_message_at desc nulls last, d.name;
end;
$$;

revoke all on function public.wt_admin_customer_overview() from public;
grant execute on function public.wt_admin_customer_overview() to authenticated;

-- Promote a trusted account after it has signed up:
-- update public.wt_user_roles
-- set role = 'admin', updated_at = now()
-- where user_id = (select id from auth.users where email = 'coach@example.com');
