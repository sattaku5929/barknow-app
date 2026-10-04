-- Keep existing seconds unchanged. Only normalize the original ten-point intensity
-- data when at least one event still contains a value above five.
begin;

do $$
begin
  if exists (select 1 from public.wt_observation_events where intensity > 5) then
    update public.wt_observation_events
       set intensity = (intensity + 1) / 2
     where intensity is not null;
  end if;
end;
$$;

alter table public.wt_observation_events
  drop constraint wt_observation_events_intensity_check;

alter table public.wt_observation_events
  add constraint wt_observation_events_intensity_check
    check (intensity is null or intensity between 1 and 5);

comment on column public.wt_observation_events.intensity is
  'Optional reaction intensity: 1=very weak, 2=weak, 3=moderate, 4=strong, 5=very strong.';

commit;
