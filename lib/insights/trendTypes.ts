import type { EventTheme } from "@/lib/observations/observationEvent";

export type TrendPeriod = "current" | "previous";
export type EventCount = {
  period: TrendPeriod; total_count: number; success_count: number;
  neutral_count: number; concern_count: number; concern_rate: number;
};
export type ThemeTrend = EventCount & {
  theme_key: EventTheme; success_rate: number; neutral_rate: number;
};
export type HandlerTrend = ThemeTrend & {
  handled_by_member_id: string; display_name: string; archived: boolean;
};
export type DistanceTrend = {
  period: TrendPeriod; theme_key: EventTheme; distance_band: string;
  total_count: number; concern_count: number; concern_rate: number;
};
export type NumericTrend = {
  period: TrendPeriod; theme_key: EventTheme;
  intensity_count: number; intensity_avg: number | null; intensity_median: number | null;
  recovery_count: number; recovery_avg_seconds: number | null; recovery_median_seconds: number | null;
};
export type DailyMetricKey =
  "appetite_score" | "sleep_rest_score" | "activity_score" |
  "exploration_score" | "calmness_score" | "toilet_score";
export type DailyTrend = {
  period: TrendPeriod; metric_key: DailyMetricKey; entered_days: number;
  average_score: number; median_score: number; minimum_score: number; maximum_score: number;
};
export type DailyEventDay = {
  local_date: string; calmness_score: number | null; event_count: number; concern_count: number;
};
export type ObservationTrends = {
  as_of_local_date: string; current_start: string; previous_start: string; previous_end: string;
  event_overall: EventCount[]; event_themes: ThemeTrend[]; handlers: HandlerTrend[];
  distances: DistanceTrend[]; numeric_metrics: NumericTrend[];
  daily_metrics: DailyTrend[]; daily_event_days: DailyEventDay[];
};
