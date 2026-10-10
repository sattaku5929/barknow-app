import type { DailyCheckDay, ObservationTrends } from "@/lib/insights/trendTypes";
import { averageCondition } from "./DailyCheckHistoryChart";
import styles from "./InsightDashboardSummary.module.css";

function between(days: DailyCheckDay[], start: string, end: string) {
  return days.filter((day) => day.local_date >= start && day.local_date <= end);
}

function formatValue(value: number | null, suffix = "") {
  return value === null ? "–" : `${value.toFixed(1)}${suffix}`;
}

function conditionLabel(value: number | null) {
  if (value === null) return "記録待ち";
  if (value >= 4.2) return "とても良い";
  if (value >= 3.4) return "良好";
  if (value >= 2.6) return "いつも通り";
  return "少し気になる";
}

export default function InsightDashboardSummary({ trends, dailyDays, onEventRecords }: {
  trends: ObservationTrends;
  dailyDays: DailyCheckDay[];
  onEventRecords: () => void;
}) {
  const currentDays = between(dailyDays, trends.current_start, trends.as_of_local_date);
  const previousDays = between(dailyDays, trends.previous_start, trends.previous_end);
  const currentCondition = averageCondition(currentDays);
  const previousCondition = averageCondition(previousDays);
  const currentEvents = trends.event_overall.find((row) => row.period === "current");
  const comparableDaily = currentDays.length >= 3 && previousDays.length >= 3;

  const weeklyChange = comparableDaily && currentCondition !== null && previousCondition !== null
    ? currentCondition - previousCondition
    : null;

  return <div className="insight-at-a-glance">
    <section className="insight-week-summary" aria-labelledby="week-summary-title">
      <div className="insight-section-heading">
        <div><span className="card-label">THIS WEEK</span><h3 id="week-summary-title">今週のサマリー</h3></div>
      </div>
      <div className="insight-week-summary-grid">
        <article>
          <small>Daily Check</small>
          <strong>{currentDays.length}<em>/7日</em></strong>
          <span className="insight-mini-progress"><i style={{ width: `${Math.min(100, currentDays.length / 7 * 100)}%` }} /></span>
        </article>
        <article>
          <button type="button" className={styles.eventButton} onClick={onEventRecords}
            aria-label={`できごと${currentEvents?.total_count ?? 0}件、最近の記録を見る`}>
          <small>できごと</small>
          <strong>{currentEvents?.total_count ?? 0}<em>件</em></strong>
          <span>記録した出来事 <i aria-hidden="true">→</i></span>
          </button>
        </article>
        <article>
          <small>7日平均</small>
          <strong>{formatValue(currentCondition)}</strong>
          <span>{conditionLabel(currentCondition)}</span>
        </article>
        <article>
          <small>前週との差</small>
          <strong>{weeklyChange === null ? "–" : `${weeklyChange > 0 ? "+" : ""}${weeklyChange.toFixed(1)}`}</strong>
          <span>{weeklyChange === null ? "比較データ待ち" : Math.abs(weeklyChange) < .35 ? "大きな変化なし" : weeklyChange > 0 ? "少し上向き" : "少し低め"}</span>
        </article>
      </div>
    </section>
  </div>;
}
