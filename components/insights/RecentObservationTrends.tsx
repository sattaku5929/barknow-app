"use client";

import { useEffect, useRef, useState } from "react";
import type { EventTheme } from "@/lib/observations/observationEvent";
import { loadObservationDailyDays, loadObservationTrends } from "@/lib/insights/observationTrends";
import { featuredDaily, handlerComparisons, orderedThemes, themeLabel } from "@/lib/insights/presentation";
import type { InsightFilter } from "@/lib/insights/recordSources";
import type { DailyCheckDay, ObservationTrends } from "@/lib/insights/trendTypes";
import DailyCheckHistoryChart from "./DailyCheckHistoryChart";
import DailyCheckTrendCard from "./DailyCheckTrendCard";
import HandlerComparisonCard from "./HandlerComparisonCard";
import InsightDashboardSummary from "./InsightDashboardSummary";
import InsightRecordList from "./InsightRecordList";
import ThemeTrendTable from "./ThemeTrendTable";

type RecordSelection = { title: string; filter: InsightFilter; daily?: boolean };

export default function RecentObservationTrends({ dogId, online, selectedThemes }: {
  dogId?: string;
  online: boolean;
  selectedThemes: EventTheme[];
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

  const themes = trends ? orderedThemes(trends, selectedThemes) : [];
  const handlers = trends ? handlerComparisons(trends) : [];
  const daily = trends ? featuredDaily(trends) : [];
  const showRecords = (title: string, filter: InsightFilter, isDaily = false) => setSelection({ title, filter, daily: isDaily });

  return <section className="recent-observation-trends" aria-label="記録のサマリーと詳細">
    {!online ? <p role="status">接続すると最近の記録を確認できます。</p>
      : loading ? <p role="status">記録を集計しています…</p>
      : error || !trends ? <p role="alert">最近の傾向を読み込めませんでした。時間をおいて再度お試しください。</p>
      : <>
        <InsightDashboardSummary trends={trends} dailyDays={dailyDays} />

        <section className="insight-record-entry insight-record-entry--compact">
          <div><span className="card-label">RECENT LOGS</span><h3>最近の記録</h3><p>元の記録を必要なときだけ確認できます。</p></div>
          <button type="button" onClick={() => showRecords("最近のできごと", { period: "current" })}>記録を見る <span aria-hidden="true">→</span></button>
        </section>

        <details className="insight-deep-dive">
          <summary>
            <span><strong>詳しいデータを見る</strong><small>7日推移・テーマ別・担当者別</small></span>
            <i aria-hidden="true">⌄</i>
          </summary>
          <div className="insight-deep-dive-body">
            <DailyCheckHistoryChart days={dailyDays.filter((day) => day.local_date >= trends.current_start)}
              startDate={trends.current_start} endDate={trends.as_of_local_date} />

            {themes.length > 0 && <section className="insight-section insight-theme-section" aria-labelledby="theme-trends-title">
              <div className="insight-section-heading"><div><span className="card-label">EVENT LOG</span><h3 id="theme-trends-title">できごとの傾向</h3></div></div>
              <ThemeTrendTable trends={themes}
                onRecords={row => showRecords(themeLabel(row.theme_key), { themeKey: row.theme_key, period: "current" })} />
            </section>}

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
          </div>
        </details>

        {selection && dogId && <div ref={recordsRef}><InsightRecordList key={JSON.stringify(selection)} dogId={dogId} trends={trends} {...selection} onClose={() => setSelection(null)} /></div>}

      </>}
  </section>;
}
