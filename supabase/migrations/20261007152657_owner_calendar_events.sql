-- Owner schedules are separate from observations: a plan is not a completed record.
create table public.wt_calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  dog_id uuid not null references public.wt_dogs(id) on delete cascade,
  category text not null check (category in ('travel','daycare','vaccination','event','appointment','birthday','other')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  start_date date not null,
  end_date date not null,
  start_time time without time zone,
  location text not null default '' check (char_length(location) <= 200),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 366)
);
create index wt_calendar_events_owner_dog_dates_idx on public.wt_calendar_events(owner_id,dog_id,start_date,end_date);
create index wt_calendar_events_dog_idx on public.wt_calendar_events(dog_id);
alter table public.wt_calendar_events enable row level security;
revoke all on public.wt_calendar_events from anon, authenticated;
grant select,insert,update,delete on public.wt_calendar_events to authenticated;
grant all on public.wt_calendar_events to service_role;
create policy wt_calendar_events_owner on public.wt_calendar_events for all to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.wt_dogs d where d.id = dog_id and d.owner_id = (select auth.uid())))
with check (owner_id = (select auth.uid()) and exists (select 1 from public.wt_dogs d where d.id = dog_id and d.owner_id = (select auth.uid())));
