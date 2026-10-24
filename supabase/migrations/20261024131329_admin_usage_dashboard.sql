-- Read-only, Admin-scoped usage aggregate. No per-user data is returned.
create function public.wt_admin_usage_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Tokyo')::date;
  v_result jsonb;
begin
  if auth.uid() is null or not public.wt_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  with
  owners as (
    select user_id from public.wt_user_roles where role = 'owner'
  ),
  visits as (
    select distinct v.owner_id, v.visited_on
    from public.wt_app_visits v
    join owners o on o.user_id = v.owner_id
    where v.visited_on between v_today - 6 and v_today
  ),
  checks as (
    select distinct e.owner_id, e.local_date
    from public.wt_observation_entries e
    join public.wt_daily_checks c on c.entry_id = e.id
    join owners o on o.user_id = e.owner_id
    where e.entry_kind = 'daily_check'
      and e.deleted_at is null
      and e.local_date between v_today - 6 and v_today
  ),
  days as (
    select (v_today - n)::date as day
    from pg_catalog.generate_series(6, 0, -1) as n
  )
  select pg_catalog.jsonb_build_object(
    'as_of', v_today,
    'owner_count', (select count(*) from owners),
    'coach_count', (select count(*) from public.wt_user_roles where role = 'coach'),
    'admin_count', (select count(*) from public.wt_user_roles where role = 'admin'),
    'active_owners_7d', (select count(distinct owner_id) from visits),
    'daily_check_users_7d', (select count(distinct owner_id) from checks),
    'daily_check_days_7d', (select count(*) from checks),
    'coaching_applications_total', (select count(*) from public.wt_coaching_applications),
    'coaching_applications_7d', (
      select count(*) from public.wt_coaching_applications
      where (submitted_at at time zone 'Asia/Tokyo')::date between v_today - 6 and v_today
    ),
    'daily', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'date', d.day,
          'active_owners', (select count(*) from visits v where v.visited_on = d.day),
          'daily_check_users', (select count(*) from checks c where c.local_date = d.day)
        ) order by d.day
      ), '[]'::jsonb)
      from days d
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.wt_admin_usage_dashboard() from public, anon, authenticated;
grant execute on function public.wt_admin_usage_dashboard() to authenticated;
comment on function public.wt_admin_usage_dashboard() is
  'Admin-only aggregate of active Owner visits and Daily Check use over seven JST calendar days; excludes deleted entries.';
