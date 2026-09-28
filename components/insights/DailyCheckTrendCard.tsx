import { dailyLabels } from "@/lib/insights/presentation";
import type { DailyTrend } from "@/lib/insights/trendTypes";

export default function DailyCheckTrendCard({ current, previous, compare }: { current: DailyTrend; previous?: DailyTrend; compare: boolean }) {
  const difference = compare && previous ? current.average_score - previous.average_score : 0;
  return <article className="insight-daily-card">
    <h4>{dailyLabels[current.metric_key]}</h4>
    <p><span>直近7日</span><strong>{current.average_score}</strong><small>{current.entered_days}日分</small></p>
    {compare && previous ? <><p><span>前の7日</span><strong>{previous.average_score}</strong><small>{previous.entered_days}日分</small></p>
      <small className="insight-daily-note">{Math.abs(difference) < 0.5 ? "前の7日間と近い記録です。" : `前の7日間より少し${difference > 0 ? "高い" : "低い"}記録になっています。`}</small></>
      : <small className="insight-daily-note">比較できる日数の記録をためています。</small>}
  </article>;
}
