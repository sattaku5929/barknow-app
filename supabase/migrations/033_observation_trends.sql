-- Phase 2A: explainable, fourteen-local-day observation aggregates.
-- Apply after 032_observation_event_log.sql. This does not touch wt_daily_records.
create index wt_observation_entries_dog_local_date_idx
  on public.wt_observation_entries(dog_id, local_date)
  where deleted_at is null;

create function public.wt_observation_trends(
  target_dog_id uuid,
  next_timezone text,
  as_of_local_date date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  anchor_date date;
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.wt_dogs dog
    where dog.id = target_dog_id and (
      dog.owner_id = auth.uid() or (
        public.wt_is_coach() and exists (
          select 1 from public.wt_coach_assignments assignment
          where assignment.dog_id = dog.id and assignment.coach_id = auth.uid()
        )
      )
    )
  ) then
    raise exception 'dog is not available to the current user' using errcode = '42501';
  end if;
  if next_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names zone where zone.name = next_timezone
  ) then
    raise exception 'invalid observation timezone' using errcode = '22023';
  end if;

  anchor_date := coalesce(as_of_local_date, (now() at time zone next_timezone)::date);
  with event_rows as (
    select case when entry.local_date >= anchor_date - 6 then 'current' else 'previous' end as period,
      entry.local_date, entry.theme_key, event_row.event_result,
      event_row.handled_by_member_id, event_row.distance_band,
      event_row.intensity, event_row.recovery_seconds
    from public.wt_observation_entries entry
    join public.wt_observation_events event_row on event_row.entry_id = entry.id
    where entry.dog_id = target_dog_id and entry.entry_kind = 'event'
      and entry.deleted_at is null
      and entry.local_date between anchor_date - 13 and anchor_date
  ),
  daily_rows as (
    select case when entry.local_date >= anchor_date - 6 then 'current' else 'previous' end as period,
      entry.local_date, daily.appetite_score, daily.sleep_rest_score,
      daily.activity_score, daily.exploration_score, daily.calmness_score, daily.toilet_score
    from public.wt_observation_entries entry
    join public.wt_daily_checks daily on daily.entry_id = entry.id
    where entry.dog_id = target_dog_id and entry.entry_kind = 'daily_check'
      and entry.deleted_at is null
      and entry.local_date between anchor_date - 13 and anchor_date
  ),
  overall_stats as (
    select period, count(*)::integer as total_count,
      count(*) filter (where event_result = 'success')::integer as success_count,
      count(*) filter (where event_result = 'neutral')::integer as neutral_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows group by period
  ),
  theme_stats as (
    select period, theme_key, count(*)::integer as total_count,
      count(*) filter (where event_result = 'success')::integer as success_count,
      count(*) filter (where event_result = 'neutral')::integer as neutral_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_result = 'success') / count(*), 1) as success_rate,
      round(100.0 * count(*) filter (where event_result = 'neutral') / count(*), 1) as neutral_rate,
      round(100.0 * count(*) filter (where event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows group by period, theme_key
  ),
  member_stats as (
    select event_row.period, event_row.theme_key, event_row.handled_by_member_id,
      member.display_name, (member.deleted_at is not null) as archived,
      count(*)::integer as total_count,
      count(*) filter (where event_row.event_result = 'success')::integer as success_count,
      count(*) filter (where event_row.event_result = 'neutral')::integer as neutral_count,
      count(*) filter (where event_row.event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_row.event_result = 'success') / count(*), 1) as success_rate,
      round(100.0 * count(*) filter (where event_row.event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows event_row
    join public.wt_household_members member on member.id = event_row.handled_by_member_id
    group by event_row.period, event_row.theme_key, event_row.handled_by_member_id,
      member.display_name, member.deleted_at
  ),
  distance_stats as (
    select period, theme_key, distance_band, count(*)::integer as total_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows where distance_band is not null
    group by period, theme_key, distance_band
  ),
  numeric_stats as (
    select period, theme_key,
      count(intensity)::integer as intensity_count,
      round(avg(intensity), 2) as intensity_avg,
      round((percentile_cont(0.5) within group (order by intensity)
        filter (where intensity is not null))::numeric, 2) as intensity_median,
      count(recovery_seconds)::integer as recovery_count,
      round(avg(recovery_seconds), 2) as recovery_avg_seconds,
      round((percentile_cont(0.5) within group (order by recovery_seconds)
        filter (where recovery_seconds is not null))::numeric, 2) as recovery_median_seconds
    from event_rows group by period, theme_key
  ),
  daily_values as (
    select daily.period, daily.local_date, score.metric_key, score.score
    from daily_rows daily
    cross join lateral (values
      ('appetite_score', daily.appetite_score),
      ('sleep_rest_score', daily.sleep_rest_score),
      ('activity_score', daily.activity_score),
      ('exploration_score', daily.exploration_score),
      ('calmness_score', daily.calmness_score),
      ('toilet_score', daily.toilet_score)
    ) as score(metric_key, score)
    where score.score is not null
  ),
  daily_stats as (
    select period, metric_key, count(distinct local_date)::integer as entered_days,
      round(avg(score), 2) as average_score,
      round((percentile_cont(0.5) within group (order by score))::numeric, 2) as median_score,
      min(score)::integer as minimum_score, max(score)::integer as maximum_score
    from daily_values group by period, metric_key
  ),
  day_events as (
    select local_date, count(*)::integer as event_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count
    from event_rows group by local_date
  ),
  day_links as (
    select day_date.local_date::date as local_date, daily.calmness_score,
      coalesce(events.event_count, 0) as event_count,
      coalesce(events.concern_count, 0) as concern_count
    from generate_series((anchor_date - 13)::timestamp, anchor_date::timestamp,
      interval '1 day') as day_date(local_date)
    left join daily_rows daily on daily.local_date = day_date.local_date::date
    left join day_events events on events.local_date = day_date.local_date::date
  )
  select jsonb_build_object(
    'as_of_local_date', anchor_date,
    'current_start', anchor_date - 6,
    'previous_start', anchor_date - 13,
    'previous_end', anchor_date - 7,
    'event_overall', coalesce((select jsonb_agg(to_jsonb(stat) order by period) from overall_stats stat), '[]'::jsonb),
    'event_themes', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key) from theme_stats stat), '[]'::jsonb),
    'handlers', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key, display_name, handled_by_member_id) from member_stats stat), '[]'::jsonb),
    'distances', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key, distance_band) from distance_stats stat), '[]'::jsonb),
    'numeric_metrics', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key) from numeric_stats stat), '[]'::jsonb),
    'daily_metrics', coalesce((select jsonb_agg(to_jsonb(stat) order by period, metric_key) from daily_stats stat), '[]'::jsonb),
    'daily_event_days', coalesce((select jsonb_agg(to_jsonb(stat) order by local_date) from day_links stat), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

comment on function public.wt_observation_trends(uuid, text, date) is
  'RLS-respecting current/previous seven-local-day observation aggregates; no causal conclusions.';
revoke all on function public.wt_observation_trends(uuid, text, date) from public, anon;
grant execute on function public.wt_observation_trends(uuid, text, date) to authenticated;
