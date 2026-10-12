-- A newly configured time on the same day is a new reminder slot.
-- Keep all previous delivery history and existing RLS.
alter table public.wt_care_reminder_jobs drop constraint wt_care_reminder_jobs_goal_id_reminder_on_key;
alter table public.wt_care_reminder_jobs add constraint wt_care_reminder_jobs_slot_key unique(goal_id,reminder_on,reminder_time);

create or replace function wt_private.dispatch_care_reminders() returns void
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
    on conflict(goal_id,reminder_on,reminder_time) do nothing;

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

