import { supabase } from "@/app/supabase";
import type { EventResult, EventTheme } from "@/lib/observations/observationEvent";
import type { ObservationTrends, TrendPeriod } from "./trendTypes";

export type InsightEvent = {
  id: string; localDate: string; occurredAt: string; themeKey: EventTheme;
  result: EventResult; note: string; handlerId: string | null;
};

export type InsightFilter = {
  themeKey?: EventTheme; period?: TrendPeriod; handlerIds?: string[];
};

export async function loadInsightEvents(dogId: string, trends: ObservationTrends, filter: InsightFilter): Promise<InsightEvent[]> {
  const events: InsightEvent[] = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    let query = supabase.from("wt_observation_entries")
      .select("id,local_date,occurred_at,theme_key,note,wt_observation_events!inner(event_result,handled_by_member_id)", { count: "exact" })
      .eq("dog_id", dogId).eq("entry_kind", "event").is("deleted_at", null)
      .gte("local_date", filter.period === "current" ? trends.current_start : trends.previous_start)
      .lte("local_date", filter.period === "previous" ? trends.previous_end : trends.as_of_local_date)
      .order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + pageSize - 1);
    if (filter.themeKey) query = query.eq("theme_key", filter.themeKey);
    if (filter.handlerIds?.length) query = query.in("wt_observation_events.handled_by_member_id", filter.handlerIds);
    const { data, error, count } = await query;
    if (error) throw error;
    const rows = data ?? [];
    events.push(...rows.map((entry) => {
      const detail = Array.isArray(entry.wt_observation_events) ? entry.wt_observation_events[0] : entry.wt_observation_events;
      return {
        id: entry.id, localDate: entry.local_date, occurredAt: entry.occurred_at,
        themeKey: entry.theme_key as EventTheme, result: detail.event_result as EventResult,
        note: entry.note ?? "", handlerId: detail.handled_by_member_id,
      };
    }));
    offset += rows.length;
    if (!rows.length || (count !== null ? offset >= count : rows.length < pageSize)) return events;
  }
}
