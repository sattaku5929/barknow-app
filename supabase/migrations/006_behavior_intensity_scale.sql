-- Support reusable owner-defined concerns and expand intensity to a 1-10 scale.
alter table public.wt_daily_records
  add column if not exists behavior_custom_texts text[];

update public.wt_daily_records
set behavior_custom_texts = array[behavior_custom_text]
where category = 'barking'
  and behavior_custom_text is not null
  and btrim(behavior_custom_text) <> ''
  and (behavior_custom_texts is null or cardinality(behavior_custom_texts) = 0);

-- Existing 1-3 values are mapped once to 3, 6 and 9, preserving relative meaning.
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
  drop constraint if exists wt_daily_records_behavior_intensity_check,
  drop constraint if exists wt_daily_records_behavior_types_check,
  drop constraint if exists wt_daily_records_behavior_custom_texts_check;

alter table public.wt_daily_records
  add constraint wt_daily_records_behavior_intensity_check
    check (behavior_intensity is null or behavior_intensity between 1 and 10),
  add constraint wt_daily_records_behavior_custom_texts_check
    check (
      behavior_custom_texts is null
      or (
        cardinality(behavior_custom_texts) between 1 and 3
        and array_position(behavior_custom_texts, '') is null
      )
    ),
  add constraint wt_daily_records_behavior_types_check
    check (
      (
        category = 'barking'
        and cardinality(behavior_types) between 1 and 3
        and behavior_types <@ array['barking', 'nipping', 'toilet_accident', 'jumping', 'pulling', 'other']::text[]
        and cardinality(array_remove(behavior_types, 'other'))
          + coalesce(cardinality(behavior_custom_texts), 0) between 1 and 3
        and (
          ('other' = any(behavior_types) and coalesce(cardinality(behavior_custom_texts), 0) > 0)
          or ('other' <> all(behavior_types) and behavior_custom_texts is null)
        )
      )
      or (
        category <> 'barking'
        and behavior_types is null
        and behavior_custom_texts is null
      )
    );

create index if not exists wt_daily_records_custom_behavior_idx
  on public.wt_daily_records(owner_id, recorded_on desc)
  where behavior_custom_texts is not null;

comment on column public.wt_daily_records.behavior_intensity is
  'Owner-reported concern intensity from 1 (low) to 10 (high).';

comment on column public.wt_daily_records.behavior_custom_texts is
  'Reusable owner-defined concern labels. Kept separately from standardized behavior types for aggregate analysis.';
