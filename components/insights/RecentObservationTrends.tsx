"use client";

import { useEffect, useRef, useState } from "react";
import type { EventTheme } from "@/lib/observations/observationEvent";
import { loadObservationDailyDays, loadObservationTrends } from "@/lib/insights/observationTrends";
import { featuredDaily, featuredInsights, handlerComparisons, orderedThemes, themeLabel } from "@/lib/insights/presentation";
import type { InsightFilter } from "@/lib/insights/recordSources";
import type { DailyCheckDay, ObservationTrends } from "@/lib/insights/trendTypes";
import DailyCheckHistoryChart from "./DailyCheckHistoryChart";
import DailyCheckTrendCard from "./DailyCheckTrendCard";
import HandlerComparisonCard from "./HandlerComparisonCard";
import InsightCard from "./InsightCard";
import InsightDashboardSummary from "./InsightDashboardSummary";
import InsightEmptyState from "./InsightEmptyState";
import InsightRecordList from "./InsightRecordList";
import ThemeTrendCard from "./ThemeTrendCard";

type RecordSelection = { title: string; filter: InsightFilter; daily?: boolean };

export default function RecentObservationTrends({ dogId, online, selectedThemes, onCoachChat }: {
  dogId?: string;
  online: boolean;
  selectedThemes: EventTheme[];
  onCoachChat?: () => void;
}) {
  const [trends, setTrends] = useState<ObservationTrends | null>(null);
  const [dailyDays, setDailyDays] = useState<DailyCheckDay[]>([]);
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
    const load = async () => {
      setLoading(true);
      try {
        const nextTrends = await loadObservationTrends(dogId);
        const nextDailyDays = await loadObservationDailyDays(dogId, nextTrends.previous_start, nextTrends.as_of_local_date);
        if (!active) return;
        setTrends(nextTrends);
        setDailyDays(nextDailyDays);
        setError(false);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
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
      <p>記録を並べるだけでなく、前の7日間との違いと最近見えてきたことをまとめます。</p></div>
    {!online ? <p role="status">接続すると最近の記録を確認できます。</p>
      : loading ? <p role="status">記録を集計しています…</p>
      : error || !trends ? <p role="alert">最近の傾向を読み込めませんでした。時間をおいて再度お試しください。</p>
      : <>
        <InsightDashboardSummary trends={trends} dailyDays={dailyDays} />
        <DailyCheckHistoryChart days={dailyDays.filter((day) => day.local_date >= trends.current_start)}
          startDate={trends.current_start} endDate={trends.as_of_local_date} />

        {themes.length > 0 && <section className="insight-section insight-theme-section" aria-labelledby="theme-trends-title">
          <div className="insight-section-heading"><div><span className="card-label">EVENT LOG</span><h3 id="theme-trends-title">できごとの傾向</h3></div></div>
          <p className="insight-section-intro">テーマごとに「うまくできた・いつも通り・気になった」の割合を比べます。</p>
          <div className="insight-result-legend" aria-label="できごとの評価">
            <span className="success">うまくできた</span><span className="neutral">いつも通り</span><span className="concern">気になった</span>
          </div>
          <div className="insight-theme-list">{themes.map((row) => <ThemeTrendCard key={row.theme_key} trend={row}
            onRecords={() => showRecords(themeLabel(row.theme_key), { themeKey: row.theme_key, period: "current" })} />)}</div>
        </section>}

        <section className="insight-section" aria-labelledby="recent-discoveries-title">
          <div className="insight-section-heading"><div><span className="card-label">INSIGHTS</span><h3 id="recent-discoveries-title">最近見えてきたこと</h3></div></div>
          {candidates.length ? <div className="insight-card-stack">{candidates.map((item, index) => <InsightCard key={`${item.kind}-${item.themeKey ?? "daily"}-${index}`} insight={item}
            onRecords={() => showRecords(item.kind === "daily" ? "Daily Check" : themeLabel(item.themeKey ?? ""),
              { themeKey: item.themeKey, period: item.period, handlerIds: item.handlerIds }, item.kind === "daily")} />)}</div>
            : <InsightEmptyState hasRecords={eventCount > 0 || daily.length > 0} />}
        </section>

        {daily.length > 0 && <details className="insight-detail-disclosure">
          <summary>Daily Checkの項目別平均を見る</summary>
          <div className="insight-daily-list">{daily.map((item) => <DailyCheckTrendCard key={item.current.metric_key} {...item} />)}</div>
        </details>}

        {handlers.length > 0 && <section className="insight-section" aria-labelledby="handler-trends-title">
          <h3 id="handler-trends-title">担当した人による記録の違い</h3>
          <div className="insight-card-stack">{handlers.map(({ theme, handlers: pair }) => <HandlerComparisonCard key={theme.theme_key}
            theme={theme} handlers={pair} onRecords={() => showRecords(themeLabel(theme.theme_key),
              { themeKey: theme.theme_key, period: "current", handlerIds: pair.map((row) => row.handled_by_member_id) })} />)}</div>
        </section>}

        <section className="insight-record-entry">
          <div><span className="card-label">RECORDS</span><h3>最近の記録</h3><p>気づきの根拠になった元の記録を確認できます。</p></div>
          <button type="button" onClick={() => showRecords("最近のできごと", { period: "current" })}>記録を見る <span aria-hidden="true">→</span></button>
        </section>
        {selection && dogId && <div ref={recordsRef}><InsightRecordList key={JSON.stringify(selection)} dogId={dogId} trends={trends} {...selection} onClose={() => setSelection(null)} /></div>}

        <section className="insight-coach-cta">
          <div><span className="card-label">WITH YOUR COACH</span><h3>この傾向を、コーチと一緒に振り返る</h3><p>数字だけで判断せず、実際の場面や最近の変化と合わせて相談できます。</p></div>
          {onCoachChat ? <button type="button" onClick={onCoachChat}>コーチに相談する <span aria-hidden="true">→</span></button>
            : <small>担当コーチが決まると、ここから相談できます。</small>}
        </section>
      </>}
  </section>;
}
