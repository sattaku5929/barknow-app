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
    const level = evidenceLevel(current.total_count);
    if (level === "collecting") continue;
    const label = labelForTheme(current.theme_key);
    candidates.push({
      kind: level === "reference" ? "reference" : "trend",
      text: `「${label}」の記録が${current.total_count}件あります。`,
      evidence: level === "reference" ? "参考傾向として表示しています。" : "直近7日間の記録です。",
      themeKey: current.theme_key,
      period: "current",
    });
    const previous = previousThemes.get(current.theme_key) as ThemeTrend | undefined;
    if (previous && eligiblePeriods(current.total_count, previous.total_count) &&
        Math.abs(current.concern_rate - previous.concern_rate) >= 10) {
      const direction = current.concern_rate > previous.concern_rate ? "高い" : "低い";
      candidates.push({
        kind: "period",
        text: `記録では、「${label}」の「気になった」割合が前の7日間より${direction}ようです。`,
        evidence: `直近 ${current.concern_count}/${current.total_count}件（${current.concern_rate}%）、前期間 ${previous.concern_count}/${previous.total_count}件（${previous.concern_rate}%）。遭遇機会や記録頻度は比較できません。`,
        themeKey: current.theme_key,
      });
    }
    const comparison = comparableHandlers(trends, current);
    if (comparison) {
      const [higher, lower] = comparison;
      const higherName = `${higher.display_name}${higher.archived ? "（削除済み）" : ""}`;
      const lowerName = `${lower.display_name}${lower.archived ? "（削除済み）" : ""}`;
      candidates.push({
        kind: "handler",
        text: `記録では、「${label}」で${higherName}が担当したときの「うまくできた」割合が高いようです。`,
        evidence: `${higherName} ${higher.success_count}/${higher.total_count}件（${higher.success_rate}%）、${lowerName} ${lower.success_count}/${lower.total_count}件（${lower.success_rate}%）。担当者以外の条件は揃っていません。`,
        themeKey: current.theme_key,
        period: "current",
        handlerIds: [higher.handled_by_member_id, lower.handled_by_member_id],
      });
    }
  }
  const current = trends.daily_metrics.find((row) => row.period === "current" && row.metric_key === "calmness_score");
  const previous = trends.daily_metrics.find((row) => row.period === "previous" && row.metric_key === "calmness_score");
  if (current && previous && eligiblePeriods(current.entered_days, previous.entered_days) &&
      Math.abs(current.average_score - previous.average_score) >= 0.5) {
    const direction = current.average_score > previous.average_score ? "高い" : "低い";
    candidates.push({
      kind: "daily",
      text: `直近7日間の「落ち着き」は、前の7日間より少し${direction}記録になっています。`,
      evidence: `直近 ${current.entered_days}日・平均${current.average_score}、前期間 ${previous.entered_days}日・平均${previous.average_score}。未入力日は除いています。`,
    });
  }
  return candidates;
}
