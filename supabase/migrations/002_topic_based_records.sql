-- Add topic-based records while preserving all existing daily records.
alter table public.wt_daily_records
  add column if not exists category text not null default 'daily';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wt_daily_records_category_check'
  ) then
    alter table public.wt_daily_records
      add constraint wt_daily_records_category_check
      check (category in ('daily', 'meal', 'barking', 'toilet', 'walk', 'sleep', 'win'));
  end if;
end $$;

alter table public.wt_daily_records
  drop constraint if exists wt_daily_records_dog_id_recorded_on_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wt_daily_records_dog_date_category_key'
  ) then
    alter table public.wt_daily_records
      add constraint wt_daily_records_dog_date_category_key
      unique (dog_id, recorded_on, category);
  end if;
end $$;

create index if not exists wt_daily_records_category_idx
  on public.wt_daily_records(owner_id, category, recorded_on desc);
