-- Only future non-anonymous registrations are queued. Existing members are not backfilled.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists wt_private;
revoke all on schema wt_private from public, anon, authenticated;

create table public.wt_signup_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  delivery_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  attempts integer not null default 0,
  claim_token uuid,
  claim_until timestamptz,
  sent_at timestamptz,
  last_error text
);
alter table public.wt_signup_notification_jobs enable row level security;
revoke all on public.wt_signup_notification_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.wt_signup_notification_jobs to service_role;
create policy "service manages signup notifications" on public.wt_signup_notification_jobs
  for all to service_role using (true) with check (true);

create function wt_private.dispatch_signup_notifications() returns void
language plpgsql security definer set search_path = '' as $$
declare job public.wt_signup_notification_jobs;
begin
  for job in select * from public.wt_signup_notification_jobs
    where sent_at is null and attempts < 10
      and (claim_until is null or claim_until < now())
      and (queued_at is null or queued_at < now() - interval '1 minute')
    order by created_at limit 25 for update skip locked
  loop
    begin
      perform net.http_post(
        url := 'https://barknow-app.vercel.app/api/signup-notification',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || job.delivery_token::text),
        body := jsonb_build_object('jobId',job.id), timeout_milliseconds := 15000);
      update public.wt_signup_notification_jobs set queued_at = now() where id = job.id;
    exception when others then
      update public.wt_signup_notification_jobs set last_error = 'webhook_enqueue_failed' where id = job.id;
    end;
  end loop;
end $$;
revoke all on function wt_private.dispatch_signup_notifications() from public, anon, authenticated, service_role;

create function wt_private.enqueue_signup_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and not coalesce(old.is_anonymous,false) then return new; end if;
  if not coalesce(new.is_anonymous,false) and nullif(btrim(new.email),'') is not null then
    insert into public.wt_signup_notification_jobs(user_id) values (new.id) on conflict (user_id) do nothing;
    perform wt_private.dispatch_signup_notifications();
  end if;
  return new;
exception when others then
  -- Notification infrastructure must never fail the user's registration transaction.
  raise warning 'Signup notification enqueue failed';
  return new;
end $$;
revoke all on function wt_private.enqueue_signup_notification() from public, anon, authenticated, service_role;
create trigger wt_enqueue_signup_notification after insert or update of is_anonymous, email on auth.users
for each row execute function wt_private.enqueue_signup_notification();

create function public.wt_claim_signup_notification(target_job_id uuid, target_delivery_token uuid)
returns table(id uuid, user_id uuid, created_at timestamptz, claim_token uuid)
language sql security invoker set search_path = '' as $$
  update public.wt_signup_notification_jobs j
  set claim_token = gen_random_uuid(), claim_until = now() + interval '2 minutes', attempts = attempts + 1
  where j.id = target_job_id and j.delivery_token = target_delivery_token and j.sent_at is null
    and j.attempts < 10 and (j.claim_until is null or j.claim_until < now())
  returning j.id, j.user_id, j.created_at, j.claim_token;
$$;
revoke all on function public.wt_claim_signup_notification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.wt_claim_signup_notification(uuid,uuid) to service_role;

select cron.schedule('wt-signup-notification-retry','* * * * *','select wt_private.dispatch_signup_notifications()');
