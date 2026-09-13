-- Media attachments for the existing owner/coach conversation.
-- Run after 020_owner_dog_onboarding.sql.

alter table public.wt_coach_messages
  add column if not exists media_url text,
  add column if not exists media_key text,
  add column if not exists media_type text,
  add column if not exists media_name text,
  add column if not exists media_size bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wt_coach_messages_media_type_check') then
    alter table public.wt_coach_messages add constraint wt_coach_messages_media_type_check
      check (media_type is null or media_type in ('image', 'video'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wt_coach_messages_media_size_check') then
    alter table public.wt_coach_messages add constraint wt_coach_messages_media_size_check
      check (media_size is null or (media_size > 0 and media_size <= 52428800));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wt_coach_messages'
  ) then
    alter publication supabase_realtime add table public.wt_coach_messages;
  end if;
end $$;
