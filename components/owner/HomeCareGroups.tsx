"use client";

import { ReactNode, useRef, useState } from "react";
import type { CareGoal, CarePeriod, CareTemplate } from "@/lib/care/model";
import { careLayout, careState } from "@/lib/care/model";
import HomeCareEditor from "./HomeCareEditor";
import styles from "./HomeCareGroups.module.css";
export const carePeriods = [
  { key: "day", title: "毎日やること", label: "今日", hint: "今日のできたを、ひとつずつ。" },
  { key: "week", title: "今週中にやること", label: "今週", hint: "月曜〜日曜の目標。できる日に少しずつ。" },
  { key: "month", title: "今月中にやること", label: "今月", hint: "月単位の目標はこちら。" },
] as const;

type Props={initialPeriod?:CarePeriod;goals:CareGoal[];templates:CareTemplate[];progress:(goal:CareGoal)=>number;onComplete:(goal:CareGoal)=>Promise<void>;onCreate:(goal:CareTemplate,id:string)=>Promise<boolean>;onCountChange:(goal:CareGoal,count:number,reminderTime?:string|null)=>Promise<void>;onRemove:(goal:CareGoal)=>Promise<void>;icon:(goal:Pick<CareGoal,"goalType">)=>ReactNode;editable:boolean};
export default function HomeCareGroups({initialPeriod="day",goals,templates,progress,onComplete,onCreate,onCountChange,onRemove,icon,editable}:Props) {
  const lock = useRef(false);
  const returnFocus=useRef<HTMLElement|null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing,setEditing]=useState<CarePeriod|null>(null);
  const [error,setError]=useState("");
  const [selectedPeriod,setSelectedPeriod]=useState<CarePeriod>(initialPeriod);
  async function complete(goal: CareGoal) {
    if (lock.current) return;
    lock.current = true; setBusy(goal.id);
    setError("");
    try { await onComplete(goal); } catch { setError("記録できませんでした。もう一度お試しください。"); } finally { lock.current = false; setBusy(null); }
  }
  function edit(period:CarePeriod){returnFocus.current=document.activeElement as HTMLElement;setEditing(period);}
  return <section className={styles.groups} aria-label="期間ごとのお世話">
    <div className={styles.periodSwitch} role="group" aria-label="お世話の期間を選ぶ">
      {carePeriods.map(period=><button key={period.key} type="button" aria-pressed={selectedPeriod===period.key} aria-controls="home-care-panel" disabled={busy!==null} onClick={()=>setSelectedPeriod(period.key)}>{period.label==="今日"?"毎日":period.label}</button>)}
    </div>
    {carePeriods.filter(period=>period.key===selectedPeriod).map((period) => {
      const items = goals.filter((goal) => goal.period === period.key);
      const doneCount = items.filter((goal) => progress(goal) >= goal.targetCount).length;
      const layout=careLayout(items.length);
      return <section id="home-care-panel" className={styles.group} key={period.key} aria-labelledby={`care-${period.key}-title`}>
        <header className={styles.header}><div><h2 id={`care-${period.key}-title`}>{period.title}</h2>{items.length>0 && <span className={styles.total}>{doneCount} / {items.length} {period.key==="day"?"完了":"達成"}</span>}</div>
          <button type="button" className={styles.edit} disabled={busy!==null} aria-label={`${period.title}の目標・お知らせを設定`} onClick={()=>edit(period.key)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 5Z"/></svg>設定</button>
        </header>
        <p className={styles.resetHint}>{period.key==="day"?"毎日0時に切り替え":period.key==="week"?"毎週月曜0時に切り替え":"毎月1日0時に切り替え"}</p>
        {items.length ? <div className={`${styles.items} ${styles[layout]} ${items.length===1?styles.single:""}`} data-care-layout={layout}>{items.map((goal) => {
          const count = progress(goal); const done = count >= goal.targetCount;
          return <button type="button" className={`${styles.item} ${done?styles.done:""}`} key={goal.id} disabled={done || busy!==null} onClick={()=>void complete(goal)}
            aria-label={`${goal.title}：${period.label}${count}/${goal.targetCount}回、${done?period.key==="day"?"完了":"目標達成":"できたを1回追加"}`}>
            <span className={styles.icon} aria-hidden="true">{icon(goal)}</span><strong>{goal.title}</strong>
            <span className={styles.state}>{busy===goal.id?"保存中…":<><i aria-hidden="true">{done?"✓":"＋"}</i>{careState(period.key,count,goal.targetCount)}</>}</span>
          </button>;
        })}</div> : <button className={styles.empty} type="button" onClick={()=>edit(period.key)}>
          ＋ {period.key==="day"?"毎日":period.label}のやることを追加
        </button>}
      </section>;
    })}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {editing && <HomeCareEditor key={editing} period={editing} goals={goals} templates={templates} editable={editable} progress={progress} icon={icon} onCreate={onCreate} onCountChange={onCountChange} onRemove={onRemove} onClose={()=>{setEditing(null);returnFocus.current?.focus();}}/>}
  </section>;
}
