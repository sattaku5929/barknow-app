-- pg_net transport headers contain the private per-delivery capability.
-- Best-effort hardening where the migration role owns these tables.
-- Hosted Supabase owns them as supabase_admin and may preserve PUBLIC grants.
-- Required production boundary: net is NOT exposed by the Data API (verified PGRST106).
-- Never expose net in the Data API. Each capability authorizes only its own queued notification.
revoke all on net.http_request_queue, net._http_response from public, anon, authenticated;
