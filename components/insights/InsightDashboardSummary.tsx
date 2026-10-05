import { themeLabel } from "@/lib/insights/presentation";
import { eligiblePeriods } from "@/lib/insights/rules";
import type { DailyCheckDay, ObservationTrends } from "@/lib/insights/trendTypes";
import { averageCondition, dailyConditionScore } from "./DailyCheckHistoryChart";

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

export default function InsightDashboardSummary({ trends, dailyDays }: {
  trends: ObservationTrends;
  dailyDays: DailyCheckDay[];
}) {
  const currentDays = between(dailyDays, trends.current_start, trends.as_of_local_date);
  const previousDays = between(dailyDays, trends.previous_start, trends.previous_end);
  const currentCondition = averageCondition(currentDays);
  const previousCondition = averageCondition(previousDays);
  const latestDay = [...currentDays].sort((a, b) => b.local_date.localeCompare(a.local_date))[0];
  const todayCondition = latestDay ? dailyConditionScore(latestDay) : null;
  const currentEvents = trends.event_overall.find((row) => row.period === "current");
  const previousEvents = trends.event_overall.find((row) => row.period === "previous");
  const comparableDaily = currentDays.length >= 3 && previousDays.length >= 3;
  const comparableEvents = Boolean(currentEvents && previousEvents && eligiblePeriods(currentEvents.total_count, previousEvents.total_count));
  const currentConcernRate = currentEvents?.concern_rate ?? null;
  const previousConcernRate = previousEvents?.concern_rate ?? null;

  const prominentTheme = trends.event_themes
    .filter((row) => row.period === "current" && row.total_count >= 3 && row.concern_count >= 2 && row.concern_rate >= 40)
    .sort((a, b) => b.concern_rate - a.concern_rate || b.concern_count - a.concern_count)[0];

  let headline = "この7日間は大きな変化は目立っていません";
  if (prominentTheme) {
    headline = `「${themeLabel(prominentTheme.theme_key)}」が少し気になります`;
  } else if (comparableDaily && currentCondition !== null && previousCondition !== null && Math.abs(currentCondition - previousCondition) >= 0.35) {
    headline = `最近の調子は前週より少し${currentCondition > previousCondition ? "上向き" : "低め"}です`;
  } else if (comparableEvents && currentConcernRate !== null && previousConcernRate !== null && Math.abs(currentConcernRate - previousConcernRate) >= 10) {
    headline = `“気になった”記録が前週より${currentConcernRate > previousConcernRate ? "増えています" : "減っています"}`;
  }

  const weeklyChange = comparableDaily && currentCondition !== null && previousCondition !== null
    ? currentCondition - previousCondition
    : null;

  return <div className="insight-at-a-glance">
    <section className="insight-today-card" aria-labelledby="today-condition-title">
      <div>
        <span className="card-label">TODAY</span>
        <h3 id="today-condition-title">今日の状態</h3>
        <p>{latestDay ? "最新のDaily Checkから" : "Daily Checkを記録すると表示されます"}</p>
      </div>
      <div className="insight-today-score">
        <strong>{todayCondition === null ? "–" : formatValue(todayCondition)}</strong>
        <span>{conditionLabel(todayCondition)}</span>
      </div>
    </section>

    <section className="insight-weekly-hero" aria-labelledby="weekly-overview-title">
      <span className="card-label">RECENT</span>
      <h3 id="weekly-overview-title">最近の気づき</h3>
      <strong>{headline}</strong>
    </section>

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
          <small>できごと</small>
          <strong>{currentEvents?.total_count ?? 0}<em>件</em></strong>
          <span>記録した出来事</span>
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
