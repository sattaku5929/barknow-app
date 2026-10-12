-- Preserve existing subscriptions and history; permit one subscription per device.
alter table public.push_subscriptions add column endpoint text
  generated always as (subscription->>'endpoint') stored;
alter table public.push_subscriptions alter column endpoint set not null;
alter table public.push_subscriptions drop constraint push_subscriptions_user_id_key;
alter table public.push_subscriptions add constraint push_subscriptions_user_endpoint_key unique(user_id,endpoint);

alter table public.wt_care_goals add column reminder_date date;
alter table public.wt_care_goals add constraint wt_care_goals_reminder_date_period_check
  check(reminder_date is null or period='week');

create or replace function wt_private.care_reminder_is_pending(target_goal_id uuid, target_day date)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.wt_care_goals g
    join public.wt_dogs d on d.id=g.dog_id and d.owner_id=g.owner_id
    where g.id=target_goal_id and g.active and g.reminder_time is not null
      and (g.reminder_date is null or g.reminder_date=target_day)
      and (select count(*) from public.wt_care_goal_completions c
        where c.goal_id=g.id and c.owner_id=g.owner_id and c.dog_id=g.dog_id
          and c.completed_on between
            case g.period when 'week' then date_trunc('week',target_day::timestamp)::date
              when 'month' then date_trunc('month',target_day::timestamp)::date else target_day end
            and target_day) < g.target_count
  );
$$;
revoke all on function wt_private.care_reminder_is_pending(uuid,date) from public,anon,authenticated;
grant execute on function wt_private.care_reminder_is_pending(uuid,date) to service_role;
