import { supabase } from "@/app/supabase";

export const eventThemes = [
  { key: "barking", label: "吠え" }, { key: "walk", label: "お散歩" },
  { key: "alone", label: "お留守番" }, { key: "toilet", label: "トイレ" },
  { key: "dog_reaction", label: "他の犬への反応" }, { key: "person_reaction", label: "人への反応" },
  { key: "biting", label: "甘噛み・噛み" }, { key: "meal", label: "食事" },
  { key: "sleep_rest", label: "睡眠・休息" }, { key: "grooming", label: "ケア・お手入れ" },
] as const;
export type EventTheme = (typeof eventThemes)[number]["key"];
export type EventResult = "success" | "neutral" | "concern";
export type HouseholdMember = { id: string; display_name: string; relation_key: string; sort_order: number; deleted_at: string | null };
export type ObservationEvent = {
  id: string; themeKey: EventTheme; result: EventResult; occurredAt: string; note: string;
  handlerId: string | null; stateBefore: string | null; environment: string | null;
  targetType: string | null; distanceBand: string | null; intensity: number | null;
  durationSeconds: number | null; ownerResponseKeys: string[] | null; outcome: string | null;
  recoverySeconds: number | null; themeData: Record<string, string>;
};

export async function loadEventThemes(dogId: string): Promise<EventTheme[]> {
  const { data, error } = await supabase.from("wt_dog_observation_themes")
    .select("theme_key").eq("dog_id", dogId).order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => row.theme_key as EventTheme).filter((key) => eventThemes.some((theme) => theme.key === key));
}

export async function loadHouseholdMembers(includeArchived = false): Promise<HouseholdMember[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Sign-in required");
  let query = supabase.from("wt_household_members")
    .select("id,display_name,relation_key,sort_order,deleted_at").eq("owner_id", user.id);
  if (!includeArchived) query = query.is("deleted_at", null);
  const { data, error } = await query.order("sort_order").order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function loadEvents(dogId: string, date: string): Promise<ObservationEvent[]> {
  const { data, error } = await supabase.from("wt_observation_entries")
    .select("id,theme_key,occurred_at,note,wt_observation_events(event_result,handled_by_member_id,state_before,environment_key,target_type,distance_band,intensity,duration_seconds,owner_response_keys,outcome,recovery_seconds,theme_data)")
    .eq("dog_id", dogId).eq("entry_kind", "event").eq("local_date", date)
    .is("deleted_at", null).order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((entry) => {
    const detail = Array.isArray(entry.wt_observation_events) ? entry.wt_observation_events[0] : entry.wt_observation_events;
    if (!detail) throw new Error("Event detail is missing");
    return {
      id: entry.id, themeKey: entry.theme_key as EventTheme, result: detail.event_result as EventResult,
      occurredAt: entry.occurred_at, note: entry.note ?? "", handlerId: detail.handled_by_member_id,
      stateBefore: detail.state_before, environment: detail.environment_key,
      targetType: detail.target_type, distanceBand: detail.distance_band, intensity: detail.intensity,
      durationSeconds: detail.duration_seconds, ownerResponseKeys: detail.owner_response_keys,
      outcome: detail.outcome, recoverySeconds: detail.recovery_seconds,
      themeData: typeof detail.theme_data === "object" && detail.theme_data !== null && !Array.isArray(detail.theme_data)
        ? detail.theme_data as Record<string, string> : {},
    };
  });
}

export async function saveObservationEvent(dogId: string, event: ObservationEvent) {
  const { data, error } = await supabase.rpc("wt_owner_save_observation_event", {
    target_dog_id: dogId, next_entry_id: event.id || null,
    next_theme_key: event.themeKey, next_event_result: event.result,
    next_occurred_at: event.occurredAt,
    next_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
    next_handled_by_member_id: event.handlerId, next_state_before: event.stateBefore,
    next_environment_key: event.environment, next_target_type: event.targetType,
    next_distance_band: event.distanceBand, next_intensity: event.intensity,
    next_duration_seconds: event.durationSeconds, next_owner_response_keys: event.ownerResponseKeys,
    next_outcome: event.outcome, next_recovery_seconds: event.recoverySeconds,
    next_note: event.note.trim() || null, next_theme_data: event.themeData,
  });
  if (error) throw error;
  return data as string;
}
