import { eventThemes } from "@/lib/observations/observationEvent";
import type { EventTheme } from "@/lib/observations/observationEvent";
import { comparableHandlers, insightCandidates } from "./rules";
import type { DailyMetricKey, DailyTrend, ObservationTrends, ThemeTrend } from "./trendTypes";
import type { EventResult } from "@/lib/observations/observationEvent";

export const eventResultLabels: Record<EventResult, string> = {
  success: "うまくできた", neutral: "いつも通り", concern: "気になった",
};

export const dailyLabels: Record<DailyMetricKey, string> = {
  appetite_score: "食欲", sleep_rest_score: "睡眠・休息", activity_score: "活動・運動",
  exploration_score: "探索・におい嗅ぎ", calmness_score: "落ち着き", toilet_score: "トイレ",
};

export function themeLabel(key: string): string {
  return eventThemes.find((item) => item.key === key)?.label ?? "できごと";
}

export function orderedThemes(trends: ObservationTrends, selected: EventTheme[]): ThemeTrend[] {
  const order = new Map(selected.map((key, index) => [key, index]));
  return trends.event_themes.filter((row) => row.period === "current")
    .sort((a, b) => (order.get(a.theme_key) ?? 100) - (order.get(b.theme_key) ?? 100) || b.total_count - a.total_count);
}

export function featuredDaily(trends: ObservationTrends): { current: DailyTrend; previous?: DailyTrend; compare: boolean }[] {
  const previous = new Map(trends.daily_metrics.filter((row) => row.period === "previous").map((row) => [row.metric_key, row]));
  return trends.daily_metrics.filter((row) => row.period === "current")
    .map((current) => {
      const before = previous.get(current.metric_key);
      const compare = Boolean(before && current.entered_days >= 3 && before.entered_days >= 3 &&
        current.entered_days + before.entered_days >= 10);
      return { current, previous: before, compare };
    })
    .sort((a, b) => (b.compare ? Math.abs(b.current.average_score - b.previous!.average_score) : -1) -
      (a.compare ? Math.abs(a.current.average_score - a.previous!.average_score) : -1) ||
      (a.current.metric_key === "calmness_score" ? -1 : b.current.metric_key === "calmness_score" ? 1 : 0))
;
}

export function featuredInsights(trends: ObservationTrends) {
  const rank = { handler: 0, period: 1, daily: 2, trend: 3, reference: 4 };
  const sorted = insightCandidates(trends, themeLabel).sort((a, b) => rank[a.kind] - rank[b.kind]);
  const featured = sorted.filter((item) => !(item.kind === "trend" || item.kind === "reference") ||
    !sorted.some((other) => other.themeKey === item.themeKey && (other.kind === "handler" || other.kind === "period")));
  return featured.slice(0, 3);
}

export function handlerComparisons(trends: ObservationTrends) {
  return trends.event_themes.filter((row) => row.period === "current")
    .flatMap((theme) => {
      const handlers = comparableHandlers(trends, theme);
      return handlers ? [{ theme, handlers }] : [];
    });
}
