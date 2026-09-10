-- Add structured behavior details for progress reporting.
alter table public.wt_daily_records
  add column if not exists behavior_type text,
  add column if not exists behavior_intensity smallint;

update public.wt_daily_records
set behavior_type = 'barking'
where category = 'barking' and behavior_type is null;

alter table public.wt_daily_records
  drop constraint if exists wt_daily_records_behavior_type_check,
  drop constraint if exists wt_daily_records_behavior_intensity_check;

alter table public.wt_daily_records
  add constraint wt_daily_records_behavior_type_check
    check (
      (category = 'barking' and behavior_type in ('barking', 'nipping', 'toilet_accident', 'jumping', 'pulling', 'other'))
      or (category <> 'barking' and behavior_type is null)
    ),
  add constraint wt_daily_records_behavior_intensity_check
    check (behavior_intensity is null or behavior_intensity between 1 and 3);

create index if not exists wt_daily_records_behavior_report_idx
  on public.wt_daily_records(owner_id, behavior_type, recorded_on desc, recorded_time desc);
