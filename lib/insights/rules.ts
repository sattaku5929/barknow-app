import type { HandlerTrend, ObservationTrends, ThemeTrend } from "./trendTypes";
import type { EventTheme } from "@/lib/observations/observationEvent";

export type InsightCandidate = {
  kind: "reference" | "trend" | "period" | "handler" | "daily";
  text: string;
  evidence: string;
  themeKey?: EventTheme;
  period?: "current" | "previous";
  handlerIds?: string[];
};

export function evidenceLevel(count: number): "collecting" | "reference" | "trend" | "comparison" {
  if (count < 3) return "collecting";
  if (count < 6) return "reference";
  if (count < 10) return "trend";
  return "comparison";
}

export function eligiblePeriods(current: number, previous: number): boolean {
  return current >= 3 && previous >= 3 && current + previous >= 10;
}

export function comparableHandlers(trends: ObservationTrends, theme: ThemeTrend): [HandlerTrend, HandlerTrend] | null {
  if (theme.total_count < 10) return null;
  const handlers = trends.handlers.filter((row) => row.period === "current" && row.theme_key === theme.theme_key && row.total_count >= 3)
    .sort((a, b) => b.success_rate - a.success_rate);
  for (const higher of handlers) {
    for (const lower of [...handlers].reverse()) {
      if (higher.handled_by_member_id !== lower.handled_by_member_id &&
          higher.total_count <= lower.total_count * 3 && lower.total_count <= higher.total_count * 3 &&
          higher.success_rate - lower.success_rate >= 20) return [higher, lower];
    }
  }
  return null;
}

export function insightCandidates(trends: ObservationTrends, labelForTheme: (key: string) => string): InsightCandidate[] {
  const candidates: InsightCandidate[] = [];
  const previousThemes = new Map(trends.event_themes.filter((row) => row.period === "previous")
    .map((row) => [row.theme_key, row]));

  for (const current of trends.event_themes.filter((row) => row.period === "current")) {
    if (current.total_count < 3) continue;
    const label = labelForTheme(current.theme_key);
    const previous = previousThemes.get(current.theme_key) as ThemeTrend | undefined;

    if (previous && eligiblePeriods(current.total_count, previous.total_count) &&
        Math.abs(current.concern_rate - previous.concern_rate) >= 10) {
      const direction = current.concern_rate > previous.concern_rate ? "高め" : "低め";
      candidates.push({
        kind: "period",
        text: `「${label}」では、“気になった”記録の割合が前の7日間より${direction}です。`,
        evidence: `直近 ${current.concern_count}/${current.total_count}件（${current.concern_rate}%）、前の7日間 ${previous.concern_count}/${previous.total_count}件（${previous.concern_rate}%）。遭遇機会や記録頻度は比較していません。`,
        themeKey: current.theme_key,
      });
    }

    if (current.concern_count >= 2 && current.concern_rate >= 40) {
      candidates.push({
        kind: "trend",
        text: `「${label}」では、“気になった”記録がやや目立っています。`,
        evidence: `直近7日間の ${current.concern_count}/${current.total_count}件（${current.concern_rate}%）が「気になった」でした。`,
        themeKey: current.theme_key,
        period: "current",
      });
    } else if (current.success_count >= 3 && current.success_rate >= 60) {
      candidates.push({
        kind: "trend",
        text: `「${label}」では、“うまくできた”記録が多めです。`,
        evidence: `直近7日間の ${current.success_count}/${current.total_count}件（${current.success_rate}%）が「うまくできた」でした。`,
        themeKey: current.theme_key,
        period: "current",
      });
    }

    const comparison = comparableHandlers(trends, current);
    if (comparison) {
      const [higher, lower] = comparison;
      const higherName = `${higher.display_name}${higher.archived ? "（削除済み）" : ""}`;
      const lowerName = `${lower.display_name}${lower.archived ? "（削除済み）" : ""}`;
      candidates.push({
        kind: "handler",
        text: `「${label}」では、${higherName}が担当した記録の“うまくできた”割合が高めです。`,
        evidence: `${higherName} ${higher.success_count}/${higher.total_count}件（${higher.success_rate}%）、${lowerName} ${lower.success_count}/${lower.total_count}件（${lower.success_rate}%）。担当者以外の条件は揃っていません。`,
        themeKey: current.theme_key,
        period: "current",
        handlerIds: [higher.handled_by_member_id, lower.handled_by_member_id],
      });
    }
  }

  const previousDaily = new Map(trends.daily_metrics.filter((row) => row.period === "previous").map((row) => [row.metric_key, row]));
  const dailyChanges = trends.daily_metrics.filter((row) => row.period === "current").flatMap((current) => {
    const previous = previousDaily.get(current.metric_key);
    if (!previous || !eligiblePeriods(current.entered_days, previous.entered_days)) return [];
    const difference = current.average_score - previous.average_score;
    return Math.abs(difference) >= .5 ? [{ current, previous, difference }] : [];
  }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

  if (dailyChanges.length) {
    const { current, previous, difference } = dailyChanges[0];
    const labelMap: Record<string, string> = {
      appetite_score: "食欲", sleep_rest_score: "睡眠・休息", activity_score: "活動・運動",
      exploration_score: "探索・におい嗅ぎ", calmness_score: "落ち着き", toilet_score: "トイレ",
    };
    candidates.push({
      kind: "daily",
      text: `Daily Checkの「${labelMap[current.metric_key]}」は、前の7日間より少し${difference > 0 ? "高め" : "低め"}です。`,
      evidence: `直近 ${current.entered_days}日・平均${current.average_score}、前の7日間 ${previous.entered_days}日・平均${previous.average_score}。未入力日は除いています。`,
    });
  }

  return candidates;
}
