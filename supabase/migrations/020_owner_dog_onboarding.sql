-- Owner contact profile and detailed dog onboarding.
-- Run after 019_safe_availability_slot_crud.sql.

create table if not exists public.wt_owner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  phone_number text not null default '' check (char_length(phone_number) <= 30),
  address text not null default '' check (char_length(address) <= 300),
  owner_birth_date date,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wt_dogs
  add column if not exists is_first_time_owner boolean,
  add column if not exists birth_date date,
  add column if not exists gender text,
  add column if not exists daycare_frequency text not null default '',
  add column if not exists walk_frequency text not null default '',
  add column if not exists concerns text not null default '',
  add column if not exists profile_completed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wt_dogs_gender_check') then
    alter table public.wt_dogs add constraint wt_dogs_gender_check
      check (gender is null or gender in ('male_neutered', 'male_intact', 'female_spayed', 'female_intact', 'unknown'));
  end if;
end $$;

alter table public.wt_owner_profiles enable row level security;

drop policy if exists "owners manage own contact profile" on public.wt_owner_profiles;
create policy "owners manage own contact profile" on public.wt_owner_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "staff read assigned owner profiles" on public.wt_owner_profiles;
create policy "staff read assigned owner profiles" on public.wt_owner_profiles
  for select to authenticated
  using (
    public.wt_is_admin()
    or exists (
      select 1 from public.wt_coach_assignments assignment
      where assignment.owner_id = wt_owner_profiles.user_id
        and assignment.coach_id = auth.uid()
    )
  );

grant select, insert, update on public.wt_owner_profiles to authenticated;

create or replace function public.wt_owner_onboarding_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner', (
      select jsonb_build_object(
        'full_name', profile.full_name,
        'phone_number', profile.phone_number,
        'address', profile.address,
        'owner_birth_date', profile.owner_birth_date,
        'completed_at', profile.onboarding_completed_at
      )
      from public.wt_owner_profiles profile where profile.user_id = auth.uid()
    ),
    'dog', (
      select jsonb_build_object(
        'id', dog.id,
        'is_first_time_owner', dog.is_first_time_owner,
        'birth_date', coalesce(dog.birth_date, dog.birthday),
        'gender', dog.gender,
        'daycare_frequency', dog.daycare_frequency,
        'walk_frequency', dog.walk_frequency,
        'concerns', dog.concerns,
        'completed_at', dog.profile_completed_at
      )
      from public.wt_dogs dog where dog.owner_id = auth.uid() limit 1
    )
  );
$$;
revoke all on function public.wt_owner_onboarding_snapshot() from public;
grant execute on function public.wt_owner_onboarding_snapshot() to authenticated;

update public.wt_dogs set birth_date = birthday
where birth_date is null and birthday is not null;
