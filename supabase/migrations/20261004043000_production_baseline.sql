


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."wt_admin_accounts"() RETURNS TABLE("user_id" "uuid", "email" "text", "display_name" "text", "role" "text", "dog_id" "uuid", "dog_name" "text", "assigned_coach_id" "uuid", "last_sign_in_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;

  return query
  select
    u.id,
    coalesce(u.email, '')::text,
    coalesce(r.display_name, '')::text,
    r.role::text,
    d.id,
    d.name::text,
    (
      select a.coach_id
      from public.wt_coach_assignments a
      where a.dog_id = d.id
      order by a.created_at
      limit 1
    ),
    u.last_sign_in_at,
    u.created_at
  from auth.users u
  join public.wt_user_roles r on r.user_id = u.id
  left join public.wt_dogs d on d.owner_id = u.id
  where u.email is not null
  order by (r.role = 'admin') desc, u.created_at;
end;
$$;


ALTER FUNCTION "public"."wt_admin_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_assign_coaching_application"("target_application_id" "uuid", "target_coach_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_owner_id uuid;
  target_dog_id uuid;
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;

  if not exists (
    select 1
    from public.wt_user_roles r
    where r.user_id = target_coach_id and r.role = 'coach'
  ) then
    raise exception 'selected user does not have coach role';
  end if;

  select application.owner_id, application.dog_id
  into target_owner_id, target_dog_id
  from public.wt_coaching_applications application
  where application.id = target_application_id
    and application.status <> 'closed'
  for update;

  if target_owner_id is null then
    raise exception 'coaching application not found or already closed';
  end if;

  if target_owner_id = target_coach_id then
    raise exception 'owner and coach must be different accounts';
  end if;

  delete from public.wt_coach_assignments assignment
  where assignment.dog_id = target_dog_id;

  insert into public.wt_coach_assignments (coach_id, owner_id, dog_id)
  values (target_coach_id, target_owner_id, target_dog_id);

  update public.wt_coaching_applications application
  set assigned_coach_id = target_coach_id,
      assigned_at = null,
      status = 'offered',
      updated_at = now()
  where application.id = target_application_id;
end;
$$;


ALTER FUNCTION "public"."wt_admin_assign_coaching_application"("target_application_id" "uuid", "target_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_assign_customer"("target_owner_id" "uuid", "target_dog_id" "uuid", "target_coach_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if not exists (
    select 1 from public.wt_dogs d
    join public.wt_user_roles r on r.user_id = d.owner_id
    where d.id = target_dog_id and d.owner_id = target_owner_id and r.role = 'owner'
  ) then
    raise exception 'owner or dog not found';
  end if;
  if not exists (
    select 1 from public.wt_user_roles r
    where r.user_id = target_coach_id and r.role = 'coach'
  ) then
    raise exception 'coach role required';
  end if;

  delete from public.wt_coach_assignments where dog_id = target_dog_id;
  insert into public.wt_coach_assignments (coach_id, owner_id, dog_id)
  values (target_coach_id, target_owner_id, target_dog_id);
end;
$$;


ALTER FUNCTION "public"."wt_admin_assign_customer"("target_owner_id" "uuid", "target_dog_id" "uuid", "target_coach_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_assign_to_me"("target_owner_id" "uuid", "target_dog_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if not exists (
    select 1 from public.wt_dogs d
    join public.wt_user_roles r on r.user_id = d.owner_id
    where d.id = target_dog_id and d.owner_id = target_owner_id and r.role = 'owner'
  ) then
    raise exception 'owner or dog not found';
  end if;
  if exists (
    select 1 from public.wt_coach_assignments a
    where a.dog_id = target_dog_id and a.coach_id <> auth.uid()
  ) then
    raise exception 'customer is already assigned';
  end if;

  insert into public.wt_coach_assignments (coach_id, owner_id, dog_id)
  values (auth.uid(), target_owner_id, target_dog_id)
  on conflict (coach_id, dog_id) do nothing;
end;
$$;


ALTER FUNCTION "public"."wt_admin_assign_to_me"("target_owner_id" "uuid", "target_dog_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_coaching_applications"() RETURNS TABLE("application_id" "uuid", "owner_id" "uuid", "dog_id" "uuid", "dog_name" "text", "owner_email" "text", "status" "text", "concern_categories" "text"[], "desired_outcome" "text", "note" "text", "assigned_coach_id" "uuid", "coach_email" "text", "submitted_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.wt_is_staff() then
    raise exception 'staff role required';
  end if;

  return query
  select
    a.id,
    a.owner_id,
    a.dog_id,
    d.name::text,
    coalesce(owner_user.email, '')::text,
    a.status::text,
    a.concern_categories,
    a.desired_outcome::text,
    a.note::text,
    a.assigned_coach_id,
    coach_user.email::text,
    a.submitted_at
  from public.wt_coaching_applications a
  join public.wt_dogs d on d.id = a.dog_id
  join auth.users owner_user on owner_user.id = a.owner_id
  left join auth.users coach_user on coach_user.id = a.assigned_coach_id
  where public.wt_is_admin() or a.assigned_coach_id = auth.uid()
  order by
    case a.status
      when 'submitted' then 1
      when 'offered' then 2
      when 'assigned' then 3
      when 'consulting' then 4
      when 'payment_pending' then 5
      when 'active' then 6
      else 7
    end,
    a.submitted_at desc;
end;
$$;


ALTER FUNCTION "public"."wt_admin_coaching_applications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_customer_overview"() RETURNS TABLE("assignment_id" "uuid", "owner_id" "uuid", "owner_name" "text", "owner_phone_number" "text", "owner_prefecture" "text", "owner_address" "text", "owner_birth_date" "date", "dog_id" "uuid", "dog_name" "text", "breed" "text", "records_7d" bigint, "concerns_7d" bigint, "latest_message" "text", "latest_message_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.wt_is_staff() then
    raise exception 'staff role required';
  end if;
  return query
  select
    assignment.id,
    assignment.owner_id,
    coalesce(owner_profile.full_name, '')::text,
    coalesce(owner_profile.phone_number, '')::text,
    coalesce(owner_profile.prefecture, '')::text,
    coalesce(owner_profile.address, '')::text,
    owner_profile.owner_birth_date,
    dog.id,
    dog.name::text,
    coalesce(dog.breed, '')::text,
    count(record.id) filter (where record.recorded_on >= current_date - 6),
    count(record.id) filter (
      where record.recorded_on >= current_date - 6
        and (
          record.appetite = '気になる'
          or record.activity = '気になる'
          or record.toilet = '気になる'
          or record.sleep = '気になる'
          or coalesce(record.behavior_intensity, 0) >= 7
        )
    ),
    (
      select message.body from public.wt_coach_messages message
      where message.dog_id = dog.id order by message.created_at desc limit 1
    ),
    (
      select message.created_at from public.wt_coach_messages message
      where message.dog_id = dog.id order by message.created_at desc limit 1
    )
  from public.wt_coach_assignments assignment
  join public.wt_dogs dog on dog.id = assignment.dog_id
  left join public.wt_owner_profiles owner_profile on owner_profile.user_id = assignment.owner_id
  left join public.wt_daily_records record on record.dog_id = dog.id
  where (public.wt_is_admin() or assignment.coach_id = auth.uid())
    and not exists (
      select 1 from public.wt_coaching_applications application
      where application.dog_id = assignment.dog_id and application.status = 'offered'
    )
  group by assignment.id, assignment.owner_id, owner_profile.full_name,
    owner_profile.phone_number, owner_profile.prefecture, owner_profile.address,
    owner_profile.owner_birth_date, dog.id, dog.name, dog.breed
  order by 14 desc nulls last, dog.name;
end;
$$;


ALTER FUNCTION "public"."wt_admin_customer_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_remove_assignment"("target_dog_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  delete from public.wt_coach_assignments where dog_id = target_dog_id;
end;
$$;


ALTER FUNCTION "public"."wt_admin_remove_assignment"("target_dog_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_set_display_name"("target_user_id" "uuid", "target_display_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  normalized_name text := btrim(target_display_name);
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 60 then
    raise exception 'display name must be between 1 and 60 characters';
  end if;

  update public.wt_user_roles
  set display_name = normalized_name,
      updated_at = now()
  where user_id = target_user_id;

  if not found then
    raise exception 'user not found';
  end if;
end;
$$;


ALTER FUNCTION "public"."wt_admin_set_display_name"("target_user_id" "uuid", "target_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_set_role"("target_user_id" "uuid", "next_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if next_role not in ('owner', 'coach', 'admin') then
    raise exception 'invalid role';
  end if;
  if target_user_id = auth.uid() and next_role <> 'admin' then
    raise exception 'cannot remove your own admin role';
  end if;

  insert into public.wt_user_roles (user_id, role, updated_at)
  values (target_user_id, next_role, now())
  on conflict (user_id) do update
    set role = excluded.role, updated_at = now();

  if next_role <> 'owner' then
    delete from public.wt_coach_assignments where owner_id = target_user_id;
  end if;
  if next_role <> 'coach' then
    delete from public.wt_coach_assignments where coach_id = target_user_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."wt_admin_set_role"("target_user_id" "uuid", "next_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_admin_update_coaching_status"("target_application_id" "uuid", "next_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_status text;
begin
  if not public.wt_is_admin() then
    raise exception 'admin role required';
  end if;
  if next_status not in ('submitted', 'consulting', 'payment_pending', 'active', 'closed') then
    raise exception 'coach acceptance required';
  end if;

  select status into current_status
  from public.wt_coaching_applications
  where id = target_application_id;

  if current_status is null then
    raise exception 'application not found';
  end if;
  if next_status in ('consulting', 'payment_pending', 'active')
    and current_status not in ('assigned', 'consulting', 'payment_pending', 'active') then
    raise exception 'coach acceptance required';
  end if;

  update public.wt_coaching_applications
  set status = next_status, updated_at = now()
  where id = target_application_id;

  if next_status = 'closed' then
    delete from public.wt_coach_assignments
    where dog_id = (
      select dog_id from public.wt_coaching_applications
      where id = target_application_id
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."wt_admin_update_coaching_status"("target_application_id" "uuid", "next_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_book_online_session"("target_application_id" "uuid", "target_slot_id" "uuid", "requested_session_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  application_row public.wt_coaching_applications%rowtype;
  slot_row public.wt_coach_availability_slots%rowtype;
  new_session_id uuid;
  stored_meet_url text;
begin
  if requested_session_type not in ('initial', 'followup') then raise exception 'invalid session type'; end if;
  select * into application_row from public.wt_coaching_applications
  where id = target_application_id and owner_id = auth.uid() for update;
  if application_row.id is null or application_row.owner_confirmed_at is null then
    raise exception '担当コーチの確定が必要です';
  end if;
  if requested_session_type = 'initial' and exists (
    select 1 from public.wt_online_sessions
    where application_id = target_application_id and session_type = 'initial' and status <> 'cancelled'
  ) then raise exception '初回オンライン診断は予約済みです'; end if;

  select * into slot_row from public.wt_coach_availability_slots
  where id = target_slot_id and active for update;
  if slot_row.id is null or slot_row.starts_at <= now() then raise exception 'この枠は利用できません'; end if;
  if slot_row.coach_id <> application_row.assigned_coach_id then raise exception '担当コーチの枠ではありません'; end if;
  if exists (select 1 from public.wt_online_sessions where slot_id = target_slot_id and status <> 'cancelled') then
    raise exception 'この枠は直前に予約されました';
  end if;

  select meet_url into stored_meet_url from public.wt_coach_profiles where coach_id = slot_row.coach_id;
  insert into public.wt_online_sessions (
    slot_id, application_id, owner_id, dog_id, coach_id, session_type,
    starts_at, ends_at, meet_url
  ) values (
    slot_row.id, application_row.id, application_row.owner_id, application_row.dog_id,
    slot_row.coach_id, requested_session_type, slot_row.starts_at, slot_row.ends_at, stored_meet_url
  ) returning id into new_session_id;

  insert into public.wt_notifications (user_id, notification_type, title, body)
  values
    (application_row.owner_id, 'session_booked', 'オンライン診断を予約しました', to_char(slot_row.starts_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI')),
    (slot_row.coach_id, 'session_booked', 'オンライン診断の予約が入りました', to_char(slot_row.starts_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI'));
  return new_session_id;
exception when unique_violation then
  raise exception 'この枠は直前に予約されました';
end;
$$;


ALTER FUNCTION "public"."wt_book_online_session"("target_application_id" "uuid", "target_slot_id" "uuid", "requested_session_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_coach_accept_application"("target_application_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_owner_id uuid;
  target_dog_id uuid;
begin
  if not public.wt_is_coach() then
    raise exception 'coach role required';
  end if;

  select owner_id, dog_id
  into target_owner_id, target_dog_id
  from public.wt_coaching_applications
  where id = target_application_id
    and assigned_coach_id = auth.uid()
    and status = 'offered'
  for update;

  if target_owner_id is null then
    raise exception 'offer not found';
  end if;

  update public.wt_coaching_applications
  set status = 'assigned', assigned_at = now(), updated_at = now()
  where id = target_application_id;

  insert into public.wt_coach_messages (owner_id, dog_id, sender, body)
  values (
    target_owner_id,
    target_dog_id,
    'coach',
    '担当コーチが決まりました。これまでの記録を見ながら、まずは今いちばん気になることから一緒に整理していきましょう。'
  );
end;
$$;


ALTER FUNCTION "public"."wt_coach_accept_application"("target_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_coach_assignment_notification_details"("target_application_id" "uuid") RETURNS TABLE("owner_email" "text", "dog_name" "text", "coach_email" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.wt_is_coach() then
    raise exception 'coach role required';
  end if;

  return query
  select
    coalesce(owner_user.email, ''),
    d.name,
    coalesce(coach_user.email, '')
  from public.wt_coaching_applications a
  join public.wt_dogs d on d.id = a.dog_id
  join auth.users owner_user on owner_user.id = a.owner_id
  join auth.users coach_user on coach_user.id = a.assigned_coach_id
  where a.id = target_application_id
    and a.assigned_coach_id = auth.uid()
    and a.status in ('assigned', 'consulting', 'payment_pending', 'active');
end;
$$;


ALTER FUNCTION "public"."wt_coach_assignment_notification_details"("target_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_coach_decline_application"("target_application_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_dog_id uuid;
begin
  if not public.wt_is_coach() then
    raise exception 'coach role required';
  end if;

  select dog_id into target_dog_id
  from public.wt_coaching_applications
  where id = target_application_id
    and assigned_coach_id = auth.uid()
    and status = 'offered'
  for update;

  if target_dog_id is null then
    raise exception 'offer not found';
  end if;

  update public.wt_coaching_applications
  set status = 'submitted',
      assigned_coach_id = null,
      assigned_at = null,
      updated_at = now()
  where id = target_application_id;

  delete from public.wt_coach_assignments
  where dog_id = target_dog_id and coach_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."wt_coach_decline_application"("target_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_create_default_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.wt_user_roles (user_id, role)
  values (new.id, 'owner')
  on conflict (user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."wt_create_default_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_delete_user_data"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."wt_delete_user_data"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_enqueue_calendar_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare requested_action text;
begin
  requested_action := case when new.status = 'cancelled' then 'cancel' else 'upsert' end;
  insert into public.wt_calendar_sync_jobs (session_id, coach_id, action)
  values (new.id, new.coach_id, requested_action)
  on conflict (session_id) where status in ('pending', 'processing')
  do update set action = excluded.action, status = 'pending', run_after = now(), updated_at = now();
  update public.wt_online_sessions
  set calendar_sync_status = 'pending', calendar_sync_error = null
  where id = new.id;
  return new;
end;
$$;


ALTER FUNCTION "public"."wt_enqueue_calendar_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_guard_event_handler"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  if new.handled_by_member_id is not null and not exists (
    select 1 from public.wt_household_members member
    join public.wt_observation_entries entry on entry.owner_id = member.owner_id
    where member.id = new.handled_by_member_id and entry.id = new.entry_id
  ) then
    raise exception 'handler does not belong to observation owner' using errcode = '23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."wt_guard_event_handler"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_guard_household_member"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'household owner cannot change' using errcode = '23514';
  end if;
  new.display_name := btrim(new.display_name);
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."wt_guard_household_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.wt_user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."wt_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_is_coach"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.wt_user_roles
    where user_id = auth.uid() and role = 'coach'
  );
$$;


ALTER FUNCTION "public"."wt_is_coach"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.wt_user_roles
    where user_id = auth.uid() and role in ('coach', 'admin')
  );
$$;


ALTER FUNCTION "public"."wt_is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_observation_trends"("target_dog_id" "uuid", "next_timezone" "text", "as_of_local_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
declare
  anchor_date date;
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.wt_dogs dog
    where dog.id = target_dog_id and (
      dog.owner_id = auth.uid() or (
        public.wt_is_coach() and exists (
          select 1 from public.wt_coach_assignments assignment
          where assignment.dog_id = dog.id and assignment.coach_id = auth.uid()
        )
      )
    )
  ) then
    raise exception 'dog is not available to the current user' using errcode = '42501';
  end if;
  if next_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names zone where zone.name = next_timezone
  ) then
    raise exception 'invalid observation timezone' using errcode = '22023';
  end if;

  anchor_date := coalesce(as_of_local_date, (now() at time zone next_timezone)::date);
  with event_rows as (
    select case when entry.local_date >= anchor_date - 6 then 'current' else 'previous' end as period,
      entry.local_date, entry.theme_key, event_row.event_result,
      event_row.handled_by_member_id, event_row.distance_band,
      event_row.intensity, event_row.recovery_seconds
    from public.wt_observation_entries entry
    join public.wt_observation_events event_row on event_row.entry_id = entry.id
    where entry.dog_id = target_dog_id and entry.entry_kind = 'event'
      and entry.deleted_at is null
      and entry.local_date between anchor_date - 13 and anchor_date
  ),
  daily_rows as (
    select case when entry.local_date >= anchor_date - 6 then 'current' else 'previous' end as period,
      entry.local_date, daily.appetite_score, daily.sleep_rest_score,
      daily.activity_score, daily.exploration_score, daily.calmness_score, daily.toilet_score
    from public.wt_observation_entries entry
    join public.wt_daily_checks daily on daily.entry_id = entry.id
    where entry.dog_id = target_dog_id and entry.entry_kind = 'daily_check'
      and entry.deleted_at is null
      and entry.local_date between anchor_date - 13 and anchor_date
  ),
  overall_stats as (
    select period, count(*)::integer as total_count,
      count(*) filter (where event_result = 'success')::integer as success_count,
      count(*) filter (where event_result = 'neutral')::integer as neutral_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows group by period
  ),
  theme_stats as (
    select period, theme_key, count(*)::integer as total_count,
      count(*) filter (where event_result = 'success')::integer as success_count,
      count(*) filter (where event_result = 'neutral')::integer as neutral_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_result = 'success') / count(*), 1) as success_rate,
      round(100.0 * count(*) filter (where event_result = 'neutral') / count(*), 1) as neutral_rate,
      round(100.0 * count(*) filter (where event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows group by period, theme_key
  ),
  member_stats as (
    select event_row.period, event_row.theme_key, event_row.handled_by_member_id,
      member.display_name, (member.deleted_at is not null) as archived,
      count(*)::integer as total_count,
      count(*) filter (where event_row.event_result = 'success')::integer as success_count,
      count(*) filter (where event_row.event_result = 'neutral')::integer as neutral_count,
      count(*) filter (where event_row.event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_row.event_result = 'success') / count(*), 1) as success_rate,
      round(100.0 * count(*) filter (where event_row.event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows event_row
    join public.wt_household_members member on member.id = event_row.handled_by_member_id
    group by event_row.period, event_row.theme_key, event_row.handled_by_member_id,
      member.display_name, member.deleted_at
  ),
  distance_stats as (
    select period, theme_key, distance_band, count(*)::integer as total_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count,
      round(100.0 * count(*) filter (where event_result = 'concern') / count(*), 1) as concern_rate
    from event_rows where distance_band is not null
    group by period, theme_key, distance_band
  ),
  numeric_stats as (
    select period, theme_key,
      count(intensity)::integer as intensity_count,
      round(avg(intensity), 2) as intensity_avg,
      round((percentile_cont(0.5) within group (order by intensity)
        filter (where intensity is not null))::numeric, 2) as intensity_median,
      count(recovery_seconds)::integer as recovery_count,
      round(avg(recovery_seconds), 2) as recovery_avg_seconds,
      round((percentile_cont(0.5) within group (order by recovery_seconds)
        filter (where recovery_seconds is not null))::numeric, 2) as recovery_median_seconds
    from event_rows group by period, theme_key
  ),
  daily_values as (
    select daily.period, daily.local_date, score.metric_key, score.score
    from daily_rows daily
    cross join lateral (values
      ('appetite_score', daily.appetite_score),
      ('sleep_rest_score', daily.sleep_rest_score),
      ('activity_score', daily.activity_score),
      ('exploration_score', daily.exploration_score),
      ('calmness_score', daily.calmness_score),
      ('toilet_score', daily.toilet_score)
    ) as score(metric_key, score)
    where score.score is not null
  ),
  daily_stats as (
    select period, metric_key, count(distinct local_date)::integer as entered_days,
      round(avg(score), 2) as average_score,
      round((percentile_cont(0.5) within group (order by score))::numeric, 2) as median_score,
      min(score)::integer as minimum_score, max(score)::integer as maximum_score
    from daily_values group by period, metric_key
  ),
  day_events as (
    select local_date, count(*)::integer as event_count,
      count(*) filter (where event_result = 'concern')::integer as concern_count
    from event_rows group by local_date
  ),
  day_links as (
    select day_date.local_date::date as local_date, daily.calmness_score,
      coalesce(events.event_count, 0) as event_count,
      coalesce(events.concern_count, 0) as concern_count
    from generate_series((anchor_date - 13)::timestamp, anchor_date::timestamp,
      interval '1 day') as day_date(local_date)
    left join daily_rows daily on daily.local_date = day_date.local_date::date
    left join day_events events on events.local_date = day_date.local_date::date
  )
  select jsonb_build_object(
    'as_of_local_date', anchor_date,
    'current_start', anchor_date - 6,
    'previous_start', anchor_date - 13,
    'previous_end', anchor_date - 7,
    'event_overall', coalesce((select jsonb_agg(to_jsonb(stat) order by period) from overall_stats stat), '[]'::jsonb),
    'event_themes', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key) from theme_stats stat), '[]'::jsonb),
    'handlers', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key, display_name, handled_by_member_id) from member_stats stat), '[]'::jsonb),
    'distances', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key, distance_band) from distance_stats stat), '[]'::jsonb),
    'numeric_metrics', coalesce((select jsonb_agg(to_jsonb(stat) order by period, theme_key) from numeric_stats stat), '[]'::jsonb),
    'daily_metrics', coalesce((select jsonb_agg(to_jsonb(stat) order by period, metric_key) from daily_stats stat), '[]'::jsonb),
    'daily_event_days', coalesce((select jsonb_agg(to_jsonb(stat) order by local_date) from day_links stat), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."wt_observation_trends"("target_dog_id" "uuid", "next_timezone" "text", "as_of_local_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."wt_observation_trends"("target_dog_id" "uuid", "next_timezone" "text", "as_of_local_date" "date") IS 'RLS-respecting current/previous seven-local-day observation aggregates; no causal conclusions.';



CREATE OR REPLACE FUNCTION "public"."wt_owner_available_slots"("target_application_id" "uuid") RETURNS TABLE("slot_id" "uuid", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare target_coach_id uuid;
begin
  select assigned_coach_id into target_coach_id
  from public.wt_coaching_applications
  where id = target_application_id and owner_id = auth.uid() and owner_confirmed_at is not null;
  if target_coach_id is null then raise exception '担当コーチの確定が必要です'; end if;
  return query
  select slot.id, slot.starts_at, slot.ends_at
  from public.wt_coach_availability_slots slot
  where slot.coach_id = target_coach_id and slot.active and slot.starts_at > now()
    and not exists (
      select 1 from public.wt_online_sessions session
      where session.slot_id = slot.id and session.status <> 'cancelled'
    )
  order by slot.starts_at limit 60;
end;
$$;


ALTER FUNCTION "public"."wt_owner_available_slots"("target_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_owner_confirm_coach"("target_application_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.wt_coaching_applications
  set owner_confirmed_at = now(), updated_at = now()
  where id = target_application_id
    and owner_id = auth.uid()
    and assigned_coach_id is not null
    and status in ('assigned', 'consulting', 'payment_pending', 'active');
  if not found then raise exception '担当コーチを確定できません'; end if;
  insert into public.wt_notifications (user_id, notification_type, title, body)
  select owner_id, 'coach_confirmed', '担当コーチが決定しました', 'オンライン診断を予約できます'
  from public.wt_coaching_applications where id = target_application_id
  union all
  select assigned_coach_id, 'owner_confirmed', 'オーナーが担当を確定しました', '空き枠と予約状況をご確認ください'
  from public.wt_coaching_applications where id = target_application_id;
end;
$$;


ALTER FUNCTION "public"."wt_owner_confirm_coach"("target_application_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_owner_onboarding_snapshot"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select jsonb_build_object(
    'owner', (
      select jsonb_build_object(
        'full_name', profile.full_name,
        'full_name_kana', profile.full_name_kana,
        'phone_number', profile.phone_number,
        'prefecture', profile.prefecture,
        'address', profile.address,
        'owner_birth_date', profile.owner_birth_date,
        'completed_at', profile.onboarding_completed_at
      )
      from public.wt_owner_profiles profile where profile.user_id = auth.uid()
    ),
    'dog', (
      select jsonb_build_object(
        'id', dog.id,
        'avatar_url', dog.avatar_url,
        'is_first_time_owner', dog.is_first_time_owner,
        'birth_date', coalesce(dog.birth_date, dog.birthday),
        'gender', dog.gender,
        'training_experience', dog.training_experience,
        'daycare_frequency', dog.daycare_frequency,
        'walk_frequency', dog.walk_frequency,
        'concerns', dog.concerns,
        'completed_at', dog.profile_completed_at
      )
      from public.wt_dogs dog where dog.owner_id = auth.uid() limit 1
    )
  );
$$;


ALTER FUNCTION "public"."wt_owner_onboarding_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_owner_save_daily_check"("target_dog_id" "uuid", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_appetite_score" smallint DEFAULT NULL::smallint, "next_sleep_rest_score" smallint DEFAULT NULL::smallint, "next_activity_score" smallint DEFAULT NULL::smallint, "next_exploration_score" smallint DEFAULT NULL::smallint, "next_calmness_score" smallint DEFAULT NULL::smallint, "next_toilet_score" smallint DEFAULT NULL::smallint, "next_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
declare
  owner_user_id uuid := auth.uid();
  target_local_date date;
  saved_entry_id uuid;
begin
  if owner_user_id is null or not exists (
    select 1 from public.wt_dogs dog
    where dog.id = target_dog_id and dog.owner_id = owner_user_id
  ) then
    raise exception 'dog is not owned by the current user' using errcode = '42501';
  end if;

  if next_occurred_at is null or next_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names zone where zone.name = next_timezone
  ) then
    raise exception 'invalid daily check date or timezone' using errcode = '22023';
  end if;

  if num_nonnulls(
    next_appetite_score, next_sleep_rest_score, next_activity_score,
    next_exploration_score, next_calmness_score, next_toilet_score
  ) = 0 then
    raise exception 'daily check requires at least one score' using errcode = '23514';
  end if;

  -- The same expression is used by the 030 trigger. It is only used here to
  -- find/lock the date; the trigger remains responsible for stored local_date.
  target_local_date := (next_occurred_at at time zone next_timezone)::date;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_dog_id::text || ':' || target_local_date::text, 0)
  );

  select entry.id into saved_entry_id
  from public.wt_observation_entries entry
  where entry.dog_id = target_dog_id
    and entry.owner_id = owner_user_id
    and entry.entry_kind = 'daily_check'
    and entry.local_date = target_local_date
    and entry.deleted_at is null
  for update;

  if saved_entry_id is null then
    insert into public.wt_observation_entries (
      owner_id, dog_id, entry_kind, occurred_at, timezone, local_date, note, source
    ) values (
      owner_user_id, target_dog_id, 'daily_check', next_occurred_at,
      next_timezone, target_local_date, next_note, 'owner'
    )
    -- Protect against other clients writing directly to the 030 tables.
    on conflict (dog_id, local_date)
      where entry_kind = 'daily_check' and deleted_at is null
    do nothing
    returning id into saved_entry_id;

    if saved_entry_id is null then
      select entry.id into saved_entry_id
      from public.wt_observation_entries entry
      where entry.dog_id = target_dog_id
        and entry.owner_id = owner_user_id
        and entry.entry_kind = 'daily_check'
        and entry.local_date = target_local_date
        and entry.deleted_at is null
      for update;
    end if;
  end if;

  if saved_entry_id is null then
    raise exception 'daily check could not be saved' using errcode = '40001';
  end if;

  update public.wt_observation_entries
  set occurred_at = next_occurred_at, timezone = next_timezone, note = next_note
  where id = saved_entry_id;

  insert into public.wt_daily_checks (
    entry_id, appetite_score, sleep_rest_score, activity_score,
    exploration_score, calmness_score, toilet_score
  ) values (
    saved_entry_id, next_appetite_score, next_sleep_rest_score,
    next_activity_score, next_exploration_score, next_calmness_score,
    next_toilet_score
  )
  on conflict (entry_id) do update set
    appetite_score = excluded.appetite_score,
    sleep_rest_score = excluded.sleep_rest_score,
    activity_score = excluded.activity_score,
    exploration_score = excluded.exploration_score,
    calmness_score = excluded.calmness_score,
    toilet_score = excluded.toilet_score;

  return saved_entry_id;
end;
$$;


ALTER FUNCTION "public"."wt_owner_save_daily_check"("target_dog_id" "uuid", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_appetite_score" smallint, "next_sleep_rest_score" smallint, "next_activity_score" smallint, "next_exploration_score" smallint, "next_calmness_score" smallint, "next_toilet_score" smallint, "next_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."wt_owner_save_daily_check"("target_dog_id" "uuid", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_appetite_score" smallint, "next_sleep_rest_score" smallint, "next_activity_score" smallint, "next_exploration_score" smallint, "next_calmness_score" smallint, "next_toilet_score" smallint, "next_note" "text") IS 'Atomically create or replace one active daily check per dog and local date under the caller RLS policies.';



CREATE OR REPLACE FUNCTION "public"."wt_owner_save_observation_event"("target_dog_id" "uuid", "next_theme_key" "text", "next_event_result" "text", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_entry_id" "uuid" DEFAULT NULL::"uuid", "next_handled_by_member_id" "uuid" DEFAULT NULL::"uuid", "next_state_before" "text" DEFAULT NULL::"text", "next_environment_key" "text" DEFAULT NULL::"text", "next_target_type" "text" DEFAULT NULL::"text", "next_distance_band" "text" DEFAULT NULL::"text", "next_intensity" smallint DEFAULT NULL::smallint, "next_duration_seconds" integer DEFAULT NULL::integer, "next_owner_response_keys" "text"[] DEFAULT NULL::"text"[], "next_outcome" "text" DEFAULT NULL::"text", "next_recovery_seconds" integer DEFAULT NULL::integer, "next_note" "text" DEFAULT NULL::"text", "next_theme_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
declare
  owner_user_id uuid := auth.uid();
  saved_entry_id uuid;
begin
  if owner_user_id is null or not exists (
    select 1 from public.wt_dogs dog where dog.id = target_dog_id and dog.owner_id = owner_user_id
  ) then
    raise exception 'dog is not owned by the current user' using errcode = '42501';
  end if;
  if next_theme_key is null or next_theme_key not in (
    'barking','walk','alone','toilet','dog_reaction','person_reaction',
    'biting','meal','sleep_rest','grooming'
  ) or next_event_result is null or next_event_result not in ('success','neutral','concern') then
    raise exception 'invalid observation theme or result' using errcode = '22023';
  end if;
  if next_occurred_at is null or next_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = next_timezone
  ) or next_theme_data is null or jsonb_typeof(next_theme_data) <> 'object' then
    raise exception 'invalid event timestamp, timezone or details' using errcode = '22023';
  end if;
  if next_handled_by_member_id is not null and not exists (
    select 1 from public.wt_household_members member
    where member.id = next_handled_by_member_id and member.owner_id = owner_user_id
      and member.deleted_at is null
  ) and not (
    next_entry_id is not null and exists (
      select 1 from public.wt_household_members member
      join public.wt_observation_events event_row on event_row.handled_by_member_id = member.id
      join public.wt_observation_entries entry on entry.id = event_row.entry_id
      where entry.id = next_entry_id and entry.dog_id = target_dog_id
        and entry.owner_id = owner_user_id and entry.deleted_at is null
        and member.id = next_handled_by_member_id and member.owner_id = owner_user_id
    )
  ) then
    raise exception 'handler is not owned by the current user' using errcode = '42501';
  end if;

  if next_entry_id is null then
    insert into public.wt_observation_entries (
      owner_id,dog_id,entry_kind,theme_key,occurred_at,timezone,local_date,note,source
    ) values (
      owner_user_id,target_dog_id,'event',next_theme_key,next_occurred_at,next_timezone,
      (next_occurred_at at time zone next_timezone)::date,next_note,'owner'
    ) returning id into saved_entry_id;
    insert into public.wt_observation_events (
      entry_id,event_result,handled_by_member_id,state_before,environment_key,
      target_type,distance_band,intensity,duration_seconds,owner_response_keys,
      outcome,recovery_seconds,theme_data
    ) values (
      saved_entry_id,next_event_result,next_handled_by_member_id,next_state_before,
      next_environment_key,next_target_type,next_distance_band,next_intensity,
      next_duration_seconds,next_owner_response_keys,next_outcome,next_recovery_seconds,next_theme_data
    );
  else
    select entry.id into saved_entry_id from public.wt_observation_entries entry
    where entry.id = next_entry_id and entry.dog_id = target_dog_id
      and entry.owner_id = owner_user_id and entry.entry_kind = 'event'
      and entry.source = 'owner' and entry.deleted_at is null for update;
    if saved_entry_id is null then
      raise exception 'event is not editable by current user' using errcode = '42501';
    end if;
    update public.wt_observation_entries
    set theme_key = next_theme_key, occurred_at = next_occurred_at,
      timezone = next_timezone, note = next_note
    where id = saved_entry_id;
    update public.wt_observation_events
    set event_result = next_event_result, handled_by_member_id = next_handled_by_member_id,
      state_before = next_state_before, environment_key = next_environment_key,
      target_type = next_target_type, distance_band = next_distance_band,
      intensity = next_intensity, duration_seconds = next_duration_seconds,
      owner_response_keys = next_owner_response_keys, outcome = next_outcome,
      recovery_seconds = next_recovery_seconds, theme_data = next_theme_data
    where entry_id = saved_entry_id;
    if not found then
      raise exception 'event details are missing' using errcode = '23514';
    end if;
  end if;
  return saved_entry_id;
end;
$$;


ALTER FUNCTION "public"."wt_owner_save_observation_event"("target_dog_id" "uuid", "next_theme_key" "text", "next_event_result" "text", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_entry_id" "uuid", "next_handled_by_member_id" "uuid", "next_state_before" "text", "next_environment_key" "text", "next_target_type" "text", "next_distance_band" "text", "next_intensity" smallint, "next_duration_seconds" integer, "next_owner_response_keys" "text"[], "next_outcome" "text", "next_recovery_seconds" integer, "next_note" "text", "next_theme_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_owner_soft_delete_observation_entry"("p_entry_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."wt_owner_soft_delete_observation_entry"("p_entry_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."wt_owner_soft_delete_observation_entry"("p_entry_id" "uuid") IS 'Owner-only soft delete for one active Observation entry. Missing, already-deleted, and non-owned UUIDs are intentionally indistinguishable.';



CREATE OR REPLACE FUNCTION "public"."wt_prepare_observation_entry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'unsupported observation timezone: %', new.timezone
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.wt_dogs dog
    where dog.id = new.dog_id and dog.owner_id = new.owner_id
  ) then
    raise exception 'observation owner does not own the selected dog'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id
       or new.dog_id <> old.dog_id
       or new.entry_kind <> old.entry_kind
       or new.source <> old.source then
      raise exception 'observation owner, dog, kind, and source are immutable'
        using errcode = '23514';
    end if;
    new.created_at := old.created_at;
  end if;

  new.local_date := (new.occurred_at at time zone new.timezone)::date;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."wt_prepare_observation_entry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_staff_availability_slots"() RETURNS TABLE("slot_id" "uuid", "coach_id" "uuid", "coach_name" "text", "coach_email" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "active" boolean, "session_id" "uuid", "session_status" "text", "owner_name" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  return query
  select slot.id, slot.coach_id,
    coalesce(profile.display_name, coach.email, 'コーチ')::text,
    coalesce(coach.email, '')::text,
    slot.starts_at, slot.ends_at, slot.active,
    session.id, session.status::text,
    coalesce(owner_profile.display_name, owner.email, '')::text
  from public.wt_coach_availability_slots slot
  join auth.users coach on coach.id = slot.coach_id
  left join public.wt_coach_profiles profile on profile.coach_id = slot.coach_id
  left join lateral (
    select booked.* from public.wt_online_sessions booked
    where booked.slot_id = slot.id
    order by booked.created_at desc limit 1
  ) session on true
  left join auth.users owner on owner.id = session.owner_id
  left join public.wt_user_roles owner_profile on owner_profile.user_id = session.owner_id
  where slot.starts_at > now()
    and (slot.active or session.id is not null)
    and (public.wt_is_admin() or slot.coach_id = auth.uid())
  order by slot.starts_at;
end;
$$;


ALTER FUNCTION "public"."wt_staff_availability_slots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_staff_create_availability_slot"("target_coach_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare new_slot_id uuid;
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  if not public.wt_is_admin() and target_coach_id <> auth.uid() then
    raise exception '自分以外の対応枠は追加できません';
  end if;
  if not exists (select 1 from public.wt_user_roles where user_id = target_coach_id and role = 'coach') then
    raise exception 'コーチを選択してください';
  end if;
  if next_starts_at <= now() or next_ends_at <= next_starts_at then
    raise exception '現在より後の正しい時間を選択してください';
  end if;
  insert into public.wt_coach_availability_slots (coach_id, starts_at, ends_at)
  values (target_coach_id, next_starts_at, next_ends_at)
  returning id into new_slot_id;
  return new_slot_id;
exception when exclusion_violation or unique_violation then
  raise exception '同じ時間帯に別の対応枠があります';
end;
$$;


ALTER FUNCTION "public"."wt_staff_create_availability_slot"("target_coach_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_staff_delete_availability_slot"("target_slot_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare slot_row public.wt_coach_availability_slots%rowtype;
begin
  select * into slot_row from public.wt_coach_availability_slots
  where id = target_slot_id for update;
  if slot_row.id is null then raise exception '対応枠が見つかりません'; end if;
  if not public.wt_is_admin() and not (public.wt_is_coach() and slot_row.coach_id = auth.uid()) then
    raise exception 'この対応枠は削除できません';
  end if;
  if exists (select 1 from public.wt_online_sessions where slot_id = target_slot_id and status <> 'cancelled') then
    raise exception '予約済みの枠です。先に予約をキャンセルするか、予約日時を個別に変更してください';
  end if;
  update public.wt_coach_availability_slots
  set active = false, updated_at = now()
  where id = target_slot_id;
end;
$$;


ALTER FUNCTION "public"."wt_staff_delete_availability_slot"("target_slot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_staff_online_sessions"() RETURNS TABLE("session_id" "uuid", "owner_id" "uuid", "owner_email" "text", "owner_name" "text", "dog_name" "text", "coach_id" "uuid", "coach_name" "text", "coach_avatar_url" "text", "coach_headline" "text", "session_type" "text", "status" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "meet_url" "text", "calendar_sync_status" "text", "calendar_sync_error" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  if not public.wt_is_staff() then raise exception 'staff role required'; end if;
  return query
  select session.id, session.owner_id, coalesce(owner_user.email, '')::text,
    coalesce(owner_profile.display_name, owner_user.email, 'オーナー')::text,
    dog.name::text, session.coach_id,
    coalesce(coach_profile.display_name, coach_user.email, 'コーチ')::text,
    coalesce(coach_profile.avatar_url, '')::text,
    coalesce(coach_profile.headline, '')::text,
    session.session_type::text, session.status::text, session.starts_at, session.ends_at,
    session.meet_url::text, session.calendar_sync_status::text, session.calendar_sync_error::text
  from public.wt_online_sessions session
  join auth.users owner_user on owner_user.id = session.owner_id
  join auth.users coach_user on coach_user.id = session.coach_id
  join public.wt_dogs dog on dog.id = session.dog_id
  left join public.wt_user_roles owner_profile on owner_profile.user_id = session.owner_id
  left join public.wt_coach_profiles coach_profile on coach_profile.coach_id = session.coach_id
  where public.wt_is_admin() or session.coach_id = auth.uid()
  order by session.starts_at;
end;
$$;


ALTER FUNCTION "public"."wt_staff_online_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_staff_update_availability_slot"("target_slot_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare slot_row public.wt_coach_availability_slots%rowtype;
begin
  select * into slot_row from public.wt_coach_availability_slots
  where id = target_slot_id for update;
  if slot_row.id is null then raise exception '対応枠が見つかりません'; end if;
  if not public.wt_is_admin() and not (public.wt_is_coach() and slot_row.coach_id = auth.uid()) then
    raise exception 'この対応枠は編集できません';
  end if;
  if exists (select 1 from public.wt_online_sessions where slot_id = target_slot_id and status <> 'cancelled') then
    raise exception '予約済みの枠です。先に予約をキャンセルするか、予約日時を個別に変更してください';
  end if;
  if next_starts_at <= now() or next_ends_at <= next_starts_at then
    raise exception '現在より後の正しい時間を選択してください';
  end if;
  update public.wt_coach_availability_slots
  set starts_at = next_starts_at, ends_at = next_ends_at, active = true, updated_at = now()
  where id = target_slot_id;
exception when exclusion_violation or unique_violation then
  raise exception '同じ時間帯に別の対応枠があります';
end;
$$;


ALTER FUNCTION "public"."wt_staff_update_availability_slot"("target_slot_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_staff_update_online_session"("target_session_id" "uuid", "next_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare updated_session public.wt_online_sessions%rowtype;
begin
  if next_status not in ('completed', 'cancelled') then raise exception 'invalid status'; end if;
  update public.wt_online_sessions
  set status = next_status, updated_at = now()
  where id = target_session_id and (public.wt_is_admin() or coach_id = auth.uid());
  if not found then raise exception 'session not found'; end if;
  select * into updated_session from public.wt_online_sessions where id = target_session_id;
  insert into public.wt_notifications (user_id, notification_type, title, body)
  values (
    updated_session.owner_id,
    'session_' || next_status,
    case when next_status = 'completed' then 'オンライン診断が完了しました' else 'オンライン診断がキャンセルされました' end,
    to_char(updated_session.starts_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI')
  );
end;
$$;


ALTER FUNCTION "public"."wt_staff_update_online_session"("target_session_id" "uuid", "next_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_touch_observation_theme"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."wt_touch_observation_theme"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wt_validate_observation_subtype"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
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


ALTER FUNCTION "public"."wt_validate_observation_subtype"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_calendar_sync_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "run_after" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_calendar_sync_jobs_action_check" CHECK (("action" = ANY (ARRAY['upsert'::"text", 'cancel'::"text"]))),
    CONSTRAINT "wt_calendar_sync_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."wt_calendar_sync_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_care_goal_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "completed_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wt_care_goal_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_care_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "goal_type" "text" NOT NULL,
    "target_count" smallint NOT NULL,
    "period" "text" NOT NULL,
    "reminder_time" time without time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_care_goals_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['brush'::"text", 'teeth'::"text", 'paws'::"text", 'bath'::"text", 'nails'::"text", 'ears'::"text", 'training'::"text", 'custom'::"text"]))),
    CONSTRAINT "wt_care_goals_period_check" CHECK (("period" = ANY (ARRAY['day'::"text", 'week'::"text", 'month'::"text"]))),
    CONSTRAINT "wt_care_goals_target_count_check" CHECK ((("target_count" >= 1) AND ("target_count" <= 31))),
    CONSTRAINT "wt_care_goals_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 40)))
);


ALTER TABLE "public"."wt_care_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_coach_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_coach_assignments_check" CHECK (("coach_id" <> "owner_id"))
);


ALTER TABLE "public"."wt_coach_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_coach_availability_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_coach_availability_slots_check" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."wt_coach_availability_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_coach_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "sender" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "media_url" "text",
    "media_key" "text",
    "media_type" "text",
    "media_name" "text",
    "media_size" bigint,
    "reply_to_message_id" "uuid",
    "reply_to_body" "text",
    "reply_to_sender" "text",
    "read_at" timestamp with time zone,
    CONSTRAINT "wt_coach_messages_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 3000))),
    CONSTRAINT "wt_coach_messages_media_size_check" CHECK ((("media_size" IS NULL) OR (("media_size" > 0) AND ("media_size" <= 52428800)))),
    CONSTRAINT "wt_coach_messages_media_type_check" CHECK ((("media_type" IS NULL) OR ("media_type" = ANY (ARRAY['image'::"text", 'video'::"text"])))),
    CONSTRAINT "wt_coach_messages_reply_to_sender_check" CHECK ((("reply_to_sender" IS NULL) OR ("reply_to_sender" = ANY (ARRAY['owner'::"text", 'coach'::"text"])))),
    CONSTRAINT "wt_coach_messages_sender_check" CHECK (("sender" = ANY (ARRAY['owner'::"text", 'coach'::"text"])))
);


ALTER TABLE "public"."wt_coach_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."wt_coach_messages"."reply_to_body" IS 'Snapshot of the quoted message body so the reply remains understandable if the source changes.';



CREATE TABLE IF NOT EXISTS "public"."wt_coach_profiles" (
    "coach_id" "uuid" NOT NULL,
    "display_name" "text" DEFAULT ''::"text" NOT NULL,
    "headline" "text" DEFAULT ''::"text" NOT NULL,
    "bio" "text" DEFAULT ''::"text" NOT NULL,
    "credentials" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "meet_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "avatar_preset" "text" DEFAULT 'paw-green'::"text" NOT NULL
);


ALTER TABLE "public"."wt_coach_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_coaching_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "concern_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "desired_outcome" "text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "assigned_coach_id" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_confirmed_at" timestamp with time zone,
    CONSTRAINT "wt_coaching_applications_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'offered'::"text", 'assigned'::"text", 'consulting'::"text", 'payment_pending'::"text", 'active'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."wt_coaching_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_daily_checks" (
    "entry_id" "uuid" NOT NULL,
    "appetite_score" smallint,
    "sleep_rest_score" smallint,
    "activity_score" smallint,
    "exploration_score" smallint,
    "calmness_score" smallint,
    "toilet_score" smallint,
    CONSTRAINT "wt_daily_checks_activity_score_check" CHECK ((("activity_score" >= 1) AND ("activity_score" <= 5))),
    CONSTRAINT "wt_daily_checks_appetite_score_check" CHECK ((("appetite_score" >= 1) AND ("appetite_score" <= 5))),
    CONSTRAINT "wt_daily_checks_calmness_score_check" CHECK ((("calmness_score" >= 1) AND ("calmness_score" <= 5))),
    CONSTRAINT "wt_daily_checks_exploration_score_check" CHECK ((("exploration_score" >= 1) AND ("exploration_score" <= 5))),
    CONSTRAINT "wt_daily_checks_has_score_check" CHECK (("num_nonnulls"("appetite_score", "sleep_rest_score", "activity_score", "exploration_score", "calmness_score", "toilet_score") > 0)),
    CONSTRAINT "wt_daily_checks_sleep_rest_score_check" CHECK ((("sleep_rest_score" >= 1) AND ("sleep_rest_score" <= 5))),
    CONSTRAINT "wt_daily_checks_toilet_score_check" CHECK ((("toilet_score" >= 1) AND ("toilet_score" <= 5)))
);


ALTER TABLE "public"."wt_daily_checks" OWNER TO "postgres";


COMMENT ON TABLE "public"."wt_daily_checks" IS 'One-to-one daily state scores; null means not answered and is never treated as zero.';



COMMENT ON COLUMN "public"."wt_daily_checks"."appetite_score" IS '1=very concerning, 2=slightly concerning, 3=usual, 4=good, 5=very good.';



CREATE TABLE IF NOT EXISTS "public"."wt_daily_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "recorded_on" "date" DEFAULT CURRENT_DATE NOT NULL,
    "mood" smallint NOT NULL,
    "appetite" "text" NOT NULL,
    "activity" "text" NOT NULL,
    "toilet" "text" NOT NULL,
    "sleep" "text" NOT NULL,
    "behavior_note" "text",
    "good_moment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT 'daily'::"text" NOT NULL,
    "recorded_time" time without time zone DEFAULT (("now"() AT TIME ZONE 'Asia/Tokyo'::"text"))::time without time zone NOT NULL,
    "duration_minutes" integer,
    "behavior_type" "text",
    "behavior_intensity" smallint,
    "behavior_types" "text"[],
    "behavior_custom_text" "text",
    "behavior_custom_texts" "text"[],
    CONSTRAINT "wt_daily_records_activity_check" CHECK (("activity" = ANY (ARRAY['良い'::"text", 'ふつう'::"text", '気になる'::"text"]))),
    CONSTRAINT "wt_daily_records_appetite_check" CHECK (("appetite" = ANY (ARRAY['良い'::"text", 'ふつう'::"text", '気になる'::"text"]))),
    CONSTRAINT "wt_daily_records_behavior_custom_text_check" CHECK ((("behavior_custom_text" IS NULL) OR (("char_length"("behavior_custom_text") >= 1) AND ("char_length"("behavior_custom_text") <= 60)))),
    CONSTRAINT "wt_daily_records_behavior_custom_texts_check" CHECK ((("behavior_custom_texts" IS NULL) OR ((("cardinality"("behavior_custom_texts") >= 1) AND ("cardinality"("behavior_custom_texts") <= 3)) AND ("array_position"("behavior_custom_texts", ''::"text") IS NULL)))),
    CONSTRAINT "wt_daily_records_behavior_intensity_check" CHECK ((("behavior_intensity" IS NULL) OR (("behavior_intensity" >= 1) AND ("behavior_intensity" <= 10)))),
    CONSTRAINT "wt_daily_records_behavior_type_check" CHECK (((("category" = 'barking'::"text") AND ("behavior_type" = ANY (ARRAY['barking'::"text", 'nipping'::"text", 'toilet_accident'::"text", 'jumping'::"text", 'pulling'::"text", 'other'::"text"]))) OR (("category" <> 'barking'::"text") AND ("behavior_type" IS NULL)))),
    CONSTRAINT "wt_daily_records_behavior_types_check" CHECK (((("category" = 'barking'::"text") AND (("cardinality"("behavior_types") >= 1) AND ("cardinality"("behavior_types") <= 3)) AND ("behavior_types" <@ ARRAY['barking'::"text", 'nipping'::"text", 'toilet_accident'::"text", 'jumping'::"text", 'pulling'::"text", 'other'::"text"]) AND ((("cardinality"("array_remove"("behavior_types", 'other'::"text")) + COALESCE("cardinality"("behavior_custom_texts"), 0)) >= 1) AND (("cardinality"("array_remove"("behavior_types", 'other'::"text")) + COALESCE("cardinality"("behavior_custom_texts"), 0)) <= 3)) AND ((('other'::"text" = ANY ("behavior_types")) AND (COALESCE("cardinality"("behavior_custom_texts"), 0) > 0)) OR (('other'::"text" <> ALL ("behavior_types")) AND ("behavior_custom_texts" IS NULL)))) OR (("category" <> 'barking'::"text") AND ("behavior_types" IS NULL) AND ("behavior_custom_texts" IS NULL)))),
    CONSTRAINT "wt_daily_records_category_check" CHECK (("category" = ANY (ARRAY['daily'::"text", 'meal'::"text", 'barking'::"text", 'toilet'::"text", 'walk'::"text", 'sleep'::"text", 'win'::"text"]))),
    CONSTRAINT "wt_daily_records_duration_minutes_check" CHECK ((("duration_minutes" IS NULL) OR (("duration_minutes" >= 1) AND ("duration_minutes" <= 600)))),
    CONSTRAINT "wt_daily_records_mood_check" CHECK ((("mood" >= 1) AND ("mood" <= 5))),
    CONSTRAINT "wt_daily_records_sleep_check" CHECK (("sleep" = ANY (ARRAY['良い'::"text", 'ふつう'::"text", '気になる'::"text"]))),
    CONSTRAINT "wt_daily_records_toilet_check" CHECK (("toilet" = ANY (ARRAY['良い'::"text", 'ふつう'::"text", '気になる'::"text"])))
);


ALTER TABLE "public"."wt_daily_records" OWNER TO "postgres";


COMMENT ON COLUMN "public"."wt_daily_records"."behavior_intensity" IS 'Owner-reported concern intensity from 1 (low) to 10 (high).';



COMMENT ON COLUMN "public"."wt_daily_records"."behavior_custom_texts" IS 'Reusable owner-defined concern labels. Kept separately from standardized behavior types for aggregate analysis.';



CREATE TABLE IF NOT EXISTS "public"."wt_dog_observation_themes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "theme_key" "text" NOT NULL,
    "sort_order" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_dog_observation_themes_sort_order_check" CHECK ((("sort_order" >= 1) AND ("sort_order" <= 3))),
    CONSTRAINT "wt_dog_observation_themes_theme_key_check" CHECK (("theme_key" = ANY (ARRAY['barking'::"text", 'walk'::"text", 'alone'::"text", 'toilet'::"text", 'dog_reaction'::"text", 'person_reaction'::"text", 'biting'::"text", 'meal'::"text", 'sleep_rest'::"text", 'grooming'::"text"])))
);


ALTER TABLE "public"."wt_dog_observation_themes" OWNER TO "postgres";


COMMENT ON TABLE "public"."wt_dog_observation_themes" IS 'Up to three canonical observation themes selected for each dog.';



COMMENT ON COLUMN "public"."wt_dog_observation_themes"."sort_order" IS 'Positions 1-3 also enforce the per-dog maximum without a race-prone count trigger.';



CREATE TABLE IF NOT EXISTS "public"."wt_dogs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "breed" "text",
    "birthday" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_first_time_owner" boolean,
    "birth_date" "date",
    "gender" "text",
    "daycare_frequency" "text" DEFAULT ''::"text" NOT NULL,
    "walk_frequency" "text" DEFAULT ''::"text" NOT NULL,
    "concerns" "text" DEFAULT ''::"text" NOT NULL,
    "profile_completed_at" timestamp with time zone,
    "training_experience" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    CONSTRAINT "wt_dogs_gender_check" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['male_neutered'::"text", 'male_intact'::"text", 'female_spayed'::"text", 'female_intact'::"text", 'unknown'::"text"])))),
    CONSTRAINT "wt_dogs_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 60)))
);


ALTER TABLE "public"."wt_dogs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_google_calendar_connections" (
    "coach_id" "uuid" NOT NULL,
    "google_email" "text",
    "calendar_id" "text" DEFAULT 'primary'::"text" NOT NULL,
    "encrypted_refresh_token" "text" NOT NULL,
    "token_iv" "text" NOT NULL,
    "token_tag" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "sync_status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "last_error" "text",
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_google_calendar_connections_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['connected'::"text", 'error'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."wt_google_calendar_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_google_oauth_states" (
    "state_hash" "text" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wt_google_oauth_states" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_household_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "display_name" "text" NOT NULL,
    "relation_key" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_household_members_display_name_check" CHECK ((("char_length"("btrim"("display_name")) >= 1) AND ("char_length"("btrim"("display_name")) <= 60))),
    CONSTRAINT "wt_household_members_relation_key_check" CHECK (("relation_key" = ANY (ARRAY['self'::"text", 'father'::"text", 'mother'::"text", 'partner'::"text", 'child'::"text", 'grandparent'::"text", 'other'::"text"]))),
    CONSTRAINT "wt_household_members_sort_order_check" CHECK (("sort_order" >= 0))
);


ALTER TABLE "public"."wt_household_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wt_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_observation_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "entry_kind" "text" NOT NULL,
    "theme_key" "text",
    "occurred_at" timestamp with time zone NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Tokyo'::"text" NOT NULL,
    "local_date" "date" NOT NULL,
    "note" "text",
    "schema_version" integer DEFAULT 1 NOT NULL,
    "source" "text" DEFAULT 'owner'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "wt_observation_entries_deleted_at_check" CHECK ((("deleted_at" IS NULL) OR ("deleted_at" >= "created_at"))),
    CONSTRAINT "wt_observation_entries_entry_kind_check" CHECK (("entry_kind" = ANY (ARRAY['daily_check'::"text", 'event'::"text"]))),
    CONSTRAINT "wt_observation_entries_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 5000))),
    CONSTRAINT "wt_observation_entries_schema_version_check" CHECK (("schema_version" > 0)),
    CONSTRAINT "wt_observation_entries_source_check" CHECK (("source" = ANY (ARRAY['owner'::"text", 'coach'::"text", 'import'::"text"]))),
    CONSTRAINT "wt_observation_entries_theme_check" CHECK (((("entry_kind" = 'daily_check'::"text") AND ("theme_key" IS NULL)) OR (("entry_kind" = 'event'::"text") AND ("theme_key" = ANY (ARRAY['barking'::"text", 'walk'::"text", 'alone'::"text", 'toilet'::"text", 'dog_reaction'::"text", 'person_reaction'::"text", 'biting'::"text", 'meal'::"text", 'sleep_rest'::"text", 'grooming'::"text"]))))),
    CONSTRAINT "wt_observation_entries_timezone_check" CHECK ((("char_length"("timezone") >= 1) AND ("char_length"("timezone") <= 100)))
);


ALTER TABLE "public"."wt_observation_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."wt_observation_entries" IS 'Common immutable identity and timing data for daily checks and event logs.';



COMMENT ON COLUMN "public"."wt_observation_entries"."id" IS 'May be supplied by an offline client; otherwise generated by PostgreSQL.';



COMMENT ON COLUMN "public"."wt_observation_entries"."theme_key" IS 'Null for holistic daily checks and required for event logs.';



COMMENT ON COLUMN "public"."wt_observation_entries"."local_date" IS 'Derived by the database from occurred_at in the stored IANA timezone.';



CREATE TABLE IF NOT EXISTS "public"."wt_observation_events" (
    "entry_id" "uuid" NOT NULL,
    "event_result" "text" NOT NULL,
    "state_before" "text",
    "environment_key" "text",
    "situation_keys" "text"[],
    "behavior_keys" "text"[],
    "target_type" "text",
    "distance_band" "text",
    "intensity" smallint,
    "duration_seconds" integer,
    "owner_response_keys" "text"[],
    "outcome" "text",
    "recovery_seconds" integer,
    "success" boolean,
    "theme_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "handled_by_member_id" "uuid",
    CONSTRAINT "wt_observation_events_behavior_keys_check" CHECK ((("behavior_keys" IS NULL) OR ((("cardinality"("behavior_keys") >= 0) AND ("cardinality"("behavior_keys") <= 20)) AND ("array_position"("behavior_keys", NULL::"text") IS NULL) AND ("array_position"("behavior_keys", ''::"text") IS NULL)))),
    CONSTRAINT "wt_observation_events_distance_band_check" CHECK ((("distance_band" IS NULL) OR ("distance_band" = ANY (ARRAY['under_1m'::"text", '1_3m'::"text", '3_5m'::"text", '5_10m'::"text", 'over_10m'::"text", 'unknown'::"text"])))),
    CONSTRAINT "wt_observation_events_duration_seconds_check" CHECK ((("duration_seconds" IS NULL) OR (("duration_seconds" >= 0) AND ("duration_seconds" <= 604800)))),
    CONSTRAINT "wt_observation_events_environment_key_check" CHECK ((("environment_key" IS NULL) OR ("environment_key" = ANY (ARRAY['home'::"text", 'street'::"text", 'park'::"text", 'cafe'::"text", 'shop'::"text", 'daycare'::"text", 'vehicle'::"text", 'other'::"text"])))),
    CONSTRAINT "wt_observation_events_event_result_check" CHECK (("event_result" = ANY (ARRAY['success'::"text", 'neutral'::"text", 'concern'::"text"]))),
    CONSTRAINT "wt_observation_events_intensity_check" CHECK ((("intensity" IS NULL) OR (("intensity" >= 1) AND ("intensity" <= 5)))),
    CONSTRAINT "wt_observation_events_outcome_check" CHECK ((("outcome" IS NULL) OR ("outcome" = ANY (ARRAY['no_reaction'::"text", 'settled_quickly'::"text", 'partly_settled'::"text", 'unchanged'::"text", 'escalated'::"text"])))),
    CONSTRAINT "wt_observation_events_owner_response_keys_check" CHECK ((("owner_response_keys" IS NULL) OR ((("cardinality"("owner_response_keys") >= 0) AND ("cardinality"("owner_response_keys") <= 20)) AND ("array_position"("owner_response_keys", NULL::"text") IS NULL) AND ("array_position"("owner_response_keys", ''::"text") IS NULL)))),
    CONSTRAINT "wt_observation_events_recovery_seconds_check" CHECK ((("recovery_seconds" IS NULL) OR (("recovery_seconds" >= 0) AND ("recovery_seconds" <= 604800)))),
    CONSTRAINT "wt_observation_events_situation_keys_check" CHECK ((("situation_keys" IS NULL) OR ((("cardinality"("situation_keys") >= 0) AND ("cardinality"("situation_keys") <= 20)) AND ("array_position"("situation_keys", NULL::"text") IS NULL) AND ("array_position"("situation_keys", ''::"text") IS NULL)))),
    CONSTRAINT "wt_observation_events_state_before_check" CHECK ((("state_before" IS NULL) OR ("state_before" = ANY (ARRAY['calm'::"text", 'excited'::"text", 'tired'::"text", 'hungry'::"text", 'uneasy'::"text", 'unknown'::"text"])))),
    CONSTRAINT "wt_observation_events_target_type_check" CHECK ((("target_type" IS NULL) OR ("target_type" = ANY (ARRAY['dog'::"text", 'person'::"text", 'sound'::"text", 'object'::"text", 'owner'::"text", 'none'::"text", 'other'::"text"])))),
    CONSTRAINT "wt_observation_events_theme_data_check" CHECK (("jsonb_typeof"("theme_data") = 'object'::"text"))
);


ALTER TABLE "public"."wt_observation_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."wt_observation_events" IS 'One-to-one structured event details used for explainable trend analysis.';



COMMENT ON COLUMN "public"."wt_observation_events"."event_result" IS 'Exposure-level result, including successful and neutral events as well as concerns.';



COMMENT ON COLUMN "public"."wt_observation_events"."intensity" IS 'Optional reaction intensity: 1=very weak, 2=weak, 3=moderate, 4=strong, 5=very strong.';



COMMENT ON COLUMN "public"."wt_observation_events"."success" IS 'Optional explicit result for a theme-specific goal; event_result remains the common exposure classification.';



COMMENT ON COLUMN "public"."wt_observation_events"."theme_data" IS 'Theme-specific, versioned attributes only. Common analysis dimensions use typed columns.';



COMMENT ON COLUMN "public"."wt_observation_events"."handled_by_member_id" IS 'Single primary handler; nullable. Member ownership matches the parent observation owner.';



CREATE TABLE IF NOT EXISTS "public"."wt_online_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slot_id" "uuid" NOT NULL,
    "application_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "dog_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "session_type" "text" NOT NULL,
    "status" "text" DEFAULT 'booked'::"text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "meet_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "google_event_id" "text",
    "google_event_etag" "text",
    "calendar_sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "calendar_sync_error" "text",
    CONSTRAINT "wt_online_sessions_calendar_sync_status_check" CHECK (("calendar_sync_status" = ANY (ARRAY['pending'::"text", 'syncing'::"text", 'synced'::"text", 'error'::"text", 'not_connected'::"text"]))),
    CONSTRAINT "wt_online_sessions_session_type_check" CHECK (("session_type" = ANY (ARRAY['initial'::"text", 'followup'::"text"]))),
    CONSTRAINT "wt_online_sessions_status_check" CHECK (("status" = ANY (ARRAY['booked'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."wt_online_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_owner_profiles" (
    "user_id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "phone_number" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "owner_birth_date" "date",
    "onboarding_completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "prefecture" "text" DEFAULT ''::"text" NOT NULL,
    "full_name_kana" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "wt_owner_profiles_address_check" CHECK (("char_length"("address") <= 300)),
    CONSTRAINT "wt_owner_profiles_full_name_check" CHECK (("char_length"("full_name") <= 100)),
    CONSTRAINT "wt_owner_profiles_phone_number_check" CHECK (("char_length"("phone_number") <= 30)),
    CONSTRAINT "wt_owner_profiles_prefecture_check" CHECK ((("prefecture" = ''::"text") OR ("prefecture" = ANY (ARRAY['北海道'::"text", '青森県'::"text", '岩手県'::"text", '宮城県'::"text", '秋田県'::"text", '山形県'::"text", '福島県'::"text", '茨城県'::"text", '栃木県'::"text", '群馬県'::"text", '埼玉県'::"text", '千葉県'::"text", '東京都'::"text", '神奈川県'::"text", '新潟県'::"text", '富山県'::"text", '石川県'::"text", '福井県'::"text", '山梨県'::"text", '長野県'::"text", '岐阜県'::"text", '静岡県'::"text", '愛知県'::"text", '三重県'::"text", '滋賀県'::"text", '京都府'::"text", '大阪府'::"text", '兵庫県'::"text", '奈良県'::"text", '和歌山県'::"text", '鳥取県'::"text", '島根県'::"text", '岡山県'::"text", '広島県'::"text", '山口県'::"text", '徳島県'::"text", '香川県'::"text", '愛媛県'::"text", '高知県'::"text", '福岡県'::"text", '佐賀県'::"text", '長崎県'::"text", '熊本県'::"text", '大分県'::"text", '宮崎県'::"text", '鹿児島県'::"text", '沖縄県'::"text"]))))
);


ALTER TABLE "public"."wt_owner_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_subscriptions" (
    "user_id" "uuid" NOT NULL,
    "plan_status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_checkout_session_id" "text",
    "stripe_price_id" "text",
    "stripe_event_id" "text",
    "activated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wt_subscriptions_plan_status_check" CHECK (("plan_status" = ANY (ARRAY['inactive'::"text", 'active_member'::"text", 'past_due'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."wt_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wt_user_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text",
    CONSTRAINT "wt_user_roles_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'coach'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."wt_user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."wt_calendar_sync_jobs"
    ADD CONSTRAINT "wt_calendar_sync_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_care_goal_completions"
    ADD CONSTRAINT "wt_care_goal_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_care_goals"
    ADD CONSTRAINT "wt_care_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_coach_assignments"
    ADD CONSTRAINT "wt_coach_assignments_coach_id_dog_id_key" UNIQUE ("coach_id", "dog_id");



ALTER TABLE ONLY "public"."wt_coach_assignments"
    ADD CONSTRAINT "wt_coach_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_coach_availability_slots"
    ADD CONSTRAINT "wt_coach_availability_no_overlap" EXCLUDE USING "gist" ("coach_id" WITH =, "tstzrange"("starts_at", "ends_at", '[)'::"text") WITH &&) WHERE ("active");



ALTER TABLE ONLY "public"."wt_coach_availability_slots"
    ADD CONSTRAINT "wt_coach_availability_slots_coach_id_starts_at_key" UNIQUE ("coach_id", "starts_at");



ALTER TABLE ONLY "public"."wt_coach_availability_slots"
    ADD CONSTRAINT "wt_coach_availability_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_coach_messages"
    ADD CONSTRAINT "wt_coach_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_coach_profiles"
    ADD CONSTRAINT "wt_coach_profiles_pkey" PRIMARY KEY ("coach_id");



ALTER TABLE ONLY "public"."wt_coaching_applications"
    ADD CONSTRAINT "wt_coaching_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_daily_checks"
    ADD CONSTRAINT "wt_daily_checks_pkey" PRIMARY KEY ("entry_id");



ALTER TABLE ONLY "public"."wt_daily_records"
    ADD CONSTRAINT "wt_daily_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_dog_observation_themes"
    ADD CONSTRAINT "wt_dog_observation_themes_dog_id_sort_order_key" UNIQUE ("dog_id", "sort_order");



ALTER TABLE ONLY "public"."wt_dog_observation_themes"
    ADD CONSTRAINT "wt_dog_observation_themes_dog_id_theme_key_key" UNIQUE ("dog_id", "theme_key");



ALTER TABLE ONLY "public"."wt_dog_observation_themes"
    ADD CONSTRAINT "wt_dog_observation_themes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_dogs"
    ADD CONSTRAINT "wt_dogs_owner_id_key" UNIQUE ("owner_id");



ALTER TABLE ONLY "public"."wt_dogs"
    ADD CONSTRAINT "wt_dogs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_google_calendar_connections"
    ADD CONSTRAINT "wt_google_calendar_connections_pkey" PRIMARY KEY ("coach_id");



ALTER TABLE ONLY "public"."wt_google_oauth_states"
    ADD CONSTRAINT "wt_google_oauth_states_pkey" PRIMARY KEY ("state_hash");



ALTER TABLE ONLY "public"."wt_household_members"
    ADD CONSTRAINT "wt_household_members_id_owner_id_key" UNIQUE ("id", "owner_id");



ALTER TABLE ONLY "public"."wt_household_members"
    ADD CONSTRAINT "wt_household_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_notifications"
    ADD CONSTRAINT "wt_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_observation_entries"
    ADD CONSTRAINT "wt_observation_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_observation_events"
    ADD CONSTRAINT "wt_observation_events_pkey" PRIMARY KEY ("entry_id");



ALTER TABLE ONLY "public"."wt_online_sessions"
    ADD CONSTRAINT "wt_online_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wt_owner_profiles"
    ADD CONSTRAINT "wt_owner_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."wt_subscriptions"
    ADD CONSTRAINT "wt_subscriptions_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."wt_subscriptions"
    ADD CONSTRAINT "wt_subscriptions_stripe_checkout_session_id_key" UNIQUE ("stripe_checkout_session_id");



ALTER TABLE ONLY "public"."wt_subscriptions"
    ADD CONSTRAINT "wt_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."wt_user_roles"
    ADD CONSTRAINT "wt_user_roles_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "wt_calendar_sync_jobs_due_idx" ON "public"."wt_calendar_sync_jobs" USING "btree" ("status", "run_after");



CREATE UNIQUE INDEX "wt_calendar_sync_jobs_open_idx" ON "public"."wt_calendar_sync_jobs" USING "btree" ("session_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "wt_care_goal_completions_goal_date_idx" ON "public"."wt_care_goal_completions" USING "btree" ("goal_id", "completed_on" DESC);



CREATE INDEX "wt_care_goal_completions_owner_date_idx" ON "public"."wt_care_goal_completions" USING "btree" ("owner_id", "completed_on" DESC);



CREATE INDEX "wt_care_goals_owner_active_idx" ON "public"."wt_care_goals" USING "btree" ("owner_id", "active");



CREATE INDEX "wt_coach_assignments_coach_idx" ON "public"."wt_coach_assignments" USING "btree" ("coach_id", "created_at" DESC);



CREATE INDEX "wt_coach_assignments_owner_idx" ON "public"."wt_coach_assignments" USING "btree" ("owner_id");



CREATE INDEX "wt_coach_messages_owner_created_idx" ON "public"."wt_coach_messages" USING "btree" ("owner_id", "created_at");



CREATE INDEX "wt_coach_messages_unread_coach_idx" ON "public"."wt_coach_messages" USING "btree" ("owner_id", "dog_id", "created_at") WHERE (("sender" = 'coach'::"text") AND ("read_at" IS NULL));



CREATE INDEX "wt_coaching_applications_coach_idx" ON "public"."wt_coaching_applications" USING "btree" ("assigned_coach_id", "updated_at" DESC);



CREATE UNIQUE INDEX "wt_coaching_applications_open_dog_idx" ON "public"."wt_coaching_applications" USING "btree" ("dog_id") WHERE ("status" <> 'closed'::"text");



CREATE INDEX "wt_coaching_applications_status_idx" ON "public"."wt_coaching_applications" USING "btree" ("status", "submitted_at" DESC);



CREATE INDEX "wt_daily_records_behavior_report_idx" ON "public"."wt_daily_records" USING "btree" ("owner_id", "behavior_type", "recorded_on" DESC, "recorded_time" DESC);



CREATE INDEX "wt_daily_records_behavior_types_gin_idx" ON "public"."wt_daily_records" USING "gin" ("behavior_types");



CREATE INDEX "wt_daily_records_category_idx" ON "public"."wt_daily_records" USING "btree" ("owner_id", "category", "recorded_on" DESC);



CREATE INDEX "wt_daily_records_custom_behavior_idx" ON "public"."wt_daily_records" USING "btree" ("owner_id", "recorded_on" DESC) WHERE ("behavior_custom_texts" IS NOT NULL);



CREATE INDEX "wt_daily_records_owner_date_idx" ON "public"."wt_daily_records" USING "btree" ("owner_id", "recorded_on" DESC);



CREATE INDEX "wt_daily_records_timeline_idx" ON "public"."wt_daily_records" USING "btree" ("owner_id", "recorded_on" DESC, "recorded_time" DESC);



CREATE INDEX "wt_household_members_owner_order_idx" ON "public"."wt_household_members" USING "btree" ("owner_id", "sort_order", "created_at");



CREATE INDEX "wt_notifications_user_date_idx" ON "public"."wt_notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "wt_observation_entries_daily_check_day_uidx" ON "public"."wt_observation_entries" USING "btree" ("dog_id", "local_date") WHERE (("entry_kind" = 'daily_check'::"text") AND ("deleted_at" IS NULL));



CREATE INDEX "wt_observation_entries_dog_kind_occurred_idx" ON "public"."wt_observation_entries" USING "btree" ("dog_id", "entry_kind", "occurred_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "wt_observation_entries_dog_local_date_idx" ON "public"."wt_observation_entries" USING "btree" ("dog_id", "local_date") WHERE ("deleted_at" IS NULL);



CREATE INDEX "wt_observation_entries_dog_occurred_idx" ON "public"."wt_observation_entries" USING "btree" ("dog_id", "occurred_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "wt_observation_entries_dog_theme_occurred_idx" ON "public"."wt_observation_entries" USING "btree" ("dog_id", "theme_key", "occurred_at" DESC) WHERE (("deleted_at" IS NULL) AND ("theme_key" IS NOT NULL));



CREATE INDEX "wt_observation_entries_owner_occurred_idx" ON "public"."wt_observation_entries" USING "btree" ("owner_id", "occurred_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "wt_observation_events_behavior_keys_gin_idx" ON "public"."wt_observation_events" USING "gin" ("behavior_keys");



CREATE INDEX "wt_observation_events_handler_idx" ON "public"."wt_observation_events" USING "btree" ("handled_by_member_id") WHERE ("handled_by_member_id" IS NOT NULL);



CREATE INDEX "wt_observation_events_owner_response_keys_gin_idx" ON "public"."wt_observation_events" USING "gin" ("owner_response_keys");



CREATE INDEX "wt_observation_events_situation_keys_gin_idx" ON "public"."wt_observation_events" USING "gin" ("situation_keys");



CREATE INDEX "wt_online_sessions_coach_date_idx" ON "public"."wt_online_sessions" USING "btree" ("coach_id", "starts_at");



CREATE UNIQUE INDEX "wt_online_sessions_live_slot_idx" ON "public"."wt_online_sessions" USING "btree" ("slot_id") WHERE ("status" <> 'cancelled'::"text");



CREATE INDEX "wt_online_sessions_owner_date_idx" ON "public"."wt_online_sessions" USING "btree" ("owner_id", "starts_at");



CREATE OR REPLACE TRIGGER "wt_guard_event_handler_before_write" BEFORE INSERT OR UPDATE ON "public"."wt_observation_events" FOR EACH ROW EXECUTE FUNCTION "public"."wt_guard_event_handler"();



CREATE OR REPLACE TRIGGER "wt_guard_household_member_before_write" BEFORE INSERT OR UPDATE ON "public"."wt_household_members" FOR EACH ROW EXECUTE FUNCTION "public"."wt_guard_household_member"();



CREATE OR REPLACE TRIGGER "wt_online_sessions_enqueue_calendar_sync" AFTER INSERT OR UPDATE OF "starts_at", "ends_at", "status" ON "public"."wt_online_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."wt_enqueue_calendar_sync"();



CREATE OR REPLACE TRIGGER "wt_prepare_observation_entry_before_write" BEFORE INSERT OR UPDATE ON "public"."wt_observation_entries" FOR EACH ROW EXECUTE FUNCTION "public"."wt_prepare_observation_entry"();



CREATE OR REPLACE TRIGGER "wt_touch_observation_theme_before_update" BEFORE UPDATE ON "public"."wt_dog_observation_themes" FOR EACH ROW EXECUTE FUNCTION "public"."wt_touch_observation_theme"();



CREATE OR REPLACE TRIGGER "wt_validate_daily_check_before_write" BEFORE INSERT OR UPDATE ON "public"."wt_daily_checks" FOR EACH ROW EXECUTE FUNCTION "public"."wt_validate_observation_subtype"('daily_check');



CREATE OR REPLACE TRIGGER "wt_validate_observation_event_before_write" BEFORE INSERT OR UPDATE ON "public"."wt_observation_events" FOR EACH ROW EXECUTE FUNCTION "public"."wt_validate_observation_subtype"('event');



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_calendar_sync_jobs"
    ADD CONSTRAINT "wt_calendar_sync_jobs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_calendar_sync_jobs"
    ADD CONSTRAINT "wt_calendar_sync_jobs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."wt_online_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_care_goal_completions"
    ADD CONSTRAINT "wt_care_goal_completions_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_care_goal_completions"
    ADD CONSTRAINT "wt_care_goal_completions_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."wt_care_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_care_goal_completions"
    ADD CONSTRAINT "wt_care_goal_completions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_care_goals"
    ADD CONSTRAINT "wt_care_goals_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_care_goals"
    ADD CONSTRAINT "wt_care_goals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coach_assignments"
    ADD CONSTRAINT "wt_coach_assignments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coach_assignments"
    ADD CONSTRAINT "wt_coach_assignments_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coach_assignments"
    ADD CONSTRAINT "wt_coach_assignments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coach_availability_slots"
    ADD CONSTRAINT "wt_coach_availability_slots_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coach_messages"
    ADD CONSTRAINT "wt_coach_messages_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coach_messages"
    ADD CONSTRAINT "wt_coach_messages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coach_messages"
    ADD CONSTRAINT "wt_coach_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."wt_coach_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wt_coach_profiles"
    ADD CONSTRAINT "wt_coach_profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coaching_applications"
    ADD CONSTRAINT "wt_coaching_applications_assigned_coach_id_fkey" FOREIGN KEY ("assigned_coach_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wt_coaching_applications"
    ADD CONSTRAINT "wt_coaching_applications_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_coaching_applications"
    ADD CONSTRAINT "wt_coaching_applications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_daily_checks"
    ADD CONSTRAINT "wt_daily_checks_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."wt_observation_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_daily_records"
    ADD CONSTRAINT "wt_daily_records_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_daily_records"
    ADD CONSTRAINT "wt_daily_records_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_dog_observation_themes"
    ADD CONSTRAINT "wt_dog_observation_themes_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_dogs"
    ADD CONSTRAINT "wt_dogs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_google_calendar_connections"
    ADD CONSTRAINT "wt_google_calendar_connections_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_google_oauth_states"
    ADD CONSTRAINT "wt_google_oauth_states_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_household_members"
    ADD CONSTRAINT "wt_household_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_notifications"
    ADD CONSTRAINT "wt_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_observation_entries"
    ADD CONSTRAINT "wt_observation_entries_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_observation_entries"
    ADD CONSTRAINT "wt_observation_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_observation_events"
    ADD CONSTRAINT "wt_observation_events_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."wt_observation_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_observation_events"
    ADD CONSTRAINT "wt_observation_events_handled_by_member_id_fkey" FOREIGN KEY ("handled_by_member_id") REFERENCES "public"."wt_household_members"("id");



ALTER TABLE ONLY "public"."wt_online_sessions"
    ADD CONSTRAINT "wt_online_sessions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."wt_coaching_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_online_sessions"
    ADD CONSTRAINT "wt_online_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_online_sessions"
    ADD CONSTRAINT "wt_online_sessions_dog_id_fkey" FOREIGN KEY ("dog_id") REFERENCES "public"."wt_dogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_online_sessions"
    ADD CONSTRAINT "wt_online_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_online_sessions"
    ADD CONSTRAINT "wt_online_sessions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."wt_coach_availability_slots"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."wt_owner_profiles"
    ADD CONSTRAINT "wt_owner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_subscriptions"
    ADD CONSTRAINT "wt_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wt_user_roles"
    ADD CONSTRAINT "wt_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Owners manage their dog" ON "public"."wt_dogs" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owners manage their records" ON "public"."wt_daily_records" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owners read their messages" ON "public"."wt_coach_messages" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owners send owner messages" ON "public"."wt_coach_messages" FOR INSERT TO "authenticated" WITH CHECK ((("owner_id" = "auth"."uid"()) AND ("sender" = 'owner'::"text")));



CREATE POLICY "admins manage assignments" ON "public"."wt_coach_assignments" TO "authenticated" USING ("public"."wt_is_admin"()) WITH CHECK ("public"."wt_is_admin"());



CREATE POLICY "admins manage daily checks" ON "public"."wt_daily_checks" TO "authenticated" USING ("public"."wt_is_admin"()) WITH CHECK ("public"."wt_is_admin"());



CREATE POLICY "admins manage dog observation themes" ON "public"."wt_dog_observation_themes" TO "authenticated" USING ("public"."wt_is_admin"()) WITH CHECK ("public"."wt_is_admin"());



CREATE POLICY "admins manage household members" ON "public"."wt_household_members" TO "authenticated" USING ("public"."wt_is_admin"()) WITH CHECK ("public"."wt_is_admin"());



CREATE POLICY "admins manage observation entries" ON "public"."wt_observation_entries" TO "authenticated" USING ("public"."wt_is_admin"()) WITH CHECK ("public"."wt_is_admin"());



CREATE POLICY "admins manage observation events" ON "public"."wt_observation_events" TO "authenticated" USING ("public"."wt_is_admin"()) WITH CHECK ("public"."wt_is_admin"());



CREATE POLICY "admins manage roles" ON "public"."wt_user_roles" TO "authenticated" USING ("public"."wt_is_admin"()) WITH CHECK ("public"."wt_is_admin"());



CREATE POLICY "assigned coaches read daily checks" ON "public"."wt_daily_checks" FOR SELECT TO "authenticated" USING (("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM ("public"."wt_observation_entries" "entry"
     JOIN "public"."wt_coach_assignments" "assignment" ON (("assignment"."dog_id" = "entry"."dog_id")))
  WHERE (("entry"."id" = "wt_daily_checks"."entry_id") AND ("assignment"."coach_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL))))));



CREATE POLICY "assigned coaches read dog observation themes" ON "public"."wt_dog_observation_themes" FOR SELECT TO "authenticated" USING (("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "assignment"
  WHERE (("assignment"."coach_id" = "auth"."uid"()) AND ("assignment"."dog_id" = "wt_dog_observation_themes"."dog_id"))))));



CREATE POLICY "assigned coaches read household members" ON "public"."wt_household_members" FOR SELECT TO "authenticated" USING (("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM ("public"."wt_dogs" "dog"
     JOIN "public"."wt_coach_assignments" "assignment" ON (("assignment"."dog_id" = "dog"."id")))
  WHERE (("dog"."owner_id" = "wt_household_members"."owner_id") AND ("assignment"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "assigned coaches read observation entries" ON "public"."wt_observation_entries" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND "public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "assignment"
  WHERE (("assignment"."coach_id" = "auth"."uid"()) AND ("assignment"."dog_id" = "wt_observation_entries"."dog_id"))))));



CREATE POLICY "assigned coaches read observation events" ON "public"."wt_observation_events" FOR SELECT TO "authenticated" USING (("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM ("public"."wt_observation_entries" "entry"
     JOIN "public"."wt_coach_assignments" "assignment" ON (("assignment"."dog_id" = "entry"."dog_id")))
  WHERE (("entry"."id" = "wt_observation_events"."entry_id") AND ("assignment"."coach_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL))))));



CREATE POLICY "assigned staff read care completions" ON "public"."wt_care_goal_completions" FOR SELECT TO "authenticated" USING (("public"."wt_is_admin"() OR ("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "a"
  WHERE (("a"."coach_id" = "auth"."uid"()) AND ("a"."dog_id" = "wt_care_goal_completions"."dog_id")))))));



CREATE POLICY "assigned staff read care goals" ON "public"."wt_care_goals" FOR SELECT TO "authenticated" USING (("public"."wt_is_admin"() OR ("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "a"
  WHERE (("a"."coach_id" = "auth"."uid"()) AND ("a"."dog_id" = "wt_care_goals"."dog_id")))))));



CREATE POLICY "assigned staff read dogs" ON "public"."wt_dogs" FOR SELECT TO "authenticated" USING (("public"."wt_is_admin"() OR ("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "a"
  WHERE (("a"."coach_id" = "auth"."uid"()) AND ("a"."dog_id" = "wt_dogs"."id")))))));



CREATE POLICY "assigned staff read messages" ON "public"."wt_coach_messages" FOR SELECT TO "authenticated" USING (("public"."wt_is_admin"() OR ("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "a"
  WHERE (("a"."coach_id" = "auth"."uid"()) AND ("a"."dog_id" = "wt_coach_messages"."dog_id")))))));



CREATE POLICY "assigned staff read records" ON "public"."wt_daily_records" FOR SELECT TO "authenticated" USING (("public"."wt_is_admin"() OR ("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "a"
  WHERE (("a"."coach_id" = "auth"."uid"()) AND ("a"."dog_id" = "wt_daily_records"."dog_id")))))));



CREATE POLICY "assigned staff reply" ON "public"."wt_coach_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender" = 'coach'::"text") AND ("public"."wt_is_admin"() OR ("public"."wt_is_coach"() AND (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "a"
  WHERE (("a"."coach_id" = "auth"."uid"()) AND ("a"."dog_id" = "wt_coach_messages"."dog_id") AND ("a"."owner_id" = "wt_coach_messages"."owner_id"))))))));



CREATE POLICY "authenticated read active slots" ON "public"."wt_coach_availability_slots" FOR SELECT TO "authenticated" USING (("active" OR ("coach_id" = "auth"."uid"()) OR "public"."wt_is_admin"()));



CREATE POLICY "authenticated read coach profiles" ON "public"."wt_coach_profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "coaches manage own profile" ON "public"."wt_coach_profiles" TO "authenticated" USING (((("coach_id" = "auth"."uid"()) AND "public"."wt_is_coach"()) OR "public"."wt_is_admin"())) WITH CHECK (((("coach_id" = "auth"."uid"()) AND "public"."wt_is_coach"()) OR "public"."wt_is_admin"()));



CREATE POLICY "coaches manage own slots" ON "public"."wt_coach_availability_slots" TO "authenticated" USING (((("coach_id" = "auth"."uid"()) AND "public"."wt_is_coach"()) OR "public"."wt_is_admin"())) WITH CHECK (((("coach_id" = "auth"."uid"()) AND "public"."wt_is_coach"()) OR "public"."wt_is_admin"()));



CREATE POLICY "owners create coaching applications" ON "public"."wt_coaching_applications" FOR INSERT TO "authenticated" WITH CHECK ((("owner_id" = "auth"."uid"()) AND ("status" = 'submitted'::"text") AND ("assigned_coach_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "d"
  WHERE (("d"."id" = "wt_coaching_applications"."dog_id") AND ("d"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owners delete own dog observation themes" ON "public"."wt_dog_observation_themes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_dog_observation_themes"."dog_id") AND ("dog"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owners insert own daily checks" ON "public"."wt_daily_checks" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_daily_checks"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL)))));



CREATE POLICY "owners insert own dog observation themes" ON "public"."wt_dog_observation_themes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_dog_observation_themes"."dog_id") AND ("dog"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owners insert own observation entries" ON "public"."wt_observation_entries" FOR INSERT TO "authenticated" WITH CHECK ((("deleted_at" IS NULL) AND ("owner_id" = "auth"."uid"()) AND ("source" = 'owner'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_observation_entries"."dog_id") AND ("dog"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owners insert own observation events" ON "public"."wt_observation_events" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_observation_events"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL)))));



CREATE POLICY "owners manage care completions" ON "public"."wt_care_goal_completions" USING (("auth"."uid"() = "owner_id")) WITH CHECK ((("auth"."uid"() = "owner_id") AND (EXISTS ( SELECT 1
   FROM "public"."wt_care_goals" "goal"
  WHERE (("goal"."id" = "wt_care_goal_completions"."goal_id") AND ("goal"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owners manage care goals" ON "public"."wt_care_goals" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "owners manage own contact profile" ON "public"."wt_owner_profiles" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "owners manage own household members" ON "public"."wt_household_members" TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "owners read coaching applications" ON "public"."wt_coaching_applications" FOR SELECT TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR "public"."wt_is_admin"() OR ("public"."wt_is_coach"() AND ("assigned_coach_id" = "auth"."uid"()))));



CREATE POLICY "owners select own daily checks" ON "public"."wt_daily_checks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_daily_checks"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL)))));



CREATE POLICY "owners select own dog observation themes" ON "public"."wt_dog_observation_themes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_dog_observation_themes"."dog_id") AND ("dog"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owners select own observation entries" ON "public"."wt_observation_entries" FOR SELECT TO "authenticated" USING ((("deleted_at" IS NULL) AND ("owner_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_observation_entries"."dog_id") AND ("dog"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owners select own observation events" ON "public"."wt_observation_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_observation_events"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL)))));



CREATE POLICY "owners update own daily checks" ON "public"."wt_daily_checks" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_daily_checks"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_daily_checks"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL)))));



CREATE POLICY "owners update own dog observation themes" ON "public"."wt_dog_observation_themes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_dog_observation_themes"."dog_id") AND ("dog"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_dog_observation_themes"."dog_id") AND ("dog"."owner_id" = "auth"."uid"())))));



CREATE POLICY "owners update own observation entries" ON "public"."wt_observation_entries" FOR UPDATE TO "authenticated" USING ((("deleted_at" IS NULL) AND ("owner_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_observation_entries"."dog_id") AND ("dog"."owner_id" = "auth"."uid"())))))) WITH CHECK ((("deleted_at" IS NULL) AND ("owner_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."wt_dogs" "dog"
  WHERE (("dog"."id" = "wt_observation_entries"."dog_id") AND ("dog"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "owners update own observation events" ON "public"."wt_observation_events" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_observation_events"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wt_observation_entries" "entry"
  WHERE (("entry"."id" = "wt_observation_events"."entry_id") AND ("entry"."owner_id" = "auth"."uid"()) AND ("entry"."deleted_at" IS NULL)))));



CREATE POLICY "participants read online sessions" ON "public"."wt_online_sessions" FOR SELECT TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR ("coach_id" = "auth"."uid"()) OR "public"."wt_is_admin"()));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff read assigned owner profiles" ON "public"."wt_owner_profiles" FOR SELECT TO "authenticated" USING (("public"."wt_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."wt_coach_assignments" "assignment"
  WHERE (("assignment"."owner_id" = "wt_owner_profiles"."user_id") AND ("assignment"."coach_id" = "auth"."uid"()))))));



CREATE POLICY "staff read assignments" ON "public"."wt_coach_assignments" FOR SELECT TO "authenticated" USING (("public"."wt_is_admin"() OR (("coach_id" = "auth"."uid"()) AND "public"."wt_is_coach"())));



CREATE POLICY "users manage own push subscription" ON "public"."push_subscriptions" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "users read own notifications" ON "public"."wt_notifications" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."wt_is_admin"()));



CREATE POLICY "users read own role" ON "public"."wt_user_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users read own subscription" ON "public"."wt_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "users update own notifications" ON "public"."wt_notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."wt_calendar_sync_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_care_goal_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_care_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_coach_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_coach_availability_slots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_coach_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_coach_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_coaching_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_daily_checks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_daily_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_dog_observation_themes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_dogs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_google_calendar_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_google_oauth_states" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_household_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_observation_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_observation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_online_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_owner_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wt_user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ユーザーは自分の購読情報のみ操作可能" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wt_calendar_sync_jobs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wt_coach_availability_slots";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wt_coach_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wt_online_sessions";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_accounts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_accounts"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_accounts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_assign_coaching_application"("target_application_id" "uuid", "target_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_assign_coaching_application"("target_application_id" "uuid", "target_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_assign_coaching_application"("target_application_id" "uuid", "target_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_assign_coaching_application"("target_application_id" "uuid", "target_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_assign_customer"("target_owner_id" "uuid", "target_dog_id" "uuid", "target_coach_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_assign_customer"("target_owner_id" "uuid", "target_dog_id" "uuid", "target_coach_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_assign_customer"("target_owner_id" "uuid", "target_dog_id" "uuid", "target_coach_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_assign_customer"("target_owner_id" "uuid", "target_dog_id" "uuid", "target_coach_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_assign_to_me"("target_owner_id" "uuid", "target_dog_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_assign_to_me"("target_owner_id" "uuid", "target_dog_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_assign_to_me"("target_owner_id" "uuid", "target_dog_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_assign_to_me"("target_owner_id" "uuid", "target_dog_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_coaching_applications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_coaching_applications"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_coaching_applications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_coaching_applications"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_customer_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_customer_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_customer_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_customer_overview"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_remove_assignment"("target_dog_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_remove_assignment"("target_dog_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_remove_assignment"("target_dog_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_remove_assignment"("target_dog_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_set_display_name"("target_user_id" "uuid", "target_display_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_set_display_name"("target_user_id" "uuid", "target_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_set_display_name"("target_user_id" "uuid", "target_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_set_display_name"("target_user_id" "uuid", "target_display_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_set_role"("target_user_id" "uuid", "next_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_set_role"("target_user_id" "uuid", "next_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_set_role"("target_user_id" "uuid", "next_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_set_role"("target_user_id" "uuid", "next_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_admin_update_coaching_status"("target_application_id" "uuid", "next_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_admin_update_coaching_status"("target_application_id" "uuid", "next_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_admin_update_coaching_status"("target_application_id" "uuid", "next_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_admin_update_coaching_status"("target_application_id" "uuid", "next_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_book_online_session"("target_application_id" "uuid", "target_slot_id" "uuid", "requested_session_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_book_online_session"("target_application_id" "uuid", "target_slot_id" "uuid", "requested_session_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_book_online_session"("target_application_id" "uuid", "target_slot_id" "uuid", "requested_session_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_book_online_session"("target_application_id" "uuid", "target_slot_id" "uuid", "requested_session_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_coach_accept_application"("target_application_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_coach_accept_application"("target_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_coach_accept_application"("target_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_coach_accept_application"("target_application_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_coach_assignment_notification_details"("target_application_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_coach_assignment_notification_details"("target_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_coach_assignment_notification_details"("target_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_coach_assignment_notification_details"("target_application_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_coach_decline_application"("target_application_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_coach_decline_application"("target_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_coach_decline_application"("target_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_coach_decline_application"("target_application_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."wt_create_default_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_create_default_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_create_default_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_delete_user_data"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_delete_user_data"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."wt_enqueue_calendar_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_enqueue_calendar_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_enqueue_calendar_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_guard_event_handler"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_guard_event_handler"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_guard_household_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_guard_household_member"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_is_coach"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_is_coach"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_is_coach"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_is_coach"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_is_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_is_staff"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_observation_trends"("target_dog_id" "uuid", "next_timezone" "text", "as_of_local_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_observation_trends"("target_dog_id" "uuid", "next_timezone" "text", "as_of_local_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_observation_trends"("target_dog_id" "uuid", "next_timezone" "text", "as_of_local_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_owner_available_slots"("target_application_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_owner_available_slots"("target_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_owner_available_slots"("target_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_owner_available_slots"("target_application_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_owner_confirm_coach"("target_application_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_owner_confirm_coach"("target_application_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_owner_confirm_coach"("target_application_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_owner_confirm_coach"("target_application_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_owner_onboarding_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_owner_onboarding_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_owner_onboarding_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_owner_onboarding_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_owner_save_daily_check"("target_dog_id" "uuid", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_appetite_score" smallint, "next_sleep_rest_score" smallint, "next_activity_score" smallint, "next_exploration_score" smallint, "next_calmness_score" smallint, "next_toilet_score" smallint, "next_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_owner_save_daily_check"("target_dog_id" "uuid", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_appetite_score" smallint, "next_sleep_rest_score" smallint, "next_activity_score" smallint, "next_exploration_score" smallint, "next_calmness_score" smallint, "next_toilet_score" smallint, "next_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_owner_save_daily_check"("target_dog_id" "uuid", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_appetite_score" smallint, "next_sleep_rest_score" smallint, "next_activity_score" smallint, "next_exploration_score" smallint, "next_calmness_score" smallint, "next_toilet_score" smallint, "next_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_owner_save_observation_event"("target_dog_id" "uuid", "next_theme_key" "text", "next_event_result" "text", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_entry_id" "uuid", "next_handled_by_member_id" "uuid", "next_state_before" "text", "next_environment_key" "text", "next_target_type" "text", "next_distance_band" "text", "next_intensity" smallint, "next_duration_seconds" integer, "next_owner_response_keys" "text"[], "next_outcome" "text", "next_recovery_seconds" integer, "next_note" "text", "next_theme_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_owner_save_observation_event"("target_dog_id" "uuid", "next_theme_key" "text", "next_event_result" "text", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_entry_id" "uuid", "next_handled_by_member_id" "uuid", "next_state_before" "text", "next_environment_key" "text", "next_target_type" "text", "next_distance_band" "text", "next_intensity" smallint, "next_duration_seconds" integer, "next_owner_response_keys" "text"[], "next_outcome" "text", "next_recovery_seconds" integer, "next_note" "text", "next_theme_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_owner_save_observation_event"("target_dog_id" "uuid", "next_theme_key" "text", "next_event_result" "text", "next_occurred_at" timestamp with time zone, "next_timezone" "text", "next_entry_id" "uuid", "next_handled_by_member_id" "uuid", "next_state_before" "text", "next_environment_key" "text", "next_target_type" "text", "next_distance_band" "text", "next_intensity" smallint, "next_duration_seconds" integer, "next_owner_response_keys" "text"[], "next_outcome" "text", "next_recovery_seconds" integer, "next_note" "text", "next_theme_data" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_owner_soft_delete_observation_entry"("p_entry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_owner_soft_delete_observation_entry"("p_entry_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."wt_owner_soft_delete_observation_entry"("p_entry_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."wt_prepare_observation_entry"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_prepare_observation_entry"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_staff_availability_slots"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_staff_availability_slots"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_staff_availability_slots"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_staff_availability_slots"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_staff_create_availability_slot"("target_coach_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_staff_create_availability_slot"("target_coach_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."wt_staff_create_availability_slot"("target_coach_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_staff_create_availability_slot"("target_coach_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_staff_delete_availability_slot"("target_slot_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_staff_delete_availability_slot"("target_slot_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_staff_delete_availability_slot"("target_slot_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_staff_delete_availability_slot"("target_slot_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_staff_online_sessions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_staff_online_sessions"() TO "anon";
GRANT ALL ON FUNCTION "public"."wt_staff_online_sessions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_staff_online_sessions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_staff_update_availability_slot"("target_slot_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_staff_update_availability_slot"("target_slot_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."wt_staff_update_availability_slot"("target_slot_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_staff_update_availability_slot"("target_slot_id" "uuid", "next_starts_at" timestamp with time zone, "next_ends_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_staff_update_online_session"("target_session_id" "uuid", "next_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_staff_update_online_session"("target_session_id" "uuid", "next_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."wt_staff_update_online_session"("target_session_id" "uuid", "next_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."wt_staff_update_online_session"("target_session_id" "uuid", "next_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_touch_observation_theme"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_touch_observation_theme"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."wt_validate_observation_subtype"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."wt_validate_observation_subtype"() TO "service_role";


















GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."wt_calendar_sync_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."wt_care_goal_completions" TO "anon";
GRANT ALL ON TABLE "public"."wt_care_goal_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_care_goal_completions" TO "service_role";



GRANT ALL ON TABLE "public"."wt_care_goals" TO "anon";
GRANT ALL ON TABLE "public"."wt_care_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_care_goals" TO "service_role";



GRANT ALL ON TABLE "public"."wt_coach_assignments" TO "anon";
GRANT ALL ON TABLE "public"."wt_coach_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_coach_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."wt_coach_availability_slots" TO "anon";
GRANT ALL ON TABLE "public"."wt_coach_availability_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_coach_availability_slots" TO "service_role";



GRANT ALL ON TABLE "public"."wt_coach_messages" TO "anon";
GRANT ALL ON TABLE "public"."wt_coach_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_coach_messages" TO "service_role";



GRANT ALL ON TABLE "public"."wt_coach_profiles" TO "anon";
GRANT ALL ON TABLE "public"."wt_coach_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_coach_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."wt_coaching_applications" TO "anon";
GRANT ALL ON TABLE "public"."wt_coaching_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_coaching_applications" TO "service_role";



GRANT ALL ON TABLE "public"."wt_daily_checks" TO "anon";
GRANT ALL ON TABLE "public"."wt_daily_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_daily_checks" TO "service_role";



GRANT ALL ON TABLE "public"."wt_daily_records" TO "anon";
GRANT ALL ON TABLE "public"."wt_daily_records" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_daily_records" TO "service_role";



GRANT ALL ON TABLE "public"."wt_dog_observation_themes" TO "anon";
GRANT ALL ON TABLE "public"."wt_dog_observation_themes" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_dog_observation_themes" TO "service_role";



GRANT ALL ON TABLE "public"."wt_dogs" TO "anon";
GRANT ALL ON TABLE "public"."wt_dogs" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_dogs" TO "service_role";



GRANT ALL ON TABLE "public"."wt_google_calendar_connections" TO "service_role";



GRANT ALL ON TABLE "public"."wt_google_oauth_states" TO "service_role";



GRANT ALL ON TABLE "public"."wt_household_members" TO "anon";
GRANT ALL ON TABLE "public"."wt_household_members" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_household_members" TO "service_role";



GRANT ALL ON TABLE "public"."wt_notifications" TO "anon";
GRANT ALL ON TABLE "public"."wt_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."wt_observation_entries" TO "anon";
GRANT ALL ON TABLE "public"."wt_observation_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_observation_entries" TO "service_role";



GRANT ALL ON TABLE "public"."wt_observation_events" TO "anon";
GRANT ALL ON TABLE "public"."wt_observation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_observation_events" TO "service_role";



GRANT ALL ON TABLE "public"."wt_online_sessions" TO "anon";
GRANT ALL ON TABLE "public"."wt_online_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_online_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."wt_owner_profiles" TO "anon";
GRANT ALL ON TABLE "public"."wt_owner_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_owner_profiles" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wt_subscriptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wt_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."wt_user_roles" TO "anon";
GRANT ALL ON TABLE "public"."wt_user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."wt_user_roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "wt_on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."wt_create_default_role"();



CREATE POLICY "coaches delete own avatar" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'coach-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "public"."wt_is_staff"()));



CREATE POLICY "coaches update own avatar" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'coach-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "public"."wt_is_staff"())) WITH CHECK ((("bucket_id" = 'coach-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "public"."wt_is_staff"()));



CREATE POLICY "coaches upload own avatar" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'coach-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text") AND "public"."wt_is_staff"()));



CREATE POLICY "owners delete own dog avatar" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'dog-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "owners update own dog avatar" ON "storage"."objects" FOR UPDATE TO "authenticated" USING ((("bucket_id" = 'dog-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"))) WITH CHECK ((("bucket_id" = 'dog-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "owners upload own dog avatar" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'dog-avatars'::"text") AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));



CREATE POLICY "public read coach avatars" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'coach-avatars'::"text"));



CREATE POLICY "public read dog avatars" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'dog-avatars'::"text"));




-- Required system configuration that schema-only squash does not preserve.
-- These rows define application Storage buckets and are not production user data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('coach-avatars', 'coach-avatars', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('dog-avatars', 'dog-avatars', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Legacy public schema retained only so a fresh database matches production.
-- WanTone does not use these relations for new development. No production rows are included.
create table public."CUSTOMERS" (
  id bigint generated by default as identity primary key,
  dog_name text not null,
  dog_breed text,
  birthday date,
  owner_name text
);
alter table public."CUSTOMERS" enable row level security;

create table public.dogs (
  id bigint generated by default as identity primary key,
  name text not null,
  breed text,
  birthday date
);
alter table public.dogs enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null,
  content text,
  media_url text,
  media_type text check (media_type = any (array['image'::text, 'video'::text])),
  created_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.messages enable row level security;
create policy "メッセージの作成許可" on public.messages for insert with check (auth.uid() = user_id);
create policy "メッセージの参照許可" on public.messages for select using (true);
alter publication supabase_realtime add table only public.messages;

-- Preserve production's restricted direct table grants.
revoke all on table public.wt_calendar_sync_jobs from anon, authenticated;
revoke all on table public.wt_google_calendar_connections from anon, authenticated;
revoke all on table public.wt_google_oauth_states from anon, authenticated;
revoke insert, update, delete on table public.wt_subscriptions from anon, authenticated;
