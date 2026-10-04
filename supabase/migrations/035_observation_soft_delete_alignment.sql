-- Align Observation soft-delete security from a known old, partially-aligned,
-- or already-aligned state. This file is intentionally safe to re-run:
-- unexpected third states fail before permanent DDL is changed, and a final
-- postflight assertion runs before COMMIT.
begin;

create temporary table wt035_expected_policy (
  table_name text not null,
  policy_name text not null,
  polcmd "char" not null,
  old_using_md5 text not null,
  old_check_md5 text not null,
  final_using_md5 text not null,
  final_check_md5 text not null,
  optional_when_final boolean not null default false,
  allow_known_mixed boolean not null default false,
  primary key (table_name, policy_name)
) on commit drop;

insert into wt035_expected_policy
(table_name, policy_name, polcmd, old_using_md5, old_check_md5, final_using_md5, final_check_md5, optional_when_final, allow_known_mixed)
values
-- wt_observation_entries
('wt_observation_entries','owners select own observation entries','r','ba198383004b57209da3642439100224','d41d8cd98f00b204e9800998ecf8427e','bfe1b5f373523045ad45f75d0b612fad','d41d8cd98f00b204e9800998ecf8427e',false,false),
('wt_observation_entries','owners insert own observation entries','a','d41d8cd98f00b204e9800998ecf8427e','909d4158199ed321cdc00f4c11f4abe5','d41d8cd98f00b204e9800998ecf8427e','2e135b0faebca695179294f719ceb598',false,false),
('wt_observation_entries','owners update own observation entries','w','ba198383004b57209da3642439100224','ba198383004b57209da3642439100224','bfe1b5f373523045ad45f75d0b612fad','bfe1b5f373523045ad45f75d0b612fad',false,true),
('wt_observation_entries','owners delete own observation entries','d','ba198383004b57209da3642439100224','d41d8cd98f00b204e9800998ecf8427e','bfe1b5f373523045ad45f75d0b612fad','d41d8cd98f00b204e9800998ecf8427e',true,false),
('wt_observation_entries','assigned coaches read observation entries','r','e5feb1dcb23eb97c017b59c8656bbea0','d41d8cd98f00b204e9800998ecf8427e','40461eb23212f1e572cf7492132f1a99','d41d8cd98f00b204e9800998ecf8427e',false,false),
('wt_observation_entries','admins manage observation entries','*','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14',false,false),
-- wt_daily_checks
('wt_daily_checks','owners select own daily checks','r','f64bca5cdd1ec0605701b9b77e1c35d1','d41d8cd98f00b204e9800998ecf8427e','aafa672e1b33d60a62fd85d14306f68f','d41d8cd98f00b204e9800998ecf8427e',false,false),
('wt_daily_checks','owners insert own daily checks','a','d41d8cd98f00b204e9800998ecf8427e','f64bca5cdd1ec0605701b9b77e1c35d1','d41d8cd98f00b204e9800998ecf8427e','aafa672e1b33d60a62fd85d14306f68f',false,false),
('wt_daily_checks','owners update own daily checks','w','f64bca5cdd1ec0605701b9b77e1c35d1','f64bca5cdd1ec0605701b9b77e1c35d1','aafa672e1b33d60a62fd85d14306f68f','aafa672e1b33d60a62fd85d14306f68f',false,false),
('wt_daily_checks','owners delete own daily checks','d','f64bca5cdd1ec0605701b9b77e1c35d1','d41d8cd98f00b204e9800998ecf8427e','aafa672e1b33d60a62fd85d14306f68f','d41d8cd98f00b204e9800998ecf8427e',true,false),
('wt_daily_checks','assigned coaches read daily checks','r','9004bf683a85e110522bd26bf51f65af','d41d8cd98f00b204e9800998ecf8427e','9e42e4fa607e79da7627b0c5d5521dd3','d41d8cd98f00b204e9800998ecf8427e',false,false),
('wt_daily_checks','admins manage daily checks','*','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14',false,false),
-- wt_observation_events
('wt_observation_events','owners select own observation events','r','90475b7968b68116070eabebf9d6fcfb','d41d8cd98f00b204e9800998ecf8427e','79476ff2bb516bc3c2389ddae061fb21','d41d8cd98f00b204e9800998ecf8427e',false,false),
('wt_observation_events','owners insert own observation events','a','d41d8cd98f00b204e9800998ecf8427e','90475b7968b68116070eabebf9d6fcfb','d41d8cd98f00b204e9800998ecf8427e','79476ff2bb516bc3c2389ddae061fb21',false,false),
('wt_observation_events','owners update own observation events','w','90475b7968b68116070eabebf9d6fcfb','90475b7968b68116070eabebf9d6fcfb','79476ff2bb516bc3c2389ddae061fb21','79476ff2bb516bc3c2389ddae061fb21',false,false),
('wt_observation_events','owners delete own observation events','d','90475b7968b68116070eabebf9d6fcfb','d41d8cd98f00b204e9800998ecf8427e','79476ff2bb516bc3c2389ddae061fb21','d41d8cd98f00b204e9800998ecf8427e',true,false),
('wt_observation_events','assigned coaches read observation events','r','406a7e35b8cc549bb3a74f147a4b4e9e','d41d8cd98f00b204e9800998ecf8427e','5fa96d0d38ced0bb201cda550fb8c5e3','d41d8cd98f00b204e9800998ecf8427e',false,false),
('wt_observation_events','admins manage observation events','*','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14','65f35a8ea0784dba30cfbcec4fe47a14',false,false);

