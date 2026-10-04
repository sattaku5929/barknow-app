-- Security hardening for Supabase Security Advisor: rls_disabled_in_public.
--
-- Existing Wan Tone tables keep their current policies. Any unmanaged table in
-- the public schema is secured with deny-by-default behavior until an explicit
-- policy is added. Tables owned by PostgreSQL extensions are excluded because
-- their security model is managed by the extension itself.

do $$
declare
  target_table record;
begin
  for target_table in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity
      and not exists (
        select 1
        from pg_depend dependency
        join pg_extension ext on ext.oid = dependency.refobjid
        where dependency.classid = 'pg_class'::regclass
          and dependency.objid = relation.oid
          and dependency.deptype = 'e'
      )
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target_table.schema_name,
      target_table.table_name
    );
  end loop;
end
$$;

-- Fail closed if an application-owned public table could not be protected.
do $$
declare
  unprotected_tables text;
begin
  select string_agg(format('%I.%I', namespace.nspname, relation.relname), ', ' order by relation.relname)
  into unprotected_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and not relation.relrowsecurity
    and not exists (
      select 1
      from pg_depend dependency
      join pg_extension ext on ext.oid = dependency.refobjid
      where dependency.classid = 'pg_class'::regclass
        and dependency.objid = relation.oid
        and dependency.deptype = 'e'
    );

  if unprotected_tables is not null then
    raise exception 'RLS is still disabled on: %', unprotected_tables;
  end if;
end
$$;

-- Verification query for the Supabase SQL Editor. A successful migration
-- returns no rows here except extension-managed relations, which are excluded.
select namespace.nspname as schema_name,
       relation.relname as table_name,
       relation.relrowsecurity as rls_enabled
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p')
  and not relation.relrowsecurity
  and not exists (
    select 1
    from pg_depend dependency
    join pg_extension ext on ext.oid = dependency.refobjid
    where dependency.classid = 'pg_class'::regclass
      and dependency.objid = relation.oid
      and dependency.deptype = 'e'
  )
order by relation.relname;
