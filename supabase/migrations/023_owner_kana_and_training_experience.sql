-- Add owner furigana and dog training history while simplifying gender values.
-- Run after 022_owner_prefecture_and_coach_visibility.sql.

alter table public.wt_owner_profiles
  add column if not exists full_name_kana text not null default '';

alter table public.wt_dogs
  add column if not exists training_experience text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wt_owner_profiles_full_name_kana_check') then
    alter table public.wt_owner_profiles add constraint wt_owner_profiles_full_name_kana_check
      check (char_length(full_name_kana) <= 150);
  end if;
end $$;

-- Preserve existing records while removing neuter/spay details from the product model.
update public.wt_dogs set gender = 'male'
where gender in ('male_neutered', 'male_intact');

update public.wt_dogs set gender = 'female'
where gender in ('female_spayed', 'female_intact');

alter table public.wt_dogs drop constraint if exists wt_dogs_gender_check;
alter table public.wt_dogs add constraint wt_dogs_gender_check
  check (gender is null or gender in ('male', 'female', 'unknown'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wt_dogs_training_experience_check') then
    alter table public.wt_dogs add constraint wt_dogs_training_experience_check
      check (training_experience in ('', 'first_time', 'once', 'twice', 'three_or_more'));
  end if;
end $$;

create or replace function public.wt_owner_onboarding_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner', (
      select jsonb_build_object(
        'full_name', profile.full_name,
        'full_name_kana', profile.full_name_kana,
        'phone_number', profile.phone_number,
        'prefecture', profile.prefecture,
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
        'training_experience', dog.training_experience,
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

drop function if exists public.wt_admin_customer_overview();
create function public.wt_admin_customer_overview()
returns table (
  assignment_id uuid,
  owner_id uuid,
  owner_name text,
  owner_name_kana text,
  owner_phone_number text,
  owner_prefecture text,
  owner_address text,
  owner_birth_date date,
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
    assignment.id,
    assignment.owner_id,
    coalesce(owner_profile.full_name, '')::text,
    coalesce(owner_profile.full_name_kana, '')::text,
    coalesce(owner_profile.phone_number, '')::text,
    coalesce(owner_profile.prefecture, '')::text,
    coalesce(owner_profile.address, '')::text,
    owner_profile.owner_birth_date,
    dog.id,
    dog.name::text,
    coalesce(dog.breed, '')::text,
    count(record.id) filter (where record.recorded_on >= current_date - 6),
    count(record.id) filter (
      where record.recorded_on >= current_date - 6
        and (
          record.appetite = '気になる'
          or record.activity = '気になる'
          or record.toilet = '気になる'
          or record.sleep = '気になる'
          or coalesce(record.behavior_intensity, 0) >= 7
        )
    ),
    (
      select message.body from public.wt_coach_messages message
      where message.dog_id = dog.id order by message.created_at desc limit 1
    ),
    (
      select message.created_at from public.wt_coach_messages message
      where message.dog_id = dog.id order by message.created_at desc limit 1
    )
  from public.wt_coach_assignments assignment
  join public.wt_dogs dog on dog.id = assignment.dog_id
  left join public.wt_owner_profiles owner_profile on owner_profile.user_id = assignment.owner_id
  left join public.wt_daily_records record on record.dog_id = dog.id
  where (public.wt_is_admin() or assignment.coach_id = auth.uid())
    and not exists (
      select 1 from public.wt_coaching_applications application
      where application.dog_id = assignment.dog_id and application.status = 'offered'
    )
  group by assignment.id, assignment.owner_id, owner_profile.full_name,
    owner_profile.full_name_kana, owner_profile.phone_number, owner_profile.prefecture,
    owner_profile.address, owner_profile.owner_birth_date, dog.id, dog.name, dog.breed
  order by 15 desc nulls last, dog.name;
end;
$$;

revoke all on function public.wt_admin_customer_overview() from public;
grant execute on function public.wt_admin_customer_overview() to authenticated;