-- Strict preflight: only known old/final definitions, plus the single known
-- production partial state (entry UPDATE final USING + old WITH CHECK), pass.
do $$
declare
  table_state record;
  policy_state record;
  a record;
  subtype_count integer;
  subtype_src_md5 text;
  rpc_count integer;
  rpc_oid oid;
  rpc_comment text;
begin
  if current_user <> 'postgres' then
    raise exception '035 must be applied by postgres';
  end if;

  for table_state in
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events')
  loop
    if not table_state.relrowsecurity then raise exception 'RLS must be enabled on %', table_state.relname; end if;
    if table_state.relforcerowsecurity then raise exception 'Unexpected FORCE ROW LEVEL SECURITY on %', table_state.relname; end if;
  end loop;

  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events')) <> 3 then
    raise exception 'Observation table set is incomplete';
  end if;

  if exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid=p.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    left join wt035_expected_policy e on e.table_name=c.relname and e.policy_name=p.polname
    where n.nspname='public'
      and c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events')
      and e.policy_name is null
  ) then
    raise exception 'Unexpected Observation policy name detected';
  end if;

  for policy_state in select * from wt035_expected_policy order by table_name, policy_name loop
    select p.polcmd,
           p.polroles,
           md5(regexp_replace(lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'\s+','','g')) as using_md5,
           md5(regexp_replace(lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),'\s+','','g')) as check_md5
      into a
      from pg_policy p
      join pg_class c on c.oid=p.polrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname=policy_state.table_name and p.polname=policy_state.policy_name;

    if not found then
      if policy_state.optional_when_final then continue; end if;
      raise exception 'Missing required policy %.%', policy_state.table_name, policy_state.policy_name;
    end if;

    if a.polcmd <> policy_state.polcmd or a.polroles <> array['authenticated'::regrole::oid] then
      raise exception 'Unexpected command/roles for %.%', policy_state.table_name, policy_state.policy_name;
    end if;

    if not (
      (a.using_md5=policy_state.old_using_md5 and a.check_md5=policy_state.old_check_md5)
      or (a.using_md5=policy_state.final_using_md5 and a.check_md5=policy_state.final_check_md5)
      or (policy_state.allow_known_mixed and a.using_md5=policy_state.final_using_md5 and a.check_md5=policy_state.old_check_md5)
    ) then
      raise exception 'Unexpected policy definition for %.%', policy_state.table_name, policy_state.policy_name;
    end if;
  end loop;

  -- The old subtype body is the exact pre-fix definition from fc804243; the
  -- final body is the active-parent definition from 22bcc0ef/current 035.
  select count(*) into subtype_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='wt_validate_observation_subtype';
  if subtype_count <> 1 then raise exception 'Unexpected wt_validate_observation_subtype overload set'; end if;

  select md5(regexp_replace(lower(p.prosrc),'\s+','','g'))
    into subtype_src_md5
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang
   where n.nspname='public' and p.proname='wt_validate_observation_subtype'
     and pg_get_function_identity_arguments(p.oid)=''
     and pg_get_function_result(p.oid)='trigger'
     and l.lanname='plpgsql'
     and not p.prosecdef
     and r.rolname='postgres'
     and p.proconfig=array['search_path=public, pg_catalog'];
  if subtype_src_md5 not in ('b8410c9c13d0f2a8c8d7361653dba203','e3c2e0fee783fa7b3fbeb9257161dada') then
    raise exception 'Unexpected wt_validate_observation_subtype definition';
  end if;

  select count(*) into rpc_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='wt_owner_soft_delete_observation_entry';
  if rpc_count > 1 then raise exception 'Unexpected wt_owner_soft_delete_observation_entry overload set'; end if;

  if rpc_count = 1 then
    select p.oid into rpc_oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='wt_owner_soft_delete_observation_entry'
      and pg_get_function_identity_arguments(p.oid)='p_entry_id uuid'
      and pg_get_function_result(p.oid)='uuid'
      and p.prosecdef
      and p.proconfig=array['search_path=""']
      and md5(regexp_replace(lower(p.prosrc),'\s+','','g'))='76977a6fd2800e8015ce724c48c8f8fa'
      and (select r.rolname from pg_roles r where r.oid=p.proowner)='postgres'
      and (select l.lanname from pg_language l where l.oid=p.prolang)='plpgsql';
    if rpc_oid is null then raise exception 'Unexpected soft delete RPC definition'; end if;

    if has_function_privilege('public','public.wt_owner_soft_delete_observation_entry(uuid)','EXECUTE')
       or has_function_privilege('anon','public.wt_owner_soft_delete_observation_entry(uuid)','EXECUTE')
       or not has_function_privilege('authenticated','public.wt_owner_soft_delete_observation_entry(uuid)','EXECUTE') then
      raise exception 'Unexpected soft delete RPC EXECUTE grants';
    end if;

    if exists (
      select 1
      from aclexplode(coalesce((select proacl from pg_proc where oid=rpc_oid), acldefault('f',(select proowner from pg_proc where oid=rpc_oid)))) x
      left join pg_roles r on r.oid=x.grantee
      where x.privilege_type='EXECUTE'
        and coalesce(r.rolname,'PUBLIC') not in ('postgres','authenticated','service_role')
    ) then
      raise exception 'Unexpected soft delete RPC grantee';
    end if;

    rpc_comment := obj_description(rpc_oid,'pg_proc');
    if rpc_comment is not null and rpc_comment <> 'Owner-only soft delete for one active Observation entry. Missing, already-deleted, and non-owned UUIDs are intentionally indistinguishable.' then
      raise exception 'Unexpected soft delete RPC comment';
    end if;
  end if;
