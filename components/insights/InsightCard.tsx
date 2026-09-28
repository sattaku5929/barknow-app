import type { InsightCandidate } from "@/lib/insights/rules";
import { themeLabel } from "@/lib/insights/presentation";

export default function InsightCard({ insight, onRecords }: { insight: InsightCandidate; onRecords: () => void }) {
  const title = insight.kind === "daily" ? "落ち着き" : themeLabel(insight.themeKey ?? "");
  return <article className="insight-card">
    <span className="insight-card-kicker">{insight.kind === "reference" ? "参考傾向" : "最近の気づき"}</span>
    <h4>{title}</h4>
    <p>{insight.text}</p>
    <small>{insight.evidence}</small>
    <button type="button" onClick={onRecords}>{insight.kind === "daily" ? "日ごとの記録を見る" : "この記録を見る"}<span aria-hidden="true"> →</span></button>
  </article>;
}
