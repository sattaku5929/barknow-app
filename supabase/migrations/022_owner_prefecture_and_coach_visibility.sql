-- Add structured owner location and expose assigned-owner context to staff.
-- Run after 021_r2_media_chat.sql.

alter table public.wt_owner_profiles
  add column if not exists prefecture text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wt_owner_profiles_prefecture_check') then
    alter table public.wt_owner_profiles add constraint wt_owner_profiles_prefecture_check
      check (prefecture = '' or prefecture in (
        '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
        '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
        '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
        '静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
        '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県',
        '徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
        '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
      ));
  end if;
end $$;

create or replace function public.wt_owner_onboarding_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner', (
      select jsonb_build_object(
        'full_name', profile.full_name,
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
    owner_profile.phone_number, owner_profile.prefecture, owner_profile.address,
    owner_profile.owner_birth_date, dog.id, dog.name, dog.breed
  order by 14 desc nulls last, dog.name;
end;
$$;

revoke all on function public.wt_admin_customer_overview() from public;
grant execute on function public.wt_admin_customer_overview() to authenticated;
