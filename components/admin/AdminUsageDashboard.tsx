"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";
import styles from "./AdminUsageDashboard.module.css";

type DailyUsage = { date: string; active_owners: number; daily_check_users: number };
type Usage = {
  as_of: string;
  owner_count: number;
  coach_count: number;
  admin_count: number;
  active_owners_7d: number;
  daily_check_users_7d: number;
  daily_check_days_7d: number;
  coaching_applications_total: number;
  coaching_applications_7d: number;
  daily: DailyUsage[];
};
const n = (v: number) => v.toLocaleString("ja-JP");
function pct(num: number, denominator: number) {
  return denominator > 0 ? `${Math.round((num / denominator) * 100)}%` : "—";
}
function weekday(value: string) {
  const d = new Date(`${value}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(d);
}
export default function AdminUsageDashboard() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: requestError } = await supabase.rpc("wt_admin_usage_dashboard");
    if (requestError || !data) {
      setError("利用状況を取得できませんでした。権限または集計用DBの設定を確認してください。");
      setUsage(null);
    } else {
      setUsage(data as Usage);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const maxDaily = Math.max(1, ...(usage?.daily ?? []).map((day) => Math.max(day.active_owners, day.daily_check_users)));
  return (
    <section className={styles.dashboard} aria-labelledby="usage-dashboard-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>ADMIN ANALYTICS</p>
          <h2 id="usage-dashboard-title">利用状況ダッシュボード</h2>
          <p className={styles.description}>直近7日間（日本時間・今日を含む）の利用状況</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className={styles.refresh}>{loading ? "更新中…" : "更新する"}</button>
      </header>
      {loading && <p className={styles.status} role="status">利用状況を読み込んでいます…</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {usage && !loading && <>
        <div className={styles.metrics}>
          <article className={styles.metric}><span>登録会員数</span><strong>{n(usage.owner_count + usage.coach_count + usage.admin_count)}<small>人</small></strong><p>Owner {n(usage.owner_count)}人 · Coach {n(usage.coach_count)}人 · Admin {n(usage.admin_count)}人</p></article>
          <article className={styles.metric}><span>7日間のアクティブOwner</span><strong>{n(usage.active_owners_7d)}<small>人</small></strong><p>訪問履歴があるOwner（重複除外）</p></article>
          <article className={styles.metric}><span>Daily Check利用率</span><strong>{pct(usage.daily_check_users_7d, usage.owner_count)}</strong><p>{n(usage.daily_check_users_7d)} / {n(usage.owner_count)}人が期間内に1日以上入力</p></article>
          <article className={styles.metric}><span>7日間のコーチング申込み</span><strong>{n(usage.coaching_applications_7d)}<small>件</small></strong><p>累計 {n(usage.coaching_applications_total)}件</p></article>
        </div>
        <div className={styles.chartCard}>
          <div className={styles.chartHeading}>
            <div><h3>日別の利用状況</h3><p>訪問OwnerとDaily Check入力Ownerの人数</p></div>
            <div className={styles.legend}><span><i className={styles.visitsKey} />訪問</span><span><i className={styles.checksKey} />Daily Check</span></div>
          </div>
          <div className={styles.chart} role="img" aria-label={usage.daily.map((day) => `${day.date}: 訪問${day.active_owners}人、Daily Check${day.daily_check_users}人`).join("、")}>
            {usage.daily.map((day) => (
              <div key={day.date} className={styles.day}>
                <div className={styles.bars}>
                  <div className={styles.barVisits} style={{ height: `${(day.active_owners / maxDaily) * 100}%` }} />
                  <div className={styles.barChecks} style={{ height: `${(day.daily_check_users / maxDaily) * 100}%` }} />
                </div>
                <span>{Number(day.date.slice(-2))}日</span>
                <small>{weekday(day.date)}</small>
              </div>
            ))}
          </div>
        </div>
        <p className={styles.footnote}>集計基準：日本時間の暦日。Daily Check利用率の分母は現在のOwner会員数です。削除済みの記録は対象外です。訪問履歴が保存されないアクセスはアクティブ数に含まれません。集計値のみ取得し、個人別データは表示しません。更新日：{usage.as_of}</p>
      </>}
    </section>
  );
}
