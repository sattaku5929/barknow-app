-- Harden Supabase default function privileges for paid coaching helpers.
-- SECURITY DEFINER functions in public may get direct grants to anon through
-- project defaults even after REVOKE FROM PUBLIC.
revoke execute on function public.wt_coaching_paid_enforcement_enabled() from anon, authenticated, public;
revoke execute on function public.wt_coaching_contract_ready(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.wt_gate_paid_online_session_insert() from anon, authenticated, public;
revoke execute on function public.wt_check_paid_activation_ready() from anon, authenticated, public;
revoke execute on function public.wt_coaching_write_allowed(uuid, uuid) from anon, public;

-- Only the application-side authenticated writer check requires direct RPC.
grant execute on function public.wt_coaching_write_allowed(uuid, uuid) to authenticated, service_role;
