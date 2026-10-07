"use client";

import { ReactNode, useRef, useState } from "react";
type Goal = { id: string; title: string; period: "day" | "week" | "month"; targetCount: number };
export const carePeriods = [
  { key: "day", title: "毎日やること", label: "今日", hint: "今日のできたを、ひとつずつ。" },
  { key: "week", title: "今週中にやること", label: "今週", hint: "月曜〜日曜の目標。できる日に少しずつ。" },
  { key: "month", title: "今月中にやること", label: "今月", hint: "月単位の目標はこちら。" },
] as const;

export default function HomeCareGroups<T extends Goal>({ goals, progress, onComplete, onManage, icon }: {
  goals: T[]; progress: (goal: T) => number; onComplete: (goal: T) => Promise<void>;
  onManage: () => void; icon: (goal: T) => ReactNode;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  async function complete(goal: T) {
    if (lock.current) return;
    lock.current = true; setBusy(goal.id);
    try { await onComplete(goal); } finally { lock.current = false; setBusy(null); }
  }
  return <section className="home-care-groups" aria-label="期間ごとのお世話">
    {carePeriods.filter((period) => period.key !== "month" || goals.some((goal) => goal.period === "month")).map((period) => {
      const items = goals.filter((goal) => goal.period === period.key);
      const doneCount = items.filter((goal) => progress(goal) >= goal.targetCount).length;
      return <section className="home-v3-care care-period-group" key={period.key} aria-labelledby={`care-${period.key}-title`}>
        <header><div className="home-v3-care-title"><div><h2 id={`care-${period.key}-title`}>{period.title}</h2></div></div>
          <div className="home-v3-care-progress"><strong>{doneCount}<small> / {items.length} 達成</small></strong>
            <span role="progressbar" aria-label={`${period.title}の達成率`} aria-valuemin={0} aria-valuemax={items.length || 1} aria-valuenow={doneCount}>
              <i style={{ width: `${items.length ? doneCount / items.length * 100 : 0}%` }} />
            </span></div></header>
        <p className="care-period-hint">{period.hint}</p>
        {items.length ? <div className="home-v3-care-grid">{items.map((goal) => {
          const count = progress(goal); const done = count >= goal.targetCount;
          return <article className={done ? "is-done" : ""} key={goal.id}>
            <span className="home-v3-care-icon" aria-hidden="true">{icon(goal)}</span>
            <strong>{goal.title}</strong><small>{period.label} {Math.min(count, goal.targetCount)} / {goal.targetCount}回</small>
            <button type="button" disabled={done || busy !== null} onClick={() => void complete(goal)}
              aria-label={`${goal.title}：${done ? "目標達成" : "できたを1回追加"}`}>{busy === goal.id ? "保存中" : done ? "✓ 達成" : "＋ できた"}</button>
          </article>;
        })}</div> : <button className="home-v3-care-empty" type="button" onClick={onManage}>
          <span><strong>{period.label}のお世話を決める</strong><small>目標を追加すると、ここに表示されます。</small></span><b aria-hidden="true">→</b>
        </button>}
      </section>;
    })}
    <button className="care-groups-manage" type="button" onClick={onManage}>お世話の目標・お知らせを編集する <span aria-hidden="true">→</span></button>
  </section>;
}
