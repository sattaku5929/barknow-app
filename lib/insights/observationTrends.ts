import { supabase } from "@/app/supabase";
import type { ObservationTrends } from "./trendTypes";

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
