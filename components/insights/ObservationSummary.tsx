import { themeLabel } from "@/lib/insights/presentation";
import type { ObservationTrends } from "@/lib/insights/trendTypes";

export default function ObservationSummary({ trends }: { trends: ObservationTrends }) {
  const events = trends.event_overall.find((row) => row.period === "current")?.total_count ?? 0;
  const days = Math.max(0, ...trends.daily_metrics.filter((row) => row.period === "current").map((row) => row.entered_days));
  const themes = trends.event_themes.filter((row) => row.period === "current").sort((a, b) => b.total_count - a.total_count);
  return <section className="insight-section" aria-labelledby="observation-summary-title">
    <h3 id="observation-summary-title">この7日間の記録</h3>
    <div className="insight-summary-numbers"><p><strong>{days}日</strong><span>Daily Check</span></p><p><strong>{events}件</strong><span>できごと</span></p></div>
    {themes.length > 0 && <p className="insight-summary-themes">{themes.map((row) => `${themeLabel(row.theme_key)} ${row.total_count}件`).join(" · ")}</p>}
  </section>;
}
