"use client";

import { useEffect, useState } from "react";
import { eventThemes } from "@/lib/observations/observationEvent";
import { loadObservationTrends } from "@/lib/insights/observationTrends";
import { evidenceLevel, insightCandidates } from "@/lib/insights/rules";
import type { ObservationTrends } from "@/lib/insights/trendTypes";

export default function RecentObservationTrends({ dogId, online }: { dogId?: string; online: boolean }) {
  const [trends, setTrends] = useState<ObservationTrends | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dogId || !online) return;
    let active = true;
    void loadObservationTrends(dogId).then((data) => {
      if (active) { setTrends(data); setError(false); setLoading(false); }
    }).catch(() => {
      if (active) { setError(true); setLoading(false); }
    });
    return () => { active = false; };
  }, [dogId, online]);

  const current = trends?.event_themes.filter((row) => row.period === "current")
    .sort((a, b) => b.total_count - a.total_count) ?? [];
  const calmness = trends?.daily_metrics.find((row) => row.period === "current" && row.metric_key === "calmness_score");
  const overall = trends?.event_overall.find((row) => row.period === "current");
  const labels = (key: string) => eventThemes.find((item) => item.key === key)?.label ?? key;
  const candidates = trends ? insightCandidates(trends, labels) : [];

  return <section className="recent-observation-trends" aria-labelledby="recent-observation-trends-title">
    <p className="card-label">OBSERVATION / 直近7日間</p>
    <h2 id="recent-observation-trends-title">最近の傾向</h2>
    <p className="recent-observation-trends-intro">新しい観察記録から見た集計です。件数の変化だけで判断しません。</p>
    {!online ? <p role="status">接続すると最近の記録を確認できます。</p>
      : loading ? <p role="status">記録を集計しています…</p>
      : error ? <p role="alert">最近の傾向を読み込めませんでした。時間をおいて再度お試しください。</p>
      : <>
        <div className="recent-observation-trends-grid">
          <div><h3>できごと</h3>{current.length ? current.slice(0, 3).map((row) => <p key={row.theme_key}>
            <strong>{labels(row.theme_key)}　{row.total_count}件</strong>
            <span>うまくできた {row.success_count}件 · 気になった {row.concern_count}件</span>
          </p>) : <p>記録をためています。</p>}</div>
          <div><h3>Daily Check</h3><p><strong>落ち着き　{calmness ? `平均 ${calmness.average_score}` : "集計中"}</strong>
            <span>{calmness ? `${calmness.entered_days}日分の入力から集計` : "入力された日だけを集計します"}</span></p></div>
        </div>
        {candidates.length > 0 ? <div className="recent-observation-trends-candidates">
            <h3>記録から見えること</h3>
            {candidates.slice(0, 2).map((candidate, index) => <p key={`${candidate.kind}-${index}`}>{candidate.text}<small>{candidate.evidence}</small></p>)}
          </div> : <p className="recent-observation-trends-note">{evidenceLevel(overall?.total_count ?? 0) === "collecting"
            ? "記録をためています。3件以上から参考傾向を確認できます。" : "比較できる記録をためています。"}</p>}
      </>}
  </section>;
}
