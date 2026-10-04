-- Add precise event times and allow multiple entries for the same topic in one day.
alter table public.wt_daily_records
  add column if not exists recorded_time time,
  add column if not exists duration_minutes integer;

update public.wt_daily_records
set recorded_time = (created_at at time zone 'Asia/Tokyo')::time
where recorded_time is null;

alter table public.wt_daily_records
  alter column recorded_time set default ((now() at time zone 'Asia/Tokyo')::time),
  alter column recorded_time set not null;

alter table public.wt_daily_records
  drop constraint if exists wt_daily_records_dog_date_category_key;

create index if not exists wt_daily_records_timeline_idx
  on public.wt_daily_records(owner_id, recorded_on desc, recorded_time desc);

alter table public.wt_daily_records
  drop constraint if exists wt_daily_records_duration_minutes_check;

alter table public.wt_daily_records
  add constraint wt_daily_records_duration_minutes_check
  check (duration_minutes is null or duration_minutes between 1 and 600);
