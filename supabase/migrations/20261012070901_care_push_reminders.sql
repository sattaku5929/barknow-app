-- Scheduled Web Push for care goals; existing goals/completions/RLS are unchanged.
-- Jobs are private capabilities, dispatched by pg_cron rather than browser timers.
create table public.wt_care_reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.wt_care_goals(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  reminder_on date not null,
  reminder_time time not null,
  scheduled_at timestamptz not null,
  title text not null,
  dog_name text not null,
  delivery_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  attempts integer not null default 0,
  claim_token uuid,
  claim_until timestamptz,
  finished_at timestamptz,
  delivery_status text check (delivery_status in ('sent','skipped','expired')),
  last_error text,
  unique(goal_id, reminder_on)
);
alter table public.wt_care_reminder_jobs enable row level security;
revoke all on public.wt_care_reminder_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.wt_care_reminder_jobs to service_role;
create policy "service manages care reminder jobs" on public.wt_care_reminder_jobs
  for all to service_role using (true) with check (true);
create index wt_care_reminder_jobs_pending_idx on public.wt_care_reminder_jobs(scheduled_at)
  where finished_at is null;

-- Match the existing owner UI's daily / Monday-based weekly / monthly progress.
create function wt_private.care_reminder_is_pending(target_goal_id uuid, target_day date)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.wt_care_goals g
    join public.wt_dogs d on d.id=g.dog_id and d.owner_id=g.owner_id
    where g.id=target_goal_id and g.active and g.reminder_time is not null
      and (select count(*) from public.wt_care_goal_completions c
        where c.goal_id=g.id and c.owner_id=g.owner_id and c.dog_id=g.dog_id
          and c.completed_on between
            case g.period when 'week' then date_trunc('week',target_day::timestamp)::date
              when 'month' then date_trunc('month',target_day::timestamp)::date else target_day end
            and target_day) < g.target_count
  );
$$;
revoke all on function wt_private.care_reminder_is_pending(uuid,date) from public, anon, authenticated;
grant usage on schema wt_private to service_role;
grant execute on function wt_private.care_reminder_is_pending(uuid,date) to service_role;

create function wt_private.dispatch_care_reminders() returns void
language plpgsql security invoker set search_path = '' as $$
declare local_day date := (now() at time zone 'Asia/Tokyo')::date;
        job public.wt_care_reminder_jobs;
begin
  insert into public.wt_care_reminder_jobs(goal_id,owner_id,dog_id,reminder_on,reminder_time,scheduled_at,title,dog_name)
    select g.id,g.owner_id,g.dog_id,local_day,g.reminder_time,
      (local_day+g.reminder_time) at time zone 'Asia/Tokyo',g.title,d.name
    from public.wt_care_goals g join public.wt_dogs d on d.id=g.dog_id and d.owner_id=g.owner_id
    join auth.users u on u.id=g.owner_id
    where g.active and g.reminder_time is not null and not coalesce(u.is_anonymous,false)
      and (local_day+g.reminder_time) at time zone 'Asia/Tokyo' <= now()
      and (local_day+g.reminder_time) at time zone 'Asia/Tokyo' > now()-interval '2 minutes'
      and wt_private.care_reminder_is_pending(g.id,local_day)
      and (exists(select 1 from public.push_subscriptions s where s.user_id=g.owner_id)
        or u.raw_user_meta_data->'push_subscription'->>'endpoint' is not null)
    on conflict(goal_id,reminder_on) do nothing;

  update public.wt_care_reminder_jobs j set finished_at=now(),delivery_status='expired'
    where j.finished_at is null and (j.claim_until is null or j.claim_until<now())
      and (j.scheduled_at<now()-interval '5 minutes' or j.attempts>=3);

  update public.wt_care_reminder_jobs j set finished_at=now(),delivery_status='skipped'
    where j.finished_at is null and (j.claim_until is null or j.claim_until<now())
      and (not wt_private.care_reminder_is_pending(j.goal_id,j.reminder_on)
        or not exists(select 1 from public.wt_care_goals g where g.id=j.goal_id
          and g.owner_id=j.owner_id and g.dog_id=j.dog_id and g.reminder_time=j.reminder_time));

  for job in select * from public.wt_care_reminder_jobs
    where finished_at is null and attempts<3
      and (claim_until is null or claim_until<now())
      and (queued_at is null or queued_at<now()-interval '55 seconds')
    order by scheduled_at limit 50 for update skip locked
  loop
    begin
      perform net.http_post(
        url := 'https://barknow-app.vercel.app/api/care/reminders',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || job.delivery_token::text),
        body := jsonb_build_object('jobId',job.id), timeout_milliseconds := 15000);
      update public.wt_care_reminder_jobs set queued_at=now() where id=job.id;
    exception when others then
      update public.wt_care_reminder_jobs set last_error='enqueue_failed' where id=job.id;
    end;
  end loop;
end $$;
revoke all on function wt_private.dispatch_care_reminders() from public, anon, authenticated, service_role;

create function public.wt_claim_care_reminder(target_job_id uuid,target_delivery_token uuid)
returns table(id uuid,goal_id uuid,owner_id uuid,dog_id uuid,reminder_on date,title text,dog_name text,claim_token uuid)
language sql security invoker set search_path = '' as $$
  update public.wt_care_reminder_jobs j
    set claim_token=gen_random_uuid(),claim_until=now()+interval '45 seconds',attempts=attempts+1
    where j.id=target_job_id and j.delivery_token=target_delivery_token
      and j.finished_at is null and j.attempts<3
      and (j.claim_until is null or j.claim_until<now())
      and j.scheduled_at between now()-interval '5 minutes' and now()
      and wt_private.care_reminder_is_pending(j.goal_id,j.reminder_on)
      and exists(select 1 from public.wt_care_goals g where g.id=j.goal_id
        and g.owner_id=j.owner_id and g.dog_id=j.dog_id and g.reminder_time=j.reminder_time)
    returning j.id,j.goal_id,j.owner_id,j.dog_id,j.reminder_on,j.title,j.dog_name,j.claim_token;
$$;
revoke all on function public.wt_claim_care_reminder(uuid,uuid) from public, anon, authenticated;
grant execute on function public.wt_claim_care_reminder(uuid,uuid) to service_role;

-- Enable after the matching Production API is deployed and verified.
select cron.schedule('wt-care-push-reminders','* * * * *','select wt_private.dispatch_care_reminders()');
select cron.alter_job((select jobid from cron.job where jobname='wt-care-push-reminders'),active:=false);