end;
$$;

-- Align subtype validation to active parents only.
create or replace function public.wt_validate_observation_subtype()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  expected_kind text := tg_argv[0];
begin
  if not exists (
    select 1 from public.wt_observation_entries entry
    where entry.id = new.entry_id
      and entry.entry_kind = expected_kind
      and entry.deleted_at is null
  ) then
    raise exception 'observation subtype requires an active entry_kind %', expected_kind
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Align owner/coach policies. Re-applying an already-final definition is safe;
-- unexpected third states have already been rejected above.
alter policy "owners select own observation entries" on public.wt_observation_entries
  using (deleted_at is null and owner_id=auth.uid() and exists (
    select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()));
alter policy "owners insert own observation entries" on public.wt_observation_entries
  with check (deleted_at is null and owner_id=auth.uid() and source='owner' and exists (
    select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()));
alter policy "owners update own observation entries" on public.wt_observation_entries
  using (deleted_at is null and owner_id=auth.uid() and exists (
    select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()))
  with check (deleted_at is null and owner_id=auth.uid() and exists (
    select 1 from public.wt_dogs dog where dog.id=wt_observation_entries.dog_id and dog.owner_id=auth.uid()));
drop policy if exists "owners delete own observation entries" on public.wt_observation_entries;
alter policy "assigned coaches read observation entries" on public.wt_observation_entries
  using (deleted_at is null and public.wt_is_coach() and exists (
    select 1 from public.wt_coach_assignments assignment
    where assignment.coach_id=auth.uid() and assignment.dog_id=wt_observation_entries.dog_id));

alter policy "owners select own daily checks" on public.wt_daily_checks
  using (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null));
alter policy "owners insert own daily checks" on public.wt_daily_checks
  with check (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null));
alter policy "owners update own daily checks" on public.wt_daily_checks
  using (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null))
  with check (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_daily_checks.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null));
drop policy if exists "owners delete own daily checks" on public.wt_daily_checks;
alter policy "assigned coaches read daily checks" on public.wt_daily_checks
  using (public.wt_is_coach() and exists (
    select 1 from public.wt_observation_entries entry join public.wt_coach_assignments assignment on assignment.dog_id=entry.dog_id
    where entry.id=wt_daily_checks.entry_id and assignment.coach_id=auth.uid() and entry.deleted_at is null));

alter policy "owners select own observation events" on public.wt_observation_events
  using (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null));
alter policy "owners insert own observation events" on public.wt_observation_events
  with check (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null));
alter policy "owners update own observation events" on public.wt_observation_events
  using (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null))
  with check (exists (select 1 from public.wt_observation_entries entry where entry.id=wt_observation_events.entry_id and entry.owner_id=auth.uid() and entry.deleted_at is null));
