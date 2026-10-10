import type { SupabaseClient } from "@supabase/supabase-js";

export function japanRecordDate(timestamp: string): string | null {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function countRecordedDays(observations: readonly { occurred_at: string }[], legacy: readonly { recorded_on: string }[]): number {
  const dates = new Set<string>();
  for (const row of observations) {
    const date = japanRecordDate(row.occurred_at);
    if (date) dates.add(date);
  }
  for (const row of legacy) if (/^\d{4}-\d{2}-\d{2}$/.test(row.recorded_on)) dates.add(row.recorded_on);
  return dates.size;
}

async function readPages<T>(query: (from: number, to: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await query(start, start + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

// Count all recorded dates for this dog, not just the legacy seven-day report.
// Read through normal owner RLS; deleted observations and care ticks are excluded.
export async function loadRecordedDays(client: SupabaseClient, dogId: string): Promise<number> {
  const [observations, legacy] = await Promise.all([
    readPages<{occurred_at: string}>((a,b) => client.from("wt_observation_entries").select("occurred_at")
      .eq("dog_id", dogId).in("entry_kind", ["daily_check", "event"]).is("deleted_at", null).order("id").range(a,b)),
    readPages<{recorded_on: string}>((a,b) => client.from("wt_daily_records").select("recorded_on")
      .eq("dog_id", dogId).order("id").range(a,b)),
  ]);
  return countRecordedDays(observations, legacy);
}
