import { themeLabel } from "@/lib/insights/presentation";
import type { HandlerTrend, ThemeTrend } from "@/lib/insights/trendTypes";

export default function HandlerComparisonCard({ theme, handlers, onRecords }: {
  theme: ThemeTrend; handlers: [HandlerTrend, HandlerTrend]; onRecords: () => void;
}) {
  return <article className="insight-handler-card">
    <h4>{themeLabel(theme.theme_key)}</h4>
    <p>記録では、{handlers[0].display_name}{handlers[0].archived ? "（削除済み）" : ""}が担当したときに「うまくできた」割合が高いようです。</p>
    <div>{handlers.map((row) => <p key={row.handled_by_member_id}><span>{row.display_name}{row.archived ? "（削除済み）" : ""}</span><strong>{row.success_count} / {row.total_count}</strong><small>うまくできた</small></p>)}</div>
    <small>担当者以外の条件は揃っていません。</small>
    <button type="button" onClick={onRecords}>この記録を見る <span aria-hidden="true">→</span></button>
  </article>;
}
