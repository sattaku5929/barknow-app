"use client";

import { useEffect, useRef, useState } from "react";
import type { EventTheme } from "@/lib/observations/observationEvent";
import { loadObservationTrends } from "@/lib/insights/observationTrends";
import { featuredDaily, featuredInsights, handlerComparisons, orderedThemes, themeLabel } from "@/lib/insights/presentation";
import type { InsightFilter } from "@/lib/insights/recordSources";
import type { ObservationTrends } from "@/lib/insights/trendTypes";
import DailyCheckTrendCard from "./DailyCheckTrendCard";
import HandlerComparisonCard from "./HandlerComparisonCard";
import InsightCard from "./InsightCard";
import InsightEmptyState from "./InsightEmptyState";
import InsightRecordList from "./InsightRecordList";
import ObservationSummary from "./ObservationSummary";
import ThemeTrendCard from "./ThemeTrendCard";

type RecordSelection = { title: string; filter: InsightFilter; daily?: boolean };

export default function RecentObservationTrends({ dogId, online, selectedThemes }: {
  dogId?: string; online: boolean; selectedThemes: EventTheme[];
}) {
  const [trends, setTrends] = useState<ObservationTrends | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<RecordSelection | null>(null);
  const recordsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selection) recordsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selection]);

  useEffect(() => {
    if (!dogId || !online) return;
    let active = true;
    void loadObservationTrends(dogId).then((data) => {
      if (active) { setTrends(data); setError(false); setLoading(false); }
    }).catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [dogId, online]);

  const candidates = trends ? featuredInsights(trends) : [];
  const themes = trends ? orderedThemes(trends, selectedThemes) : [];
  const handlers = trends ? handlerComparisons(trends) : [];
  const daily = trends ? featuredDaily(trends) : [];
  const eventCount = trends?.event_overall.find((row) => row.period === "current")?.total_count ?? 0;
  const showRecords = (title: string, filter: InsightFilter, isDaily = false) => setSelection({ title, filter, daily: isDaily });

  return <section className="recent-observation-trends" aria-labelledby="recent-observation-trends-title">
    <div className="insight-intro"><span className="card-label">OBSERVATION / 直近7日間</span>
      <h2 id="recent-observation-trends-title">最近の傾向</h2>
      <p>愛犬の記録から、最近の様子を一緒に振り返ります。</p></div>
    {!online ? <p role="status">接続すると最近の記録を確認できます。</p>
      : loading ? <p role="status">記録を集計しています…</p>
      : error || !trends ? <p role="alert">最近の傾向を読み込めませんでした。時間をおいて再度お試しください。</p>
      : <>
        <section className="insight-section" aria-labelledby="recent-discoveries-title">
          <h3 id="recent-discoveries-title">最近の気づき</h3>
          {candidates.length ? <div className="insight-card-stack">{candidates.map((item, index) => <InsightCard key={`${item.kind}-${item.themeKey ?? "daily"}-${index}`} insight={item}
            onRecords={() => showRecords(item.kind === "daily" ? "落ち着き" : themeLabel(item.themeKey ?? ""),
              { themeKey: item.themeKey, period: item.period, handlerIds: item.handlerIds }, item.kind === "daily")} />)}</div>
            : <InsightEmptyState hasRecords={eventCount > 0 || daily.length > 0} />}
        </section>
        <ObservationSummary trends={trends} />
        {themes.length > 0 && <section className="insight-section" aria-labelledby="theme-trends-title">
          <h3 id="theme-trends-title">テーマごとの様子</h3>
          <div className="insight-theme-list">{themes.map((row) => <ThemeTrendCard key={row.theme_key} trend={row}
            onRecords={() => showRecords(themeLabel(row.theme_key), { themeKey: row.theme_key, period: "current" })} />)}</div>
        </section>}
        {daily.length > 0 && <section className="insight-section" aria-labelledby="daily-trends-title">
          <h3 id="daily-trends-title">Daily Checkから</h3><p className="insight-section-intro">入力した日の記録から、気になる項目を選んでいます。</p>
          <div className="insight-daily-list">{daily.map((item) => <DailyCheckTrendCard key={item.current.metric_key} {...item} />)}</div>
        </section>}
        {handlers.length > 0 && <section className="insight-section" aria-labelledby="handler-trends-title">
          <h3 id="handler-trends-title">担当した人による記録の違い</h3>
          <div className="insight-card-stack">{handlers.map(({ theme, handlers: pair }) => <HandlerComparisonCard key={theme.theme_key}
            theme={theme} handlers={pair} onRecords={() => showRecords(themeLabel(theme.theme_key),
              { themeKey: theme.theme_key, period: "current", handlerIds: pair.map((row) => row.handled_by_member_id) })} />)}</div>
        </section>}
        {selection && dogId && <div ref={recordsRef}><InsightRecordList key={JSON.stringify(selection)} dogId={dogId} trends={trends} {...selection} onClose={() => setSelection(null)} /></div>}
        <p className="insight-coach-note">気になる変化があれば、コーチに相談できます。記録を一緒に振り返る材料にしてください。</p>
      </>}
  </section>;
}
