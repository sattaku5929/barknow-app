import { eventResultLabels, themeLabel } from "@/lib/insights/presentation";
import type { ThemeTrend } from "@/lib/insights/trendTypes";
import styles from "./ThemeTrendTable.module.css";

const results = ["success", "neutral", "concern"] as const;

export default function ThemeTrendTable({ trends, onRecords }: {
  trends: ThemeTrend[];
  onRecords: (trend: ThemeTrend) => void;
}) {
  return <div className={styles.panel}>
    <div className={styles.legend} aria-label="できごとの評価">
      {results.map(result => <span key={result}><i className={styles[result]} aria-hidden="true" />{eventResultLabels[result]}</span>)}
    </div>
    <table className={styles.table}>
      <caption>直近7日間の記録内訳。テーマを押すと元の記録を確認できます。</caption>
      <colgroup><col className={styles.themeColumn} /><col className={styles.totalColumn} /><col /></colgroup>
      <thead><tr><th scope="col">テーマ</th><th scope="col">件数</th><th scope="col">評価の内訳</th></tr></thead>
      <tbody>{trends.map(trend => {
        const label = themeLabel(trend.theme_key);
        const counts = [trend.success_count, trend.neutral_count, trend.concern_count];
        // Counts determine the relative widths, avoiding gaps from rounded RPC rates.
        const ratedCount = counts.reduce((sum, count) => sum + count, 0);
        const description = results.map((result, index) => `${eventResultLabels[result]}${counts[index]}件`).join("、");
        return <tr key={trend.theme_key}>
          <th scope="row"><button type="button" onClick={() => onRecords(trend)} aria-label={`${label}の記録を見る、全${trend.total_count}件`}>
            <span>{label}</span><small>記録を見る <span aria-hidden="true">→</span></small>
          </button></th>
          <td className={styles.total}>{trend.total_count}</td>
          <td>
            <div className={styles.bar} role="img" aria-label={description}>
              {results.map((result, index) => counts[index] > 0 ? <i key={result} className={styles[result]}
                style={{ width: `${ratedCount ? counts[index] / ratedCount * 100 : 0}%` }} /> : null)}
            </div>
            <div className={styles.counts} aria-hidden="true">{results.map((result, index) =>
              <span key={result}><i className={styles[result]} />{counts[index]}</span>)}</div>
          </td>
        </tr>;
      })}</tbody>
    </table>
    <p className={styles.note}>棒は割合、数字は件数です。</p>
  </div>;
}
