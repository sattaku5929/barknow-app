-- Admin-only AAL2 enforcement. Apply only after all admins have enrolled TOTP.
-- Preflight: confirm auth MFA TOTP enabled, enumerate admins and factors, take schema snapshot.
-- This changes existing admin privilege predicates at the DB boundary, not only the UI.
create or replace function public.wt_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.jwt() ->> 'aal' = 'aal2'
    and exists (
      select 1 from public.wt_user_roles
      where user_id = auth.uid() and role = 'admin'
    );
$$;

-- Prevent admin's AAL1 token from falling through the broad staff predicate.
-- Coaches retain their existing role-based access.
create or replace function public.wt_is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wt_user_roles
    where user_id = auth.uid()
      and (role = 'coach' or (role = 'admin' and auth.jwt() ->> 'aal' = 'aal2'))
  );
$$;

-- Admin users must not inherit coach access without a coach role.
-- wt_is_coach remains unchanged.

-- NOTE: audit any policies/RPCs that use raw role queries or SECURITY DEFINER
-- without wt_is_admin/wt_is_staff before production application.
