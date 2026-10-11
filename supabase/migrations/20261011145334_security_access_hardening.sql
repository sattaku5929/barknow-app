-- Reduce exposed privileges without changing staff/owner authorization semantics.
do $$
declare f record; had_authenticated boolean; had_service boolean;
begin
  for f in select p.oid,p.oid::regprocedure as signature,p.prorettype='trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'wt_%'
  loop
    had_authenticated := has_function_privilege('authenticated',f.oid,'execute');
    had_service := has_function_privilege('service_role',f.oid,'execute');
    execute format('revoke execute on function %s from public, anon',f.signature);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated',f.signature);
    elsif had_authenticated then
      execute format('grant execute on function %s to authenticated',f.signature);
    end if;
    if had_service then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  loop execute format('revoke all on table public.%I from public, anon',t.relname); end loop;
end $$;

-- Reject inconsistent owner/dog pairs even when clients call the Data API directly.
create function public.wt_guard_owned_dog_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.wt_dogs d where d.id=new.dog_id and d.owner_id=new.owner_id) then
    raise exception 'dog does not belong to owner' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.wt_guard_owned_dog_row() from public, anon, authenticated;
create trigger wt_guard_owned_dog_row before insert or update of owner_id,dog_id on public.wt_daily_records
for each row execute function public.wt_guard_owned_dog_row();
create trigger wt_guard_owned_dog_row before insert or update of owner_id,dog_id on public.wt_care_goals
for each row execute function public.wt_guard_owned_dog_row();
create trigger wt_guard_owned_dog_row before insert or update of owner_id,dog_id on public.wt_care_goal_completions
for each row execute function public.wt_guard_owned_dog_row();
create trigger wt_guard_owned_dog_row before insert or update of owner_id,dog_id on public.wt_coach_messages
for each row execute function public.wt_guard_owned_dog_row();

-- A guessed object key or a quote from another conversation must not become readable.
create function public.wt_guard_chat_attachment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is not null and new.media_key is not null and
     (tg_op='INSERT' or new.media_key is distinct from old.media_key or new.media_url is distinct from old.media_url) then
    if new.media_key !~ ('^chat/' || auth.uid()::text || '/[0-9]{4}-[0-9]{2}-[0-9]{2}/[a-zA-Z0-9._-]+$')
      or position('..' in new.media_key)>0
      or new.media_url is distinct from 'r2://' || new.media_key
      or new.media_type is null or new.media_type not in ('image','video') then
      raise exception 'invalid attachment' using errcode='23514';
    end if;
  end if;
  if new.media_url is not null and new.media_key is null then
    raise exception 'attachment key required' using errcode='23514';
  end if;
  if new.reply_to_message_id is not null and (tg_op='INSERT' or new.reply_to_message_id is distinct from old.reply_to_message_id) then
    if not exists (select 1 from public.wt_coach_messages m where m.id=new.reply_to_message_id
      and m.owner_id=new.owner_id and m.dog_id=new.dog_id) then
      raise exception 'reply must belong to conversation' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.wt_guard_chat_attachment() from public, anon, authenticated;
-- Enable this trigger only after the signed-media client is deployed (phase two).

-- First deploy signed avatar readers. Bucket privacy is switched after deployment.
drop policy "public read dog avatars" on storage.objects;
create policy "participants read dog avatars" on storage.objects for select to authenticated using (
  bucket_id='dog-avatars' and (
    (storage.foldername(name))[1]=auth.uid()::text or public.wt_is_admin() or
    (public.wt_is_coach() and exists(select 1 from public.wt_coach_assignments a
      where a.coach_id=auth.uid() and a.owner_id::text=(storage.foldername(name))[1]))
  )
);
