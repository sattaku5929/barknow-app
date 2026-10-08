"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import type { CareGoal, CarePeriod, CareTemplate } from "@/lib/care/model";
import { careGoalError, validTargetCount, careIconOptions } from "@/lib/care/model";
import styles from "./HomeCareGroups.module.css";

const titles={day:"毎日やること",week:"今週中にやること",month:"今月中にやること"};
const units={day:"1日",week:"1週間",month:"1か月"};
type Props={period:CarePeriod;goals:CareGoal[];templates:CareTemplate[];editable:boolean;progress:(goal:CareGoal)=>number;icon:(goal:Pick<CareGoal,"goalType">)=>ReactNode;onCreate:(goal:CareTemplate,id:string)=>Promise<boolean>;onCountChange:(goal:CareGoal,count:number,reminderTime?:string|null,goalType?:CareGoal["goalType"])=>Promise<void>;onIconChange:(goal:CareGoal,goalType:CareGoal["goalType"])=>Promise<void>;onRemove:(goal:CareGoal)=>Promise<void>;onClose:()=>void};

function IconPicker({value,onChange,icon,label,disabled}:{value:CareGoal["goalType"];onChange:(value:CareGoal["goalType"])=>void|Promise<boolean>;icon:Props["icon"];label:string;disabled:boolean}) {
  const details=useRef<HTMLDetailsElement>(null);
  const selected=careIconOptions.find(option=>option.value===value);
  return <details ref={details} className={styles.iconDetails}><summary><span className={styles.icon} aria-hidden="true">{icon({goalType:value})}</span><span>{label}<small>{selected?.label ?? "プラス"} · 変更する</small></span></summary><fieldset className={styles.iconPicker} disabled={disabled}><legend>{label}</legend>
    {Array.from(new Set(careIconOptions.map(option=>option.category))).map(category=><div className={styles.iconCategory} key={category}><p>{category}</p><div className={styles.iconOptions}>
      {careIconOptions.filter(option=>option.category===category).map(option=><label key={option.value} className={`${styles.iconOption} ${value===option.value?styles.iconSelected:""}`}>
        <input type="radio" name="care-icon" value={option.value} checked={value===option.value} onChange={async()=>{if(await onChange(option.value)!==false && details.current)details.current.open=false;}}/>
        <span className={styles.icon} aria-hidden="true">{icon({goalType:option.value})}</span><span>{option.label}</span>
      </label>)}
    </div></div>)}
  </fieldset></details>;
}
function CountInput({value,onChange,label,disabled}:{value:string;onChange:(value:string)=>void;label:string;disabled:boolean}) {
  const count=Number(value);
  return <div className={styles.counter}>
    <button type="button" aria-label={`${label}を1回減らす`} disabled={disabled || count<=1 || !validTargetCount(count)} onClick={()=>onChange(String(count-1))}>−</button>
    <input type="number" min={1} max={31} step={1} required inputMode="numeric" aria-label={label} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/>
    <button type="button" aria-label={`${label}を1回増やす`} disabled={disabled || count>=31 || !validTargetCount(count)} onClick={()=>onChange(String(count+1))}>＋</button>
  </div>;
}
function EditRow({goal,period,busy,editable,icon,onSave,onIconSave,onRemove,onDirty}:{goal:CareGoal;period:CarePeriod;busy:boolean;editable:boolean;icon:Props["icon"];onSave:(goal:CareGoal,count:number,reminderTime:string|null)=>Promise<boolean>;onIconSave:(goal:CareGoal,goalType:CareGoal["goalType"])=>Promise<boolean>;onRemove:(goal:CareGoal)=>Promise<boolean>;onDirty:(id:string,dirty:boolean)=>void}) {
  const [value,setValue]=useState(String(goal.targetCount));
  const [reminder,setReminder]=useState(goal.reminderTime ?? "");
  const [confirm,setConfirm]=useState(false);
  const dirty=Number(value)!==goal.targetCount || reminder!==(goal.reminderTime ?? "");
  function change(next:string){setValue(next);onDirty(goal.id,Number(next)!==goal.targetCount || reminder!==(goal.reminderTime ?? ""));}
  function changeReminder(next:string){setReminder(next);onDirty(goal.id,Number(value)!==goal.targetCount || next!==(goal.reminderTime ?? ""));}
  return <form className={styles.editRow} onSubmit={async(e:FormEvent)=>{e.preventDefault();if(await onSave(goal,Number(value),reminder || null))onDirty(goal.id,false);}}>
    <div className={styles.rowHeading}><span className={styles.icon} aria-hidden="true">{icon(goal)}</span><strong>{goal.title}</strong><button className={styles.remove} type="button" disabled={busy || !editable} onClick={()=>setConfirm(true)} aria-label={`${goal.title}を一覧から外す`}>外す</button></div>
    <IconPicker value={goal.goalType} onChange={next=>onIconSave(goal,next)} icon={icon} label={`${goal.title}のアイコン`} disabled={busy || !editable}/>
    <div className={styles.rowCount}><span>{units[period]}に</span><CountInput label={`${goal.title}の目標回数`} value={value} onChange={change} disabled={busy || !editable}/><span>回</span><button className={styles.apply} type="submit" disabled={busy || !editable || !dirty || !validTargetCount(Number(value))}>{dirty?"保存":"設定済み"}</button></div>
    <div className={styles.reminder}><label htmlFor={`care-reminder-${goal.id}`}>お知らせ時間</label><input id={`care-reminder-${goal.id}`} type="time" value={reminder} disabled={busy || !editable} onChange={e=>changeReminder(e.target.value)} aria-label={`${goal.title}のお知らせ時間`}/>{reminder && <button type="button" disabled={busy || !editable} onClick={()=>changeReminder("")}>解除</button>}</div>
    {dirty && <p className={styles.draftNote}>目標・お知らせを変更したら「保存」を押してください。</p>}
    {confirm && <div className={styles.confirm} role="group" aria-label={`${goal.title}を外す確認`}><p>「{goal.title}」を外しますか？過去の実績は残ります。</p><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>戻る</button><button type="button" disabled={busy || !editable} onClick={async()=>{if(await onRemove(goal))onDirty(goal.id,false);}}>外す</button></div>}
  </form>;
}
export default function HomeCareEditor({period,goals,templates,editable,progress,icon,onCreate,onCountChange,onIconChange,onRemove,onClose}:Props) {
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
    <header className={styles.dialogHeader}><div><small>MY ROUTINE</small><h2 id="care-editor-title">{titles[period]}の設定</h2></div><button type="button" className={styles.close} aria-label="設定を閉じる" disabled={busy} onClick={close}>×</button></header>
    <p className={styles.intro}>{period==="day"?"1日に何回やるか、暮らしに合わせて設定。":`${units[period]}の目標回数を、無理なく続けられる数に。`}</p>
    {!editable && <p className={styles.error} role="status">オンライン接続後に追加・変更できます。</p>}
    <section aria-label="登録済みのお世話" className={styles.editList}>
      {items.length?items.map(goal=><EditRow key={`${goal.id}:${goal.targetCount}:${goal.reminderTime ?? ""}`} goal={goal} period={period} busy={busy} editable={editable} icon={icon} onDirty={(id,dirty)=>{if(dirty)dirtyRows.current.add(id);else dirtyRows.current.delete(id);}}
        onSave={(g,next,time)=>run(async()=>{await onCountChange(g,next,time);},`「${goal.title}」の設定を保存しました。実績${progress(goal)}回はそのままです。`)}
        onIconSave={(g,nextIcon)=>run(async()=>{await onIconChange(g,nextIcon);},`「${goal.title}」のアイコンを変更しました。`)}
        onRemove={g=>run(async()=>{await onRemove(g);},`「${goal.title}」を一覧から外しました。`)}/>):<p className={styles.intro}>まだ項目がありません。下から追加できます。</p>}
    </section>
    <form className={styles.addForm} onSubmit={e=>void add(e)}><h3>やることを追加</h3>
      <div className={styles.presets} aria-label="おすすめの項目">{templates.filter(t=>!goals.some(g=>g.title===t.title)).map(t=><button type="button" key={t.title} disabled={busy || !editable} onClick={()=>{setTitle(t.title);setGoalType(t.goalType);setCount(String(t.period===period?t.targetCount:1));}}>{icon(t)}<span>{t.title}</span></button>)}</div>
      <label className={styles.titleField}>やること<input type="text" required maxLength={40} placeholder="例：散歩後に足を拭く" value={title} disabled={busy || !editable} onChange={e=>{setTitle(e.target.value);}}/></label>
      <IconPicker value={goalType} onChange={setGoalType} icon={icon} label="追加する項目のアイコン" disabled={busy || !editable}/>
      <div className={styles.rowCount}><span>{units[period]}に</span><CountInput label="追加する項目の目標回数" value={count} onChange={setCount} disabled={busy || !editable}/><span>回</span></div>
      <button className={styles.add} type="submit" disabled={busy || !editable || !title.trim() || !validTargetCount(Number(count))}>{busy?"保存中…":"＋ 追加する"}</button>
    </form>
    <p className={styles.feedback} aria-live="polite">{busy?"保存しています…":notice}</p>{error && <p className={styles.error} role="alert">{error}</p>}
    <button className={styles.finish} type="button" disabled={busy} onClick={close}>設定を終える</button>
  </dialog>;
}
