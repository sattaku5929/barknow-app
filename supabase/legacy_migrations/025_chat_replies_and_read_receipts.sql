alter table public.wt_coach_messages
  add column if not exists reply_to_message_id uuid references public.wt_coach_messages(id) on delete set null,
  add column if not exists reply_to_body text,
  add column if not exists reply_to_sender text,
  add column if not exists read_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wt_coach_messages_reply_to_sender_check'
      and conrelid = 'public.wt_coach_messages'::regclass
  ) then
    alter table public.wt_coach_messages
      add constraint wt_coach_messages_reply_to_sender_check
      check (reply_to_sender is null or reply_to_sender in ('owner', 'coach'));
  end if;
end
$$;

create index if not exists wt_coach_messages_unread_coach_idx
  on public.wt_coach_messages (owner_id, dog_id, created_at)
  where sender = 'coach' and read_at is null;

comment on column public.wt_coach_messages.reply_to_body is
  'Snapshot of the quoted message body so the reply remains understandable if the source changes.';

