import { supabase } from "@/app/supabase";
import type { DailyCheckDay, ObservationTrends } from "./trendTypes";

export async function loadObservationTrends(dogId: string): Promise<ObservationTrends> {
  const { data, error } = await supabase.rpc("wt_observation_trends", {
    target_dog_id: dogId,
    next_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      !Array.isArray(data.event_themes) || !Array.isArray(data.daily_metrics) ||
      !Array.isArray(data.handlers) || !Array.isArray(data.daily_event_days)) {
    throw new Error("Observation trends response is unavailable");
  }
  return data as ObservationTrends;
}

export async function loadObservationDailyDays(
  dogId: string,
  startDate: string,
  endDate: string,
): Promise<DailyCheckDay[]> {
  const { data, error } = await supabase
    .from("wt_observation_entries")
    .select("local_date,wt_daily_checks!inner(appetite_score,sleep_rest_score,activity_score,exploration_score,calmness_score,toilet_score)")
    .eq("dog_id", dogId)
    .eq("entry_kind", "daily_check")
    .is("deleted_at", null)
    .gte("local_date", startDate)
    .lte("local_date", endDate)
    .order("local_date", { ascending: true });
  if (error) throw error;

  return (data ?? []).flatMap((entry) => {
    const detail = Array.isArray(entry.wt_daily_checks) ? entry.wt_daily_checks[0] : entry.wt_daily_checks;
    if (!detail) return [];
    return [{
      local_date: entry.local_date,
      appetite_score: detail.appetite_score ?? null,
      sleep_rest_score: detail.sleep_rest_score ?? null,
      activity_score: detail.activity_score ?? null,
      exploration_score: detail.exploration_score ?? null,
      calmness_score: detail.calmness_score ?? null,
      toilet_score: detail.toilet_score ?? null,
    }];
  });
}
