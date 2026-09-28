"use client";

import { useEffect, useState } from "react";
import { themeLabel } from "@/lib/insights/presentation";
import { loadInsightEvents } from "@/lib/insights/recordSources";
import type { InsightEvent, InsightFilter } from "@/lib/insights/recordSources";
import type { ObservationTrends } from "@/lib/insights/trendTypes";

const resultLabels = { success: "うまくできた", neutral: "いつも通り", concern: "気になった" };

export default function InsightRecordList({ dogId, trends, filter, title, daily = false, onClose }: {
  dogId: string; trends: ObservationTrends; filter: InsightFilter; title: string; daily?: boolean; onClose: () => void;
}) {
  const [events, setEvents] = useState<InsightEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (daily) return;
    let active = true;
    void loadInsightEvents(dogId, trends, filter).then((rows) => {
      if (active) { setEvents(rows); setStatus("ready"); }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [daily, dogId, trends, filter]);

  const dailyDays = trends.daily_event_days.filter((day) => day.calmness_score !== null);
  return <section className="insight-record-list" aria-label={`${title}の元の記録`}>
    <div className="insight-record-header"><div><span>RECORDS</span><h3>{title}の記録</h3></div><button type="button" onClick={onClose} aria-label="記録一覧を閉じる">閉じる ×</button></div>
    {daily ? (dailyDays.length ? <ul>{dailyDays.map((day) => <li key={day.local_date}>
      <strong>{day.local_date}</strong><span>落ち着き {day.calmness_score} / 5</span><small>できごと {day.event_count}件 · 気になった {day.concern_count}件</small>
    </li>)}</ul> : <p>この期間の入力はありません。</p>)
      : status === "loading" ? <p role="status">記録を読み込んでいます…</p>
      : status === "error" ? <p role="alert">記録を読み込めませんでした。時間をおいて再度お試しください。</p>
      : events.length ? <><p className="insight-record-count">{events.length}件の記録</p><ul>{events.map((entry) => <li key={entry.id}>
        <strong>{themeLabel(entry.themeKey)} <span>{resultLabels[entry.result]}</span></strong>
        <small>{entry.localDate} · {new Date(entry.occurredAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</small>
        {entry.note && <p>{entry.note}</p>}
      </li>)}</ul>{events.length === 60 && <small>直近60件を表示しています。</small>}</>
      : <p>条件に合う記録はありません。</p>}
  </section>;
}