drop policy if exists "owners delete own observation events" on public.wt_observation_events;
alter policy "assigned coaches read observation events" on public.wt_observation_events
  using (public.wt_is_coach() and exists (
    select 1 from public.wt_observation_entries entry join public.wt_coach_assignments assignment on assignment.dog_id=entry.dog_id
    where entry.id=wt_observation_events.entry_id and assignment.coach_id=auth.uid() and entry.deleted_at is null));

-- Align the owner-only soft-delete RPC. Preflight allows only absence or the
-- exact final RPC; a wrong same-name function never reaches this point.
create or replace function public.wt_owner_soft_delete_observation_entry(p_entry_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  affected integer;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_entry_id is null then
    raise exception 'Observation entry not found or unavailable' using errcode = 'P0002';
  end if;
  update public.wt_observation_entries entry
  set deleted_at=pg_catalog.now()
  where entry.id=p_entry_id
    and entry.owner_id=caller_id
    and entry.deleted_at is null
    and exists (select 1 from public.wt_dogs dog where dog.id=entry.dog_id and dog.owner_id=caller_id);
  get diagnostics affected=row_count;
  if affected<>1 then
    raise exception 'Observation entry not found or unavailable' using errcode = 'P0002';
  end if;
  return p_entry_id;
end;
$$;
alter function public.wt_owner_soft_delete_observation_entry(uuid) owner to postgres;
revoke all on function public.wt_owner_soft_delete_observation_entry(uuid) from public, anon, authenticated;
grant execute on function public.wt_owner_soft_delete_observation_entry(uuid) to authenticated;
comment on function public.wt_owner_soft_delete_observation_entry(uuid) is
  'Owner-only soft delete for one active Observation entry. Missing, already-deleted, and non-owned UUIDs are intentionally indistinguishable.';

-- Final postflight inside the same transaction. Any mismatch rolls back all DDL.
do $$
declare e record; a record; rpc_oid oid;
begin
  for e in select * from wt035_expected_policy order by table_name,policy_name loop
    select p.polcmd,p.polroles,
      md5(regexp_replace(lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'')),'\s+','','g')) using_md5,
      md5(regexp_replace(lower(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')),'\s+','','g')) check_md5
      into a
    from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=e.table_name and p.polname=e.policy_name;
    if e.optional_when_final then
      if found then raise exception 'Owner DELETE policy still exists: %.%',e.table_name,e.policy_name; end if;
    else
      if not found or a.polcmd<>e.polcmd or a.polroles<>array['authenticated'::regrole::oid]
         or a.using_md5<>e.final_using_md5 or a.check_md5<>e.final_check_md5 then
        raise exception 'Final policy mismatch: %.%',e.table_name,e.policy_name;
      end if;
    end if;
  end loop;

  if exists (
    select 1 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    left join wt035_expected_policy e on e.table_name=c.relname and e.policy_name=p.polname
    where n.nspname='public' and c.relname in ('wt_observation_entries','wt_daily_checks','wt_observation_events') and e.policy_name is null
  ) then raise exception 'Unexpected final Observation policy'; end if;

  if (select md5(regexp_replace(lower(p.prosrc),'\s+','','g')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='wt_validate_observation_subtype' and pg_get_function_identity_arguments(p.oid)='')
     <> 'e3c2e0fee783fa7b3fbeb9257161dada' then
    raise exception 'Final subtype function mismatch';
  end if;

  select p.oid into rpc_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang
  where n.nspname='public' and p.proname='wt_owner_soft_delete_observation_entry'
    and pg_get_function_identity_arguments(p.oid)='p_entry_id uuid'
    and pg_get_function_result(p.oid)='uuid'
    and l.lanname='plpgsql' and p.prosecdef and r.rolname='postgres'
    and p.proconfig=array['search_path=""']
    and md5(regexp_replace(lower(p.prosrc),'\s+','','g'))='76977a6fd2800e8015ce724c48c8f8fa';
  if rpc_oid is null then raise exception 'Final soft delete RPC mismatch'; end if;
  if has_function_privilege('public','public.wt_owner_soft_delete_observation_entry(uuid)','EXECUTE')
     or has_function_privilege('anon','public.wt_owner_soft_delete_observation_entry(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.wt_owner_soft_delete_observation_entry(uuid)','EXECUTE') then
    raise exception 'Final soft delete RPC EXECUTE grants mismatch';
  end if;
  if obj_description(rpc_oid,'pg_proc') <> 'Owner-only soft delete for one active Observation entry. Missing, already-deleted, and non-owned UUIDs are intentionally indistinguishable.' then
    raise exception 'Final soft delete RPC comment mismatch';
  end if;
end;
$$;

commit;