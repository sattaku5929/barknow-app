-- Track one owner app visit per Japan-local calendar day.
-- This is intentionally separate from observation/record activity so opening
-- WanTone can be celebrated even when the owner does not create a record.

create table if not exists public.wt_app_visits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  visited_on date not null default ((now() at time zone 'Asia/Tokyo')::date),
  created_at timestamptz not null default now(),
  primary key (owner_id, visited_on)
);

alter table public.wt_app_visits enable row level security;

create policy "Owners read own app visits"
  on public.wt_app_visits
  for select
  to authenticated
  using (owner_id = auth.uid());

create policy "Owners create own app visits"
  on public.wt_app_visits
  for insert
  to authenticated
  with check (owner_id = auth.uid());

grant select, insert on table public.wt_app_visits to authenticated;

create or replace function public.wt_mark_app_visit()
returns table (
  total_days integer,
  current_streak integer,
  first_visit date,
  last_visit date
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_owner_id uuid := auth.uid();
  today_jst date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if current_owner_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.wt_app_visits (owner_id, visited_on)
  values (current_owner_id, today_jst)
  on conflict (owner_id, visited_on) do nothing;

  return query
  with ranked as (
    select
      visits.visited_on,
      row_number() over (order by visits.visited_on desc) as rn
    from public.wt_app_visits visits
    where visits.owner_id = current_owner_id
  ),
  visit_stats as (
    select
      count(*)::integer as total_days,
      min(ranked.visited_on) as first_visit,
      max(ranked.visited_on) as last_visit
    from ranked
  ),
  streak_stats as (
    select
      count(*) filter (
        where ranked.visited_on + ((ranked.rn - 1)::integer) = today_jst
      )::integer as current_streak
    from ranked
  )
  select
    visit_stats.total_days,
    streak_stats.current_streak,
    visit_stats.first_visit,
    visit_stats.last_visit
  from visit_stats
  cross join streak_stats;
end;
$$;

grant execute on function public.wt_mark_app_visit() to authenticated;
