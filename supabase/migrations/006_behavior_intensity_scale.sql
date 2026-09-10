-- Expand behavior intensity to a more intuitive 1-10 scale.
-- Existing 1-3 values are mapped to 3, 6 and 9 once, preserving their relative meaning.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wt_daily_records'::regclass
      and conname = 'wt_daily_records_behavior_intensity_check'
      and pg_get_constraintdef(oid) ilike '%between 1 and 3%'
  ) then
    update public.wt_daily_records
    set behavior_intensity = case behavior_intensity
      when 1 then 3
      when 2 then 6
      when 3 then 9
      else behavior_intensity
    end
    where behavior_intensity between 1 and 3;
  end if;
end
$$;

alter table public.wt_daily_records
  drop constraint if exists wt_daily_records_behavior_intensity_check;

alter table public.wt_daily_records
  add constraint wt_daily_records_behavior_intensity_check
    check (behavior_intensity is null or behavior_intensity between 1 and 10);

comment on column public.wt_daily_records.behavior_intensity is
  'Owner-reported concern intensity from 1 (low) to 10 (high).';

comment on column public.wt_daily_records.behavior_custom_text is
  'Owner-defined concern label; kept separately from standardized behavior types for safe aggregation.';
