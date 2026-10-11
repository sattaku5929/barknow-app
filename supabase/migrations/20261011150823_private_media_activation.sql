-- Run after the signed-media reader and upload API are live in production.
create trigger wt_guard_chat_attachment before insert or update on public.wt_coach_messages
for each row execute function public.wt_guard_chat_attachment();
update storage.buckets set public=false where id='dog-avatars';
