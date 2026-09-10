-- Allow up to three behavior labels on one recorded event.
alter table public.wt_daily_records
  add column if not exists behavior_types text[],
  add column if not exists behavior_custom_text text;

update public.wt_daily_records
set behavior_types = array[coalesce(behavior_type, 'barking')]
where category = 'barking'
  and (behavior_types is null or cardinality(behavior_types) = 0);

alter table public.wt_daily_records
  drop constraint if exists wt_daily_records_behavior_types_check,
  drop constraint if exists wt_daily_records_behavior_custom_text_check;

alter table public.wt_daily_records
  add constraint wt_daily_records_behavior_types_check
    check (
      (category = 'barking'
        and cardinality(behavior_types) between 1 and 3
        and behavior_types <@ array['barking', 'nipping', 'toilet_accident', 'jumping', 'pulling', 'other']::text[])
      or (category <> 'barking' and behavior_types is null)
    ),
  add constraint wt_daily_records_behavior_custom_text_check
    check (behavior_custom_text is null or char_length(behavior_custom_text) between 1 and 60);

create index if not exists wt_daily_records_behavior_types_gin_idx
  on public.wt_daily_records using gin(behavior_types);
