"use client";

import { useMemo, useState } from "react";
import { dailyLabels } from "@/lib/insights/presentation";
import type { DailyCheckDay, DailyMetricKey } from "@/lib/insights/trendTypes";

type ChartMetric = "overall" | DailyMetricKey;

const metrics: { key: ChartMetric; label: string }[] = [
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
  const [metric, setMetric] = useState<ChartMetric>("overall");
  const slots = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startDate, index)), [startDate]);
  const byDate = useMemo(() => new Map(days.map((day) => [day.local_date, day])), [days]);
  const points = slots.map((date) => {
    const day = byDate.get(date);
    const value = !day ? null : metric === "overall" ? dailyConditionScore(day) : day[metric];
    return { date, value };
  });
  const available = points.filter((point): point is { date: string; value: number } => point.value !== null);
  const average = available.length ? available.reduce((sum, point) => sum + point.value, 0) / available.length : null;
  const x = (index: number) => 24 + index * 45;
  const y = (value: number) => 18 + (5 - value) * 25;
  const label = metric === "overall" ? "総合コンディション" : dailyLabels[metric];
  const segments = points.flatMap((point, index) => {
    if (index === 0 || point.value === null || points[index - 1].value === null) return [];
    const previous = points[index - 1].value as number;
    return [{ x1: x(index - 1), y1: y(previous), x2: x(index), y2: y(point.value) }];
  });

  return <section className="insight-trend-chart" aria-labelledby="daily-chart-title">
    <div className="insight-section-heading">
      <div><span className="card-label">7 DAY TREND</span><h3 id="daily-chart-title">Daily Checkの推移</h3></div>
      <div className="insight-chart-average"><small>7日平均</small><strong>{average === null ? "–" : average.toFixed(1)}</strong></div>
    </div>
    <p className="insight-section-intro">1は「気になる」、3は「いつも通り」、5は「とても良い」。未入力日は線で補完していません。</p>
    <div className="insight-metric-tabs" role="tablist" aria-label="グラフの表示項目">
      {metrics.map((item) => <button type="button" role="tab" aria-selected={metric === item.key}
        className={metric === item.key ? "is-selected" : ""} key={item.key} onClick={() => setMetric(item.key)}>{item.label}</button>)}
    </div>
    <div className="insight-chart-wrap">
      <svg viewBox="0 0 320 150" role="img" aria-label={`${label}の${startDate}から${endDate}までの推移`}>
        {[1, 3, 5].map((score) => <g key={score}>
          <line className="insight-chart-grid" x1="24" y1={y(score)} x2="294" y2={y(score)} />
          <text className="insight-chart-y-label" x="7" y={y(score) + 3}>{score}</text>
        </g>)}
        {segments.map((segment, index) => <line className="insight-chart-line" key={index} {...segment} />)}
        {points.map((point, index) => point.value === null
          ? <circle className="insight-chart-missing" key={point.date} cx={x(index)} cy={y(1) + 9} r="2.5" />
          : <circle className="insight-chart-point" key={point.date} cx={x(index)} cy={y(point.value)} r="4" />)}
        {points.map((point, index) => <text className="insight-chart-x-label" key={`label-${point.date}`} x={x(index)} y="145" textAnchor="middle">
          {new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(`${point.date}T12:00:00Z`))}
        </text>)}
      </svg>
    </div>
    <div className="insight-score-legend"><span>1 気になる</span><span>3 いつも通り</span><span>5 とても良い</span></div>
  </section>;
}
