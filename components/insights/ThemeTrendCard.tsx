import { themeLabel } from "@/lib/insights/presentation";
import type { ThemeTrend } from "@/lib/insights/trendTypes";

export default function ThemeTrendCard({ trend, onRecords }: { trend: ThemeTrend; onRecords: () => void }) {
  return <article className="insight-theme-card">
    <div className="insight-theme-heading"><h4>{themeLabel(trend.theme_key)}</h4><span>{trend.total_count}件</span></div>
    <div className="insight-result-bar" role="img" aria-label={`うまくできた${trend.success_count}件、いつも通り${trend.neutral_count}件、気になった${trend.concern_count}件`}>
      {trend.success_count > 0 && <i className="success" style={{ width: `${trend.success_rate}%` }} />}
      {trend.neutral_count > 0 && <i className="neutral" style={{ width: `${trend.neutral_rate}%` }} />}
      {trend.concern_count > 0 && <i className="concern" style={{ width: `${trend.concern_rate}%` }} />}
    </div>
    <div className="insight-theme-breakdown">
      <span><b>{trend.success_rate}%</b>うまくできた <small>{trend.success_count}件</small></span>
      <span><b>{trend.neutral_rate}%</b>いつも通り <small>{trend.neutral_count}件</small></span>
      <span><b>{trend.concern_rate}%</b>気になった <small>{trend.concern_count}件</small></span>
    </div>
    <button type="button" onClick={onRecords}>根拠の記録を見る <span aria-hidden="true">→</span></button>
  </article>;
}
