export default function InsightEmptyState({ hasRecords }: { hasRecords: boolean }) {
  return <div className="insight-empty-state">
    <span aria-hidden="true">✦</span>
    <p>{hasRecords ? "まだ傾向を見るには記録が少ないようです。" : "これからの記録を楽しみにしています。"}</p>
    <small>もう少し記録がたまると、変化を振り返りやすくなります。</small>
  </div>;
}
