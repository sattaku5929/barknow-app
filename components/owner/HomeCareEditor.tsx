"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import type { CareGoal, CarePeriod, CareTemplate } from "@/lib/care/model";
import { careGoalError, validTargetCount } from "@/lib/care/model";
import styles from "./HomeCareGroups.module.css";

const titles={day:"毎日やること",week:"今週中にやること",month:"今月中にやること"};
const units={day:"1日",week:"1週間",month:"1か月"};
type Props={period:CarePeriod;goals:CareGoal[];templates:CareTemplate[];editable:boolean;progress:(goal:CareGoal)=>number;icon:(goal:Pick<CareGoal,"goalType">)=>ReactNode;onCreate:(goal:CareTemplate,id:string)=>Promise<boolean>;onCountChange:(goal:CareGoal,count:number)=>Promise<void>;onRemove:(goal:CareGoal)=>Promise<void>;onClose:()=>void};

function CountInput({value,onChange,label,disabled}:{value:string;onChange:(value:string)=>void;label:string;disabled:boolean}) {
  const count=Number(value);
  return <div className={styles.counter}>
    <button type="button" aria-label={`${label}を1回減らす`} disabled={disabled || count<=1 || !validTargetCount(count)} onClick={()=>onChange(String(count-1))}>−</button>
    <input type="number" min={1} max={31} step={1} required inputMode="numeric" aria-label={label} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/>
    <button type="button" aria-label={`${label}を1回増やす`} disabled={disabled || count>=31 || !validTargetCount(count)} onClick={()=>onChange(String(count+1))}>＋</button>
  </div>;
}
function EditRow({goal,period,busy,editable,icon,onSave,onRemove,onDirty}:{goal:CareGoal;period:CarePeriod;busy:boolean;editable:boolean;icon:Props["icon"];onSave:(goal:CareGoal,count:number)=>Promise<boolean>;onRemove:(goal:CareGoal)=>Promise<boolean>;onDirty:(id:string,dirty:boolean)=>void}) {
  const [value,setValue]=useState(String(goal.targetCount));
  const [confirm,setConfirm]=useState(false);
  const dirty=Number(value)!==goal.targetCount;
  function change(next:string){setValue(next);onDirty(goal.id,Number(next)!==goal.targetCount);}
  return <form className={styles.editRow} onSubmit={async(e:FormEvent)=>{e.preventDefault();if(await onSave(goal,Number(value)))onDirty(goal.id,false);}}>
    <div className={styles.rowHeading}><span className={styles.icon} aria-hidden="true">{icon(goal)}</span><strong>{goal.title}</strong><button className={styles.remove} type="button" disabled={busy || !editable} onClick={()=>setConfirm(true)} aria-label={`${goal.title}を一覧から外す`}>外す</button></div>
    <div className={styles.rowCount}><span>{units[period]}に</span><CountInput label={`${goal.title}の目標回数`} value={value} onChange={change} disabled={busy || !editable}/><span>回</span><button className={styles.apply} type="submit" disabled={busy || !editable || !dirty || !validTargetCount(Number(value))}>{dirty?"保存":"設定済み"}</button></div>
    {dirty && <p className={styles.draftNote}>保存するとホームの目標回数が変わります。</p>}
    {confirm && <div className={styles.confirm} role="group" aria-label={`${goal.title}を外す確認`}><p>「{goal.title}」を外しますか？過去の実績は残ります。</p><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>戻る</button><button type="button" disabled={busy || !editable} onClick={async()=>{if(await onRemove(goal))onDirty(goal.id,false);}}>外す</button></div>}
  </form>;
}
export default function HomeCareEditor({period,goals,templates,editable,progress,icon,onCreate,onCountChange,onRemove,onClose}:Props) {
  const dialog=useRef<HTMLDialogElement>(null);
  const lock=useRef(false);
  const dirtyRows=useRef(new Set<string>());
  const createId=useRef<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [title,setTitle]=useState("");
  const [count,setCount]=useState("1");
  const [goalType,setGoalType]=useState<CareGoal["goalType"]>("custom");
  useEffect(()=>{const node=dialog.current;if(node && !node.open)node.showModal();return()=>{node?.close();};},[]);
  function close(){if(lock.current)return;if((dirtyRows.current.size || title.trim()) && !window.confirm("保存していない入力があります。編集を閉じますか？"))return;dialog.current?.close();onClose();}
  async function run(action:()=>Promise<void>,message:string) {
    if(lock.current)return false;
    if(!editable){setError("接続してから編集してください。");return false;}
    lock.current=true;setBusy(true);setError("");setNotice("");
    try{await action();setNotice(message);return true;}
    catch(e){setError(e instanceof Error?e.message:"保存できませんでした。もう一度お試しください。");return false;}
    finally{lock.current=false;setBusy(false);}
  }
  async function add(e:FormEvent) {
    e.preventDefault();
    const template:CareTemplate={title:title.trim(),targetCount:Number(count),period,goalType,reminderTime:null};
    const invalid=careGoalError(template);if(invalid){setError(invalid);return;}
    if(goals.some(g=>g.title===template.title)){setError("この項目はすでに追加されています。");return;}
    if(!createId.current)createId.current=crypto.randomUUID();
    const id=createId.current;
    const saved=await run(async()=>{if(!await onCreate(template,id))throw new Error("追加できませんでした。入力内容を確認してもう一度お試しください。");},`「${template.title}」を追加しました。`);
    if(saved){setTitle("");setCount("1");setGoalType("custom");createId.current=null;}
  }
  const items=goals.filter(g=>g.period===period);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="care-editor-title" onCancel={e=>{e.preventDefault();close();}}>
    <header className={styles.dialogHeader}><div><small>MY ROUTINE</small><h2 id="care-editor-title">{titles[period]}を編集</h2></div><button type="button" className={styles.close} aria-label="編集を閉じる" disabled={busy} onClick={close}>×</button></header>
    <p className={styles.intro}>{period==="day"?"1日に何回やるか、暮らしに合わせて設定。":`${units[period]}の目標回数を、無理なく続けられる数に。`}</p>
    {!editable && <p className={styles.error} role="status">オンライン接続後に追加・変更できます。</p>}
    <section aria-label="登録済みのお世話" className={styles.editList}>
      {items.length?items.map(goal=><EditRow key={`${goal.id}:${goal.targetCount}`} goal={goal} period={period} busy={busy} editable={editable} icon={icon} onDirty={(id,dirty)=>{if(dirty)dirtyRows.current.add(id);else dirtyRows.current.delete(id);}}
        onSave={(g,next)=>run(async()=>{await onCountChange(g,next);},`「${goal.title}」を${units[period]}${next}回に変更しました。実績${progress(goal)}回はそのままです。`)}
        onRemove={g=>run(async()=>{await onRemove(g);},`「${goal.title}」を一覧から外しました。`)}/>):<p className={styles.intro}>まだ項目がありません。下から追加できます。</p>}
    </section>
    <form className={styles.addForm} onSubmit={e=>void add(e)}><h3>やることを追加</h3>
      <div className={styles.presets} aria-label="おすすめの項目">{templates.filter(t=>!goals.some(g=>g.title===t.title)).map(t=><button type="button" key={t.title} disabled={busy || !editable} onClick={()=>{setTitle(t.title);setGoalType(t.goalType);setCount(String(t.period===period?t.targetCount:1));}}>{icon(t)}<span>{t.title}</span></button>)}</div>
      <label className={styles.titleField}>やること<input type="text" required maxLength={40} placeholder="例：散歩後に足を拭く" value={title} disabled={busy || !editable} onChange={e=>{setTitle(e.target.value);setGoalType("custom");}}/></label>
      <div className={styles.rowCount}><span>{units[period]}に</span><CountInput label="追加する項目の目標回数" value={count} onChange={setCount} disabled={busy || !editable}/><span>回</span></div>
      <button className={styles.add} type="submit" disabled={busy || !editable || !title.trim() || !validTargetCount(Number(count))}>{busy?"保存中…":"＋ 追加する"}</button>
    </form>
    <p className={styles.feedback} aria-live="polite">{busy?"保存しています…":notice}</p>{error && <p className={styles.error} role="alert">{error}</p>}
    <button className={styles.finish} type="button" disabled={busy} onClick={close}>編集を終える</button>
  </dialog>;
}
