"use client";

import { useEffect, useRef, useState } from "react";
import type { EventTheme } from "@/lib/observations/observationEvent";
import { loadObservationDailyDays, loadObservationTrends } from "@/lib/insights/observationTrends";
import { orderedThemes } from "@/lib/insights/presentation";
import type { InsightFilter } from "@/lib/insights/recordSources";
import type { DailyCheckDay, ObservationTrends } from "@/lib/insights/trendTypes";
import DailyCheckHistoryChart from "./DailyCheckHistoryChart";
import InsightDashboardSummary from "./InsightDashboardSummary";
import InsightRecordList from "./InsightRecordList";
import ThemeTrendTable from "./ThemeTrendTable";
import styles from "./RecentObservationTrends.module.css";

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
  const showRecords = (title: string, filter: InsightFilter, isDaily = false) => setSelection({ title, filter, daily: isDaily });

  return <section className="recent-observation-trends" aria-label="記録のサマリーと詳細">
    {!online ? <p role="status">接続すると最近の記録を確認できます。</p>
      : loading ? <p role="status">記録を集計しています…</p>
      : error || !trends ? <p role="alert">最近の傾向を読み込めませんでした。時間をおいて再度お試しください。</p>
      : <>
        <InsightDashboardSummary trends={trends} dailyDays={dailyDays}
          onEventRecords={() => showRecords("最近のできごと", { period: "current" })} />

        <DailyCheckHistoryChart days={dailyDays}
          startDate={trends.current_start} endDate={trends.as_of_local_date} />

        {selection && dogId && <div ref={recordsRef}><InsightRecordList key={JSON.stringify(selection)} dogId={dogId} trends={trends} {...selection} onClose={() => setSelection(null)} /></div>}

        <section className="insight-section insight-theme-section" aria-labelledby="theme-trends-title">
          <div className="insight-section-heading"><div><span className="card-label">EVENT LOG / 直近7日間</span><h3 id="theme-trends-title">できごとの傾向</h3></div></div>
          {themes.length > 0 ? <ThemeTrendTable trends={themes} />
            : <p>直近7日間のできごとはまだありません。記録するとここに内訳が表示されます。</p>}
          <button type="button" className={styles.moreButton} onClick={() => showRecords("最近のできごと", { period: "current" })}
            aria-label="詳しく見る、直近7日間の全テーマの記録">詳しく見る <span aria-hidden="true">→</span></button>
        </section>

      </>}
  </section>;
}
