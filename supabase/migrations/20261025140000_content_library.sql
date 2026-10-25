-- WanTone content library: private by default, service API controls access.
create table if not exists public.wt_content_items (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  author_label text not null default '',
  origin text not null check (origin in ('coach','admin')),
  format text not null check (format in ('video','image','article')),
  sharing text not null default 'private' check (sharing in ('private','coaches','team')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'その他' check (char_length(category) <= 60),
  tags text[] not null default '{}',
  article_body text not null default '' check (char_length(article_body) <= 12000),
  object_key text unique,
  mime_type text,
  byte_size bigint not null default 0 check (byte_size >= 0 and byte_size <= 31457280),
  duration_seconds integer check (duration_seconds between 1 and 180),
  archived_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wt_content_format_payload check (
    (format = 'article' and object_key is null and byte_size = 0 and char_length(btrim(article_body)) > 0)
    or (format in ('video','image') and object_key is not null and mime_type is not null and byte_size > 0)
  ),
  constraint wt_content_sharing_role check (
    (origin = 'admin' and sharing = 'team') or
    (origin = 'coach' and sharing in ('private','coaches'))
  )
);
create index if not exists wt_content_author_idx on public.wt_content_items(author_id, created_at desc);
create index if not exists wt_content_visible_idx on public.wt_content_items(sharing, format, category) where archived_at is null and blocked_at is null;
alter table public.wt_content_items enable row level security;
revoke all on public.wt_content_items from anon, authenticated;
grant all on public.wt_content_items to service_role;

alter table public.wt_coach_messages
  add column if not exists content_id uuid references public.wt_content_items(id) on delete set null;
create index if not exists wt_coach_messages_content_idx on public.wt_coach_messages(content_id)
  where content_id is not null;

-- A hostile browser must never attach an arbitrary private staff asset by
-- bypassing /api/chat/messages and inserting directly through PostgREST.
create or replace function public.wt_validate_content_chat_attachment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  asset public.wt_content_items%rowtype;
  actor_role text;
begin
  if tg_op = 'UPDATE' then
    if new.content_id is distinct from old.content_id then
      raise exception 'Chat content attachments cannot be changed';
    end if;
    return new;
  end if;
  if new.content_id is null then return new; end if;
  if auth.uid() is null or new.sender <> 'coach' then
    raise exception 'Only an authenticated coach can share saved content';
  end if;
  select role into actor_role from public.wt_user_roles where user_id = auth.uid();
  if actor_role not in ('coach','admin') then
    raise exception 'Only staff can share saved content';
  end if;
  select * into asset from public.wt_content_items where id = new.content_id;
  if not found or asset.archived_at is not null or asset.blocked_at is not null then
    raise exception 'Content not available';
  end if;
  if not (actor_role = 'admin' or asset.author_id = auth.uid() or asset.sharing in ('coaches','team')) then
    raise exception 'This content is not shared with this coach';
  end if;
  return new;
end; $$;
drop trigger if exists wt_validate_content_chat_attachment_trg on public.wt_coach_messages;
create trigger wt_validate_content_chat_attachment_trg
before insert or update on public.wt_coach_messages
for each row execute function public.wt_validate_content_chat_attachment();
revoke all on function public.wt_validate_content_chat_attachment() from public, anon, authenticated;
comment on table public.wt_content_items is
'Coach-owned private/shareable resources and admin-managed team resources. API uses service role after bearer/AAL authorization; archived rows remain readable to past recipients through signed API.';
