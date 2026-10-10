"use client";

import { useState } from "react";
import { dailyLabels } from "@/lib/insights/presentation";
import type { DailyCheckDay, DailyMetricKey } from "@/lib/insights/trendTypes";
import styles from "./DailyCheckHistoryChart.module.css";

type ChartMetric = "all" | "overall" | DailyMetricKey;

export const dailyChartMetrics: { key: DailyMetricKey; color: string; dash?: string }[] = [
  { key: "appetite_score", color: "#008661" },
  { key: "sleep_rest_score", color: "#4272b8", dash: "6 3" },
  { key: "activity_score", color: "#bc7a18", dash: "2 3" },
  { key: "exploration_score", color: "#9365b2", dash: "8 3 2 3" },
  { key: "calmness_score", color: "#c35f74", dash: "10 4" },
  { key: "toilet_score", color: "#457d88", dash: "3 2 1 2" },
];

const metrics: { key: ChartMetric; label: string }[] = [
  { key: "all", label: "全項目" },
  { key: "overall", label: "総合" },
  { key: "appetite_score", label: "食欲" },
  { key: "sleep_rest_score", label: "休息" },
  { key: "activity_score", label: "活動" },
  { key: "exploration_score", label: "探索" },
  { key: "calmness_score", label: "落ち着き" },
  { key: "toilet_score", label: "トイレ" },
];

const scoreKeys: DailyMetricKey[] = [
  "appetite_score", "sleep_rest_score", "activity_score",
  "exploration_score", "calmness_score", "toilet_score",
];

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function dailyConditionScore(day: DailyCheckDay) {
  const values = scoreKeys.map((key) => day[key]).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function averageCondition(days: DailyCheckDay[]) {
  const values = days.map(dailyConditionScore).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export default function DailyCheckHistoryChart({ days, startDate, endDate }: {
  days: DailyCheckDay[];
  startDate: string;
  endDate: string;
}) {
  const [metric, setMetric] = useState<ChartMetric>("all");
  const slots = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
  const byDate = new Map(days.map((day) => [day.local_date, day]));
  const periodDays = slots.flatMap(date => byDate.has(date) ? [byDate.get(date)!] : []);
  const series = metric === "overall" ? [{ key: "overall" as const, color: "#008661", dash: undefined }]
    : dailyChartMetrics.filter(item => metric === "all" || metric === item.key);
  const plotted = series.map(item => ({ ...item, points: slots.map(date => {
    const day = byDate.get(date);
    return { date, value: !day ? null : item.key === "overall" ? dailyConditionScore(day) : day[item.key] };
  }) }));
  const average = metric === "all" || metric === "overall" ? averageCondition(periodDays)
    : (() => {
      const values = periodDays.map(day => day[metric]).filter((value): value is number => value !== null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    })();
  const x = (index: number) => 24 + index * 45;
  const y = (value: number) => 18 + (5 - value) * 25;
  const label = metric === "all" ? "全6項目" : metric === "overall" ? "総合コンディション" : dailyLabels[metric];

  return <section className="insight-trend-chart" aria-labelledby="daily-chart-title">
    <div className="insight-section-heading">
      <div><span className="card-label">7 DAY TREND</span><h3 id="daily-chart-title">Daily Checkの推移</h3></div>
      <div className="insight-chart-average"><small>{metric === "all" ? "総合の7日平均" : "7日平均"}</small><strong>{average === null ? "–" : average.toFixed(1)}</strong></div>
    </div>
    <p className="insight-section-intro">1 気になる · 3 いつも通り · 5 とても良い。</p>
    <div className="insight-metric-tabs" role="group" aria-label="グラフの表示項目">
      {metrics.map((item) => <button type="button" aria-pressed={metric === item.key}
        className={metric === item.key ? "is-selected" : ""} key={item.key} onClick={() => setMetric(item.key)}>{item.label}</button>)}
    </div>
    <div className="insight-chart-wrap">
      <svg viewBox="0 0 320 150" role="img" aria-label={`${label}の${startDate}から${endDate}までの推移`}>
        {slots.map((date, index) => plotted.length > 0 && plotted.every(item => item.points[index].value === null)
          ? <rect key={`missing-${date}`} className={styles.missingBand} data-missing-date={date}
              x={x(index) - 20} y="12" width="40" height="138"><title>{`${date} 未入力`}</title></rect> : null)}
        {[1, 3, 5].map((score) => <g key={score}>
          <line className="insight-chart-grid" x1="24" y1={y(score)} x2="294" y2={y(score)} />
          <text className="insight-chart-y-label" x="7" y={y(score) + 3}>{score}</text>
        </g>)}
        {plotted.map(item => <g key={item.key} data-metric={item.key} style={{ color: item.color }}>
          {item.points.flatMap((point, index) => {
            if (point.value === null) return [];
            let previous = index - 1;
            while (previous >= 0 && item.points[previous].value === null) previous--;
            return previous >= 0 ? [<line key={`line-${point.date}`} className={styles.line} strokeDasharray={item.dash}
              x1={x(previous)} y1={y(item.points[previous].value!)} x2={x(index)} y2={y(point.value)} />] : [];
          })}
          {item.points.map((point, index) => point.value !== null ? <circle key={point.date} className={styles.point}
            cx={x(index)} cy={y(point.value)} r="3"><title>{`${point.date} ${item.key === "overall" ? "総合" : dailyLabels[item.key]} ${point.value}`}</title></circle> : null)}
        </g>)}
        {slots.map((date, index) => <text className="insight-chart-x-label" key={`label-${date}`} x={x(index)} y="145" textAnchor="middle">
          {new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00Z`))}
        </text>)}
      </svg>
    </div>
    <div className={styles.missingLegend}><i aria-hidden="true" />未入力の日<span>線は前後の記録をつないでいます</span></div>
    <div className={styles.legend} aria-label="項目ごとの色と線種">
      {dailyChartMetrics.map(item => <span key={item.key} style={{ color: item.color }}>
        <svg viewBox="0 0 24 8" aria-hidden="true"><line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={item.dash} /></svg>
        {dailyLabels[item.key]}</span>)}
    </div>
    <p className={styles.note}>線が重なる場合は、項目を選ぶと個別に確認できます。</p>
    {periodDays.length === 0 && <p role="status" className={styles.note}>この7日間のDaily Checkはまだありません。</p>}
    <details className={styles.values}>
      <summary>数値の表を見る</summary>
      <div className={styles.scroll} role="region" aria-label="Daily Checkの項目別数値" tabIndex={0}>
        <table><caption>{startDate}〜{endDate}のDaily Check。– は未入力です。</caption>
          <thead><tr><th scope="col">項目</th>{slots.map(date => <th key={date} scope="col">{date.slice(5).replace("-", "/")}</th>)}</tr></thead>
          <tbody>{dailyChartMetrics.map(item => <tr key={item.key}><th scope="row" style={{ color: item.color }}>{dailyLabels[item.key]}</th>
            {slots.map(date => <td key={date}>{byDate.get(date)?.[item.key] ?? "–"}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
