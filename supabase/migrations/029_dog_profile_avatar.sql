-- Owner-managed dog profile image.
-- Run after 028_enable_rls_on_public_tables.sql.

-- Some existing projects were created before the later onboarding columns were
-- introduced. Keep this migration re-runnable and compatible with those
-- projects before replacing the onboarding snapshot function below.
alter table public.wt_owner_profiles
  add column if not exists full_name_kana text not null default '',
  add column if not exists prefecture text not null default '';

alter table public.wt_dogs
  add column if not exists avatar_url text,
  add column if not exists is_first_time_owner boolean,
  add column if not exists birth_date date,
  add column if not exists gender text,
  add column if not exists training_experience text not null default '',
  add column if not exists daycare_frequency text not null default '',
  add column if not exists walk_frequency text not null default '',
  add column if not exists concerns text not null default '',
  add column if not exists profile_completed_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dog-avatars',
  'dog-avatars',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read dog avatars" on storage.objects;
create policy "public read dog avatars" on storage.objects for select to public
  using (bucket_id = 'dog-avatars');

drop policy if exists "owners upload own dog avatar" on storage.objects;
create policy "owners upload own dog avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'dog-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owners update own dog avatar" on storage.objects;
create policy "owners update own dog avatar" on storage.objects for update to authenticated
  using (bucket_id = 'dog-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'dog-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owners delete own dog avatar" on storage.objects;
create policy "owners delete own dog avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'dog-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

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
        'avatar_url', dog.avatar_url,
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
