import { themeLabel } from "@/lib/insights/presentation";
import { eligiblePeriods } from "@/lib/insights/rules";
import type { DailyCheckDay, ObservationTrends } from "@/lib/insights/trendTypes";
import { averageCondition } from "./DailyCheckHistoryChart";

function between(days: DailyCheckDay[], start: string, end: string) {
  return days.filter((day) => day.local_date >= start && day.local_date <= end);
}

function formatValue(value: number | null, suffix = "") {
  return value === null ? "–" : `${value.toFixed(1)}${suffix}`;
}

function changeLabel(current: number | null, previous: number | null, threshold: number, higherCopy: string, lowerCopy: string) {
  if (current === null || previous === null) return "比較データ待ち";
  const diff = current - previous;
  if (Math.abs(diff) < threshold) return "大きな変化なし";
  return diff > 0 ? higherCopy : lowerCopy;
}

export default function InsightDashboardSummary({ trends, dailyDays }: {
  trends: ObservationTrends;
  dailyDays: DailyCheckDay[];
}) {
  const currentDays = between(dailyDays, trends.current_start, trends.as_of_local_date);
  const previousDays = between(dailyDays, trends.previous_start, trends.previous_end);
  const currentCondition = averageCondition(currentDays);
  const previousCondition = averageCondition(previousDays);
  const currentEvents = trends.event_overall.find((row) => row.period === "current");
  const previousEvents = trends.event_overall.find((row) => row.period === "previous");
  const comparableDaily = currentDays.length >= 3 && previousDays.length >= 3;
  const comparableEvents = Boolean(currentEvents && previousEvents && eligiblePeriods(currentEvents.total_count, previousEvents.total_count));
  const currentConcernRate = currentEvents?.concern_rate ?? null;
  const previousConcernRate = previousEvents?.concern_rate ?? null;

  const prominentTheme = trends.event_themes
    .filter((row) => row.period === "current" && row.total_count >= 3 && row.concern_count >= 2 && row.concern_rate >= 40)
    .sort((a, b) => b.concern_rate - a.concern_rate || b.concern_count - a.concern_count)[0];

  let headline = "記録がたまると、最近の変化が見えてきます";
  let detail = "Daily Checkやできごとを続けると、前の7日間との違いを振り返れます。";
  if (prominentTheme) {
    headline = `「${themeLabel(prominentTheme.theme_key)}」で“気になった”記録がやや目立っています`;
    detail = `${prominentTheme.concern_count} / ${prominentTheme.total_count}件が「気になった」でした。記録された範囲での傾向です。`;
  } else if (comparableDaily && currentCondition !== null && previousCondition !== null && Math.abs(currentCondition - previousCondition) >= 0.35) {
    headline = `Daily Checkは前の7日間より少し${currentCondition > previousCondition ? "高め" : "低め"}の記録です`;
    detail = `総合平均は前の7日間 ${previousCondition.toFixed(1)} → 直近7日間 ${currentCondition.toFixed(1)}。未入力項目は平均から除いています。`;
  } else if (comparableEvents && currentConcernRate !== null && previousConcernRate !== null && Math.abs(currentConcernRate - previousConcernRate) >= 10) {
    headline = `“気になった”記録の割合が前の7日間より${currentConcernRate > previousConcernRate ? "高め" : "低め"}です`;
    detail = `前の7日間 ${previousConcernRate}% → 直近7日間 ${currentConcernRate}%です。遭遇機会の多さまでは比較していません。`;
  } else if (comparableDaily || comparableEvents) {
    headline = "この7日間は、大きな変化はまだ目立っていません";
    detail = "比較できる記録の範囲では、前の7日間との差が大きい項目はありません。引き続き同じ粒度で記録すると比較しやすくなります。";
  }

  return <>
    <section className="insight-weekly-hero" aria-labelledby="weekly-overview-title">
      <span className="card-label">THIS WEEK</span>
      <h3 id="weekly-overview-title">最近の様子</h3>
      <strong>{headline}</strong>
      <p>{detail}</p>
    </section>
    <section className="insight-period-comparison" aria-labelledby="period-comparison-title">
      <div className="insight-section-heading"><div><span className="card-label">COMPARE</span><h3 id="period-comparison-title">前の7日間と比べる</h3></div></div>
      <div className="insight-comparison-grid">
        <article>
          <small>総合コンディション</small>
          <p><span>{comparableDaily ? formatValue(previousCondition) : "–"}</span><b>→</b><strong>{formatValue(currentCondition)}</strong></p>
          <em>{comparableDaily ? changeLabel(currentCondition, previousCondition, .35, "少し高め", "少し低め") : "各期間3日以上で比較"}</em>
        </article>
        <article>
          <small>“気になった”割合</small>
          <p><span>{comparableEvents && previousConcernRate !== null ? `${previousConcernRate}%` : "–"}</span><b>→</b><strong>{currentConcernRate === null ? "–" : `${currentConcernRate}%`}</strong></p>
          <em>{comparableEvents ? changeLabel(currentConcernRate, previousConcernRate, 10, "割合が増加", "割合が減少") : "各期間3件・合計10件以上で比較"}</em>
        </article>
        <article>
          <small>Daily Check入力日数</small>
          <p><span>{previousDays.length}日</span><b>→</b><strong>{currentDays.length}日</strong></p>
          <em>記録量の目安です。良し悪しの判定には使いません。</em>
        </article>
      </div>
    </section>
  </>;
}
