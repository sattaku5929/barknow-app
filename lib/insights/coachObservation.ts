import { supabase } from "@/app/supabase";
import type { EventResult, EventTheme } from "@/lib/observations/observationEvent";
import { loadObservationTrends } from "./observationTrends";
import type { ObservationTrends } from "./trendTypes";

export type CoachEvent = {
  id: string; localDate: string; occurredAt: string; themeKey: EventTheme;
  result: EventResult; note: string; handlerId: string | null;
  stateBefore: string | null; environment: string | null; targetType: string | null;
  distanceBand: string | null; intensity: number | null; durationSeconds: number | null;
  ownerResponseKeys: string[] | null; outcome: string | null; recoverySeconds: number | null;
  themeData: Record<string, string>;
};

export function currentObservationCounts(trends: ObservationTrends) {
  const overall = trends.event_overall.find((row) => row.period === "current");
  return {
    events: overall?.total_count ?? 0,
    concerns: overall?.concern_count ?? 0,
    dailyDays: Math.max(0, ...trends.daily_metrics.filter((row) => row.period === "current").map((row) => row.entered_days)),
  };
}

export async function loadCoachDogStats(dogId: string) {
  // The invoker RPC verifies a current assignment and aggregates only RLS-visible rows.
  const trends = await loadObservationTrends(dogId);
  const { data, error } = await supabase.from("wt_observation_entries")
    .select("local_date").eq("dog_id", dogId).is("deleted_at", null)
    .order("local_date", { ascending: false }).limit(1);
  if (error) throw error;
  return { ...currentObservationCounts(trends), latestDate: data?.[0]?.local_date ?? null };
}

export async function loadCoachObservation(dogId: string, ownerId: string) {
  // Do not request any event or household rows after the assignment check fails.
  const trends = await loadObservationTrends(dogId);
  const [eventsResult, themesResult] = await Promise.all([
    supabase.from("wt_observation_entries")
      .select("id,local_date,occurred_at,theme_key,note,wt_observation_events!inner(event_result,handled_by_member_id,state_before,environment_key,target_type,distance_band,intensity,duration_seconds,owner_response_keys,outcome,recovery_seconds,theme_data)")
      .eq("dog_id", dogId).eq("entry_kind", "event").is("deleted_at", null)
      .gte("local_date", trends.previous_start).lte("local_date", trends.as_of_local_date)
      .order("occurred_at", { ascending: false }).limit(60),
    supabase.from("wt_dog_observation_themes").select("theme_key")
      .eq("dog_id", dogId).order("sort_order"),
  ]);
  if (eventsResult.error || themesResult.error) throw eventsResult.error ?? themesResult.error;
  const events: CoachEvent[] = (eventsResult.data ?? []).map((entry) => {
    const detail = Array.isArray(entry.wt_observation_events) ? entry.wt_observation_events[0] : entry.wt_observation_events;
    return {
      id: entry.id, localDate: entry.local_date, occurredAt: entry.occurred_at,
      themeKey: entry.theme_key as EventTheme, result: detail.event_result as EventResult,
      note: entry.note ?? "", handlerId: detail.handled_by_member_id,
      stateBefore: detail.state_before, environment: detail.environment_key,
      targetType: detail.target_type, distanceBand: detail.distance_band,
      intensity: detail.intensity, durationSeconds: detail.duration_seconds,
      ownerResponseKeys: detail.owner_response_keys, outcome: detail.outcome,
      recoverySeconds: detail.recovery_seconds,
      themeData: detail.theme_data && typeof detail.theme_data === "object" && !Array.isArray(detail.theme_data)
        ? detail.theme_data as Record<string, string> : {},
    };
  });
  const memberIds = [...new Set(events.map((entry) => entry.handlerId).filter((id): id is string => Boolean(id)))];
  const members = new Map<string, string>();
  if (memberIds.length) {
    const { data, error } = await supabase.from("wt_household_members")
      .select("id,display_name,deleted_at").eq("owner_id", ownerId).in("id", memberIds);
    if (error) throw error;
    for (const member of data ?? []) members.set(member.id, `${member.display_name}${member.deleted_at ? "（削除済み）" : ""}`);
  }
  return { trends, events, members, selectedThemes: (themesResult.data ?? []).map((row) => row.theme_key as EventTheme) };
}
