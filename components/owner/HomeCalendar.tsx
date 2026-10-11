"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { addDays, eventsOnDate, monthDays, moveMonth, scheduleError, scheduleKinds, weekStart } from "@/lib/calendar/model";
import type { CalendarEvent, CalendarRecord, ScheduleKind } from "@/lib/calendar/model";
import { deleteCalendarEvent, loadCalendar, saveCalendarEvent } from "@/lib/calendar/service";
import CalendarDays from "./CalendarDays";
import { holidayYearCovered } from "@/lib/calendar/holidays";

type Props = { dogId?:string; dogName:string; birthday:string; online:boolean; today:string; refreshToken:string; onRecord:(date:string,kind:"daily"|"win"|null,note?:string)=>void };
const dayLabel = (date:string) => new Intl.DateTimeFormat("ja-JP",{month:"long",day:"numeric",weekday:"short",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));

export default function HomeCalendar({dogId,birthday,online,today,refreshToken}:Props) {
  const [selected,setSelected] = useState(today);
  const [mode,setMode] = useState<"week"|"month">("month");
  const [loaded,setLoaded] = useState<{key:string;events:CalendarEvent[];records:CalendarRecord[];error:string}|null>(null);
  const [revision,setRevision] = useState(0);
  const [notice,setNotice] = useState("");
  const [draft,setDraft] = useState<CalendarEvent|null>(null);
  const [isNew,setIsNew] = useState(true);
  const [saving,setSaving] = useState(false);
  const [formError,setFormError] = useState("");
  const [editingDate,setEditingDate] = useState<string|null>(null);
  const lock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement|null>(null);
  const dates = mode === "month" ? monthDays(selected) : Array.from({length:7},(_,i)=>addDays(weekStart(selected),i));
  const start = dates[0], end = dates[dates.length-1];
  const loadKey = `${dogId}:${online}:${start}:${end}:${refreshToken}:${revision}`;
  const loading = online && !!dogId && loaded?.key !== loadKey;
  const current = loaded?.key === loadKey && online ? loaded : null;
  const events = current?.events ?? [];
  const records = current?.records ?? [];
  const loadError = current?.error ?? "";

  useEffect(() => {
    let cancelled = false;
    if (!dogId || !online) return;
    loadCalendar(dogId,start,end).then(data => {
      if (!cancelled) setLoaded({key:loadKey,...data,error:""});
    }).catch(() => { if (!cancelled) setLoaded({key:loadKey,events:[],records:[],error:"読み込めませんでした。再読み込みしてください。"}); });
    return () => { cancelled = true; };
  },[dogId,online,start,end,loadKey]);
  useEffect(() => {
    if (draft && dialog.current && !dialog.current.open) dialog.current.showModal();
  },[draft]);

  function close() {
    if (lock.current) return;
    dialog.current?.close(); setDraft(null); setFormError(""); returnFocus.current?.focus();
  }
  function open(kind:ScheduleKind, event?:CalendarEvent, date = selected) {
    if (!dogId || !online || loading) return;
    if (!draft) returnFocus.current = document.activeElement as HTMLElement;
    setEditingDate(date);
    setFormError(""); setIsNew(!event);
    setDraft(event ? {...event,start_time:event.start_time?.slice(0,5) ?? null} : {
      id:crypto.randomUUID(),dog_id:dogId,category:kind,title:scheduleKinds.find(k=>k.key===kind)?.title ?? "",
      start_date:date,end_date:date,start_time:null,location:"",note:"",
    });
  }
  async function mutate(remove = false) {
    if (!draft || lock.current) return;
    if (!online) { setFormError("接続してから保存してください。"); return; }
    const error = scheduleError(draft);
    if (!remove && error) { setFormError(error); return; }
    if (remove && !window.confirm(`「${draft.title}」を削除しますか？`)) return;
    lock.current = true; setSaving(true); setFormError("");
    try {
      if (remove) await deleteCalendarEvent(draft); else await saveCalendarEvent(draft,isNew);
      setSelected(draft.start_date); setRevision(r=>r+1); setNotice(remove ? "予定を削除しました。" : "予定を保存しました。");
      lock.current = false; close();
    } catch { setFormError("保存できませんでした。入力内容はそのままです。接続を確認してもう一度お試しください。"); }
    finally { lock.current = false; setSaving(false); }
  }
  return <section className="home-calendar" aria-labelledby="calendar-heading">
    <header className="calendar-heading"><div><small>OUR DAYS</small><h2 id="calendar-heading">愛犬とのカレンダー</h2></div><button className="calendar-add" type="button" disabled={!online || !dogId || loading} onClick={()=>open("other")}>＋ 予定</button></header>
    <div className="calendar-toolbar"><div className="calendar-mode" aria-label="表示期間">{(["week","month"] as const).map(m=><button key={m} type="button" aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==="week"?"週":"月"}</button>)}</div><button type="button" onClick={()=>setSelected(today)}>今日</button></div>
    <div className="calendar-nav"><button type="button" aria-label={mode==="week"?"前の週":"前の月"} onClick={()=>setSelected(mode==="week"?addDays(selected,-7):moveMonth(selected,-1))}>‹</button><span aria-live="polite">{mode==="week"?`${selected.slice(0,4)}年 ${dayLabel(start)} 〜 ${dayLabel(end)}`:`${selected.slice(0,4)}年 ${Number(selected.slice(5,7))}月`}</span><button type="button" aria-label={mode==="week"?"次の週":"次の月"} onClick={()=>setSelected(mode==="week"?addDays(selected,7):moveMonth(selected,1))}>›</button></div>
    <CalendarDays key={mode} dates={dates} mode={mode} selected={selected} today={today} birthday={birthday} events={events} records={records} onSelect={setSelected}
      onDateOpen={date=>{const plans=eventsOnDate(events,date);open(plans.length===1?plans[0].category:"other",plans.length===1?plans[0]:undefined,date);}}
      onEvent={event=>open(event.category,event,event.start_date)} />
    {dates.some(date=>!holidayYearCovered(date)) && <p className="calendar-feedback">表示中の一部の日付は、祝日情報が未確認です。</p>}
    <div className="calendar-feedback" aria-live="polite">{loading ? "読み込み中…" : !dogId ? "愛犬を登録すると予定を追加できます。" : !online ? "接続後に予定と記録を確認できます。" : loadError ? <>{loadError}<button type="button" onClick={()=>setRevision(r=>r+1)}>再読み込み</button></> : notice}</div>
    {draft && <dialog ref={dialog} className="calendar-dialog" aria-labelledby="schedule-title" onCancel={e=>{e.preventDefault();close();}} onClose={()=>{if(!lock.current)setDraft(null);}}>
      <form onSubmit={(e:FormEvent)=>{e.preventDefault();void mutate();}}><header><div><small>PLAN</small><h2 id="schedule-title">{isNew?"予定を追加":"予定を編集"}</h2></div><button type="button" aria-label="閉じる" disabled={saving} onClick={close}>×</button></header>
        {editingDate && <div className="calendar-date-editor"><strong>{dayLabel(editingDate)}</strong>
          <div>{eventsOnDate(events,editingDate).map(event=><button type="button" key={event.id} disabled={saving} aria-pressed={draft.id===event.id}
            onClick={()=>open(event.category,event,editingDate)}>{event.title}</button>)}
            <button type="button" disabled={saving} aria-pressed={isNew} onClick={()=>open("other",undefined,editingDate)}>＋ この日に予定を追加</button></div>
        </div>}
        <fieldset disabled={saving}><legend className="sr-only">予定の内容</legend>
          <div className="schedule-kind-picker">{scheduleKinds.map(k=><button type="button" key={k.key} aria-pressed={draft.category===k.key} onClick={()=>setDraft({...draft,category:k.key,title:!draft.title || scheduleKinds.some(x=>x.title===draft.title)?k.title:draft.title})}>{k.label}</button>)}</div>
          <label>予定名<input autoFocus required maxLength={100} value={draft.title} placeholder="例：代々木公園のイベント" onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
          <label>日付<input required type="date" value={draft.start_date} onChange={e=>setDraft({...draft,start_date:e.target.value,end_date:draft.end_date<e.target.value?e.target.value:draft.end_date})}/></label>
          <details open={draft.category==="travel" || !isNew}><summary>終了日・時間・場所・メモ</summary><div className="schedule-date-row"><label>終了日<input type="date" required min={draft.start_date} value={draft.end_date} onChange={e=>setDraft({...draft,end_date:e.target.value})}/></label><label>時間（任意）<input type="time" value={draft.start_time ?? ""} onChange={e=>setDraft({...draft,start_time:e.target.value || null})}/></label></div><label>場所<input maxLength={200} value={draft.location} onChange={e=>setDraft({...draft,location:e.target.value})}/></label><label>メモ<textarea rows={3} maxLength={2000} value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label></details>
        </fieldset>
        {formError && <p className="schedule-error" role="alert">{formError}</p>}
        <button className="schedule-save" type="submit" disabled={saving || !online}>{saving?"保存中…":"保存する"}</button>{!isNew && <button className="schedule-delete" type="button" disabled={saving || !online} onClick={()=>void mutate(true)}>この予定を削除</button>}
      </form>
    </dialog>}
  </section>;
}
