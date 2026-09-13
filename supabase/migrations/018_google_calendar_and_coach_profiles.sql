-- Coach avatar storage, Google Calendar OAuth connections and durable sync queue.
-- Run after 017_online_session_booking.sql.

alter table public.wt_coach_profiles
  add column if not exists avatar_preset text not null default 'paw-green';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-avatars', 'coach-avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read coach avatars" on storage.objects;
create policy "public read coach avatars" on storage.objects for select to public
  using (bucket_id = 'coach-avatars');
drop policy if exists "coaches upload own avatar" on storage.objects;
create policy "coaches upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'coach-avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.wt_is_staff());
drop policy if exists "coaches update own avatar" on storage.objects;
create policy "coaches update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'coach-avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.wt_is_staff())
  with check (bucket_id = 'coach-avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.wt_is_staff());
drop policy if exists "coaches delete own avatar" on storage.objects;
create policy "coaches delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'coach-avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.wt_is_staff());

create table if not exists public.wt_google_calendar_connections (
  coach_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  calendar_id text not null default 'primary',
  encrypted_refresh_token text not null,
  token_iv text not null,
  token_tag text not null,
  scopes text[] not null default '{}',
  sync_status text not null default 'connected' check (sync_status in ('connected', 'error', 'revoked')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wt_google_oauth_states (
  state_hash text primary key,
  coach_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.wt_online_sessions
  add column if not exists google_event_id text,
  add column if not exists google_event_etag text,
  add column if not exists calendar_sync_status text not null default 'pending'
    check (calendar_sync_status in ('pending', 'syncing', 'synced', 'error', 'not_connected')),
  add column if not exists calendar_sync_error text;

create table if not exists public.wt_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.wt_online_sessions(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('upsert', 'cancel')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wt_calendar_sync_jobs_open_idx
  on public.wt_calendar_sync_jobs(session_id)
  where status in ('pending', 'processing');
create index if not exists wt_calendar_sync_jobs_due_idx
  on public.wt_calendar_sync_jobs(status, run_after);

alter table public.wt_google_calendar_connections enable row level security;
alter table public.wt_google_oauth_states enable row level security;
alter table public.wt_calendar_sync_jobs enable row level security;

-- Browser clients only receive connection metadata through server routes; tokens are never exposed.
revoke all on public.wt_google_calendar_connections from anon, authenticated;
revoke all on public.wt_google_oauth_states from anon, authenticated;
revoke all on public.wt_calendar_sync_jobs from anon, authenticated;

create or replace function public.wt_enqueue_calendar_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare requested_action text;
begin
  requested_action := case when new.status = 'cancelled' then 'cancel' else 'upsert' end;
  insert into public.wt_calendar_sync_jobs (session_id, coach_id, action)
  values (new.id, new.coach_id, requested_action)
  on conflict (session_id) where status in ('pending', 'processing')
  do update set action = excluded.action, status = 'pending', run_after = now(), updated_at = now();
  update public.wt_online_sessions
  set calendar_sync_status = 'pending', calendar_sync_error = null
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists wt_online_sessions_enqueue_calendar_sync on public.wt_online_sessions;
create trigger wt_online_sessions_enqueue_calendar_sync
after insert or update of starts_at, ends_at, status on public.wt_online_sessions
for each row execute function public.wt_enqueue_calendar_sync();

drop function if exists public.wt_staff_online_sessions();
create function public.wt_staff_online_sessions()
returns table (
  session_id uuid, owner_id uuid, owner_email text, owner_name text, dog_name text,
  coach_id uuid, coach_name text, session_type text, status text,
  starts_at timestamptz, ends_at timestamptz, meet_url text,
  calendar_sync_status text, calendar_sync_error text
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  return query
  select session.id, session.owner_id, coalesce(owner_user.email, '')::text,
    coalesce(owner_profile.display_name, owner_user.email, 'オーナー')::text,
    dog.name::text, session.coach_id,
    coalesce(coach_profile.display_name, coach_user.email, 'コーチ')::text,
    session.session_type::text, session.status::text, session.starts_at, session.ends_at,
    session.meet_url::text, session.calendar_sync_status::text, session.calendar_sync_error::text
  from public.wt_online_sessions session
  join auth.users owner_user on owner_user.id = session.owner_id
  join auth.users coach_user on coach_user.id = session.coach_id
  join public.wt_dogs dog on dog.id = session.dog_id
  left join public.wt_user_roles owner_profile on owner_profile.user_id = session.owner_id
  left join public.wt_coach_profiles coach_profile on coach_profile.coach_id = session.coach_id
  where public.wt_is_admin() or session.coach_id = auth.uid()
  order by session.starts_at;
end;
$$;
revoke all on function public.wt_staff_online_sessions() from public;
grant execute on function public.wt_staff_online_sessions() to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wt_calendar_sync_jobs') then
    alter publication supabase_realtime add table public.wt_calendar_sync_jobs;
  end if;
end $$;
