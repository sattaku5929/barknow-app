import { supabase } from "@/app/supabase";

export type DailyCheckScores = {
  appetite: number | null;
  sleepRest: number | null;
  activity: number | null;
  exploration: number | null;
  calmness: number | null;
  toilet: number | null;
};

export type DailyCheck = {
  id: string;
  note: string;
  time: string;
  scores: DailyCheckScores;
};

export const emptyDailyCheckScores = (): DailyCheckScores => ({
  appetite: null, sleepRest: null, activity: null,
  exploration: null, calmness: null, toilet: null,
});

export function deviceLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function deviceLocalTime(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export async function loadDailyCheck(dogId: string, localDate: string): Promise<DailyCheck | null> {
  const { data, error } = await supabase.from("wt_observation_entries")
    .select("id,note,occurred_at,wt_daily_checks(appetite_score,sleep_rest_score,activity_score,exploration_score,calmness_score,toilet_score)")
    .eq("dog_id", dogId).eq("entry_kind", "daily_check")
    .eq("local_date", localDate).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const check = Array.isArray(data.wt_daily_checks) ? data.wt_daily_checks[0] : data.wt_daily_checks;
  if (!check) throw new Error("Daily check detail is missing");
  return {
    id: data.id,
    note: data.note ?? "",
    time: deviceLocalTime(new Date(data.occurred_at)),
    scores: {
      appetite: check.appetite_score ?? null,
      sleepRest: check.sleep_rest_score ?? null,
      activity: check.activity_score ?? null,
      exploration: check.exploration_score ?? null,
      calmness: check.calmness_score ?? null,
      toilet: check.toilet_score ?? null,
    },
  };
}

export async function saveDailyCheck(dogId: string, localDate: string, localTime: string, scores: DailyCheckScores, note: string) {
  const occurredAt = new Date(`${localDate}T${localTime}:00`);
  if (Number.isNaN(occurredAt.getTime())) throw new Error("Invalid date");
  const { data, error } = await supabase.rpc("wt_owner_save_daily_check", {
    target_dog_id: dogId,
    next_occurred_at: occurredAt.toISOString(),
    next_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
    next_appetite_score: scores.appetite,
    next_sleep_rest_score: scores.sleepRest,
    next_activity_score: scores.activity,
    next_exploration_score: scores.exploration,
    next_calmness_score: scores.calmness,
    next_toilet_score: scores.toilet,
    next_note: note.trim() || null,
  });
  if (error) throw error;
  return data as string;
}
