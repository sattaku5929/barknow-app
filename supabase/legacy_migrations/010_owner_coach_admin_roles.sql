-- Separate customer, coach, and administrator permissions.
-- Run after 008_auth_roles_and_coach_assignments.sql and 009_admin_user_management.sql.

alter table public.wt_user_roles
  drop constraint if exists wt_user_roles_role_check;

alter table public.wt_user_roles
  add constraint wt_user_roles_role_check
  check (role in ('owner', 'coach', 'admin'));

create or replace function public.wt_is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wt_user_roles
    where user_id = auth.uid() and role = 'coach'
  );
$$;

create or replace function public.wt_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wt_user_roles
    where user_id = auth.uid() and role in ('coach', 'admin')
  );
$$;

revoke all on function public.wt_is_coach() from public;
revoke all on function public.wt_is_staff() from public;
grant execute on function public.wt_is_coach() to authenticated;
grant execute on function public.wt_is_staff() to authenticated;

drop policy if exists "coaches read assignments" on public.wt_coach_assignments;
drop policy if exists "staff read assignments" on public.wt_coach_assignments;
create policy "staff read assignments"
  on public.wt_coach_assignments for select to authenticated
  using (public.wt_is_admin() or (coach_id = auth.uid() and public.wt_is_coach()));

drop policy if exists "assigned coaches read dogs" on public.wt_dogs;
drop policy if exists "assigned staff read dogs" on public.wt_dogs;
create policy "assigned staff read dogs"
  on public.wt_dogs for select to authenticated
  using (
    public.wt_is_admin() or (
      public.wt_is_coach() and exists (
        select 1 from public.wt_coach_assignments a
        where a.coach_id = auth.uid() and a.dog_id = wt_dogs.id
      )
    )
  );

drop policy if exists "assigned coaches read records" on public.wt_daily_records;
drop policy if exists "assigned staff read records" on public.wt_daily_records;
create policy "assigned staff read records"
  on public.wt_daily_records for select to authenticated
  using (
    public.wt_is_admin() or (
      public.wt_is_coach() and exists (
        select 1 from public.wt_coach_assignments a
        where a.coach_id = auth.uid() and a.dog_id = wt_daily_records.dog_id
      )
    )
  );

drop policy if exists "assigned coaches read messages" on public.wt_coach_messages;
drop policy if exists "assigned staff read messages" on public.wt_coach_messages;
create policy "assigned staff read messages"
  on public.wt_coach_messages for select to authenticated
  using (
    public.wt_is_admin() or (
      public.wt_is_coach() and exists (
        select 1 from public.wt_coach_assignments a
        where a.coach_id = auth.uid() and a.dog_id = wt_coach_messages.dog_id
      )
    )
  );

drop policy if exists "assigned coaches reply" on public.wt_coach_messages;
drop policy if exists "assigned staff reply" on public.wt_coach_messages;
create policy "assigned staff reply"
  on public.wt_coach_messages for insert to authenticated
  with check (
    sender = 'coach' and (
      public.wt_is_admin() or (
        public.wt_is_coach() and exists (
          select 1 from public.wt_coach_assignments a
          where a.coach_id = auth.uid()
            and a.dog_id = wt_coach_messages.dog_id
            and a.owner_id = wt_coach_messages.owner_id
        )
      )
    )
  );

drop policy if exists "assigned coaches read care goals" on public.wt_care_goals;
drop policy if exists "assigned staff read care goals" on public.wt_care_goals;
create policy "assigned staff read care goals"
  on public.wt_care_goals for select to authenticated
  using (
    public.wt_is_admin() or (
      public.wt_is_coach() and exists (
        select 1 from public.wt_coach_assignments a
        where a.coach_id = auth.uid() and a.dog_id = wt_care_goals.dog_id
      )
    )
  );

drop policy if exists "assigned coaches read care completions" on public.wt_care_goal_completions;
drop policy if exists "assigned staff read care completions" on public.wt_care_goal_completions;
create policy "assigned staff read care completions"
  on public.wt_care_goal_completions for select to authenticated
  using (
    public.wt_is_admin() or (
      public.wt_is_coach() and exists (
        select 1 from public.wt_coach_assignments a
        where a.coach_id = auth.uid() and a.dog_id = wt_care_goal_completions.dog_id
      )
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
  if not public.wt_is_staff() then
    raise exception 'staff role required';
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
  where public.wt_is_admin() or a.coach_id = auth.uid()
  group by a.id, a.owner_id, d.id, d.name, d.breed
  order by 9 desc nulls last, d.name;
end;
$$;

revoke all on function public.wt_admin_customer_overview() from public;
grant execute on function public.wt_admin_customer_overview() to authenticated;

create or replace function public.wt_admin_set_role(target_user_id uuid, next_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if next_role not in ('owner', 'coach', 'admin') then
    raise exception 'invalid role';
  end if;
  if target_user_id = auth.uid() and next_role <> 'admin' then
    raise exception 'cannot remove your own admin role';
  end if;

  insert into public.wt_user_roles (user_id, role, updated_at)
  values (target_user_id, next_role, now())
  on conflict (user_id) do update
    set role = excluded.role, updated_at = now();

  if next_role <> 'owner' then
    delete from public.wt_coach_assignments where owner_id = target_user_id;
  end if;
  if next_role <> 'coach' then
    delete from public.wt_coach_assignments where coach_id = target_user_id;
  end if;
end;
$$;

revoke all on function public.wt_admin_set_role(uuid, text) from public;
grant execute on function public.wt_admin_set_role(uuid, text) to authenticated;

create or replace function public.wt_admin_assign_customer(target_owner_id uuid, target_dog_id uuid, target_coach_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if not exists (
    select 1 from public.wt_dogs d
    join public.wt_user_roles r on r.user_id = d.owner_id
    where d.id = target_dog_id and d.owner_id = target_owner_id and r.role = 'owner'
  ) then
    raise exception 'owner or dog not found';
  end if;
  if not exists (
    select 1 from public.wt_user_roles r
    where r.user_id = target_coach_id and r.role = 'coach'
  ) then
    raise exception 'coach role required';
  end if;

  delete from public.wt_coach_assignments where dog_id = target_dog_id;
  insert into public.wt_coach_assignments (coach_id, owner_id, dog_id)
  values (target_coach_id, target_owner_id, target_dog_id);
end;
$$;

revoke all on function public.wt_admin_assign_customer(uuid, uuid, uuid) from public;
grant execute on function public.wt_admin_assign_customer(uuid, uuid, uuid) to authenticated;

create or replace function public.wt_admin_remove_assignment(target_dog_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  delete from public.wt_coach_assignments where dog_id = target_dog_id;
end;
$$;

revoke all on function public.wt_admin_remove_assignment(uuid) from public;
grant execute on function public.wt_admin_remove_assignment(uuid) to authenticated;

-- Bootstrap the first administrator after the account has confirmed its email:
-- insert into public.wt_user_roles (user_id, role)
-- select id, 'admin' from auth.users where email = 'your-admin@example.com'
-- on conflict (user_id) do update set role = 'admin', updated_at = now();
