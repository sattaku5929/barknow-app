-- Claim at most one visit celebration per owner and JST calendar day.
alter table public.wt_app_visits
  add column if not exists celebration_shown_at timestamptz;

create or replace function public.wt_claim_visit_celebration()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner uuid := auth.uid();
  today_jst date := (now() at time zone 'Asia/Tokyo')::date;
  streak integer;
  claimed integer;
begin
  if owner is null then raise exception 'Authentication required'; end if;
  -- Mark visit first, including when called independently of the stats RPC.
  insert into public.wt_app_visits(owner_id, visited_on)
  values(owner, today_jst)
  on conflict(owner_id, visited_on) do nothing;

  with ranked as (
    select visited_on, row_number() over(order by visited_on desc) rn
    from public.wt_app_visits where owner_id = owner
  )
  select count(*)::integer into streak from ranked
  where visited_on + (rn - 1)::integer = today_jst;

  if streak < 2 then return false; end if;
  update public.wt_app_visits
  set celebration_shown_at = now()
  where owner_id = owner and visited_on = today_jst
    and celebration_shown_at is null;
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

create policy "Owners update own app visit celebration"
  on public.wt_app_visits for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant update (celebration_shown_at) on public.wt_app_visits to authenticated;
grant execute on function public.wt_claim_visit_celebration() to authenticated;
revoke execute on function public.wt_claim_visit_celebration() from anon;
