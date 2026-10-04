-- Transactional cleanup used by the authenticated account-deletion route.
-- Storage objects are removed by the route before this function is called.

create or replace function public.wt_delete_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id is null then
    raise exception 'target user is required';
  end if;

  -- Sessions must be removed before availability slots because slot_id uses
  -- ON DELETE RESTRICT. Calendar jobs then disappear through their session FK,
  -- but the explicit coach cleanup also covers orphaned legacy rows.
  delete from public.wt_calendar_sync_jobs
  where coach_id = target_user_id
     or session_id in (
       select id from public.wt_online_sessions
       where owner_id = target_user_id or coach_id = target_user_id
     );

  delete from public.wt_online_sessions
  where owner_id = target_user_id or coach_id = target_user_id;

  delete from public.wt_coach_availability_slots
  where coach_id = target_user_id;

  delete from public.wt_notifications
  where user_id = target_user_id;

  delete from public.wt_coach_assignments
  where owner_id = target_user_id or coach_id = target_user_id;

  -- Keep an owner's application when their assigned coach leaves, but return it
  -- to the unassigned state so another coach can be selected.
  update public.wt_coaching_applications
  set assigned_coach_id = null,
      assigned_at = null,
      owner_confirmed_at = null,
      status = case when status = 'closed' then status else 'submitted' end,
      updated_at = now()
  where assigned_coach_id = target_user_id;

  delete from public.wt_coaching_applications
  where owner_id = target_user_id;

  update public.wt_coach_messages
  set media_url = null,
      media_key = null,
      media_type = null,
      media_name = null,
      media_size = null
  where media_key like 'chat/' || target_user_id::text || '/%'
    and owner_id <> target_user_id;

  delete from public.wt_coach_messages
  where owner_id = target_user_id;

  delete from public.wt_care_goal_completions
  where owner_id = target_user_id;

  delete from public.wt_care_goals
  where owner_id = target_user_id;

  delete from public.wt_daily_records
  where owner_id = target_user_id;

  delete from public.wt_dogs
  where owner_id = target_user_id;

  delete from public.wt_owner_profiles
  where user_id = target_user_id;

  delete from public.wt_google_oauth_states
  where coach_id = target_user_id;

  delete from public.wt_google_calendar_connections
  where coach_id = target_user_id;

  delete from public.wt_coach_profiles
  where coach_id = target_user_id;

  delete from public.push_subscriptions
  where user_id = target_user_id;

  delete from public.wt_user_roles
  where user_id = target_user_id;
end;
$$;

revoke all on function public.wt_delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.wt_delete_user_data(uuid) to service_role;
