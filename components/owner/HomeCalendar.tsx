"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { addDays, eventsOnDate, isBirthday, monthDays, moveMonth, scheduleError, scheduleKinds, weekStart } from "@/lib/calendar/model";
import type { CalendarEvent, CalendarRecord, ScheduleKind } from "@/lib/calendar/model";
import { deleteCalendarEvent, loadCalendar, saveCalendarEvent } from "@/lib/calendar/service";
import CalendarDays from "./CalendarDays";

type Props = { dogId?:string; dogName:string; birthday:string; online:boolean; today:string; refreshToken:string; onRecord:(date:string,kind:"daily"|"win"|null,note?:string)=>void };
const dayLabel = (date:string) => new Intl.DateTimeFormat("ja-JP",{month:"long",day:"numeric",weekday:"short",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));

export default function HomeCalendar({dogId,dogName,birthday,online,today,refreshToken,onRecord}:Props) {
  const [selected,setSelected] = useState(today);
  const [mode,setMode] = useState<"week"|"month">("month");
  const [loaded,setLoaded] = useState<{key:string;events:CalendarEvent[];records:CalendarRecord[];error:string}|null>(null);
  const [revision,setRevision] = useState(0);
  const [notice,setNotice] = useState("");
  const [quickWins,setQuickWins] = useState(false);
  const [draft,setDraft] = useState<CalendarEvent|null>(null);
  const [isNew,setIsNew] = useState(true);
  const [saving,setSaving] = useState(false);
  const [formError,setFormError] = useState("");
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
  function open(kind:ScheduleKind, event?:CalendarEvent) {
    if (!dogId || !online || loading) return;
    returnFocus.current = document.activeElement as HTMLElement;
    setFormError(""); setIsNew(!event);
    setDraft(event ? {...event,start_time:event.start_time?.slice(0,5) ?? null} : {
      id:crypto.randomUUID(),dog_id:dogId,category:kind,title:scheduleKinds.find(k=>k.key===kind)?.title ?? "",
      start_date:selected,end_date:selected,start_time:null,location:"",note:"",
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
  const dayEvents = eventsOnDate(events,selected);
  const dayRecords = records.filter(r=>r.date===selected);
  const grouped = Array.from(new Set(dayRecords.map(r=>r.title))).map(title=>({title,items:dayRecords.filter(r=>r.title===title)}));
  const ready = online && !!dogId && !loading && !loadError;
  const anniversary = isBirthday(birthday,selected);

  return <section className="home-calendar" aria-labelledby="calendar-heading">
    <header className="calendar-heading"><div><small>OUR DAYS</small><h2 id="calendar-heading">愛犬とのカレンダー</h2></div><button className="calendar-add" type="button" disabled={!online || !dogId || loading} onClick={()=>open("other")}>＋ 予定</button></header>
    <div className="calendar-toolbar"><strong>{selected.slice(0,4)}年 {Number(selected.slice(5,7))}月</strong><div className="calendar-mode" aria-label="表示期間">{(["week","month"] as const).map(m=><button key={m} type="button" aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==="week"?"週":"月"}</button>)}</div><button type="button" onClick={()=>setSelected(today)}>今日</button></div>
    <div className="calendar-nav"><button type="button" aria-label={mode==="week"?"前の週":"前の月"} onClick={()=>setSelected(mode==="week"?addDays(selected,-7):moveMonth(selected,-1))}>‹</button><span>{mode==="week"?`${dayLabel(start)} 〜 ${dayLabel(end)}`:"日付をタップして予定と記録を確認"}</span><button type="button" aria-label={mode==="week"?"次の週":"次の月"} onClick={()=>setSelected(mode==="week"?addDays(selected,7):moveMonth(selected,1))}>›</button></div>
    <CalendarDays key={mode} dates={dates} mode={mode} selected={selected} today={today} birthday={birthday} events={events} records={records} onSelect={setSelected} />
    <p className="calendar-legend"><span><i className="plan-dot" />予定・誕生日</span><span><i className="record-dot" />できた・記録</span></p>
    <div className="calendar-feedback" aria-live="polite">{loading ? "読み込み中…" : !dogId ? "愛犬を登録すると予定を追加できます。" : !online ? "接続後に予定と記録を確認できます。" : loadError ? <>{loadError}<button type="button" onClick={()=>setRevision(r=>r+1)}>再読み込み</button></> : notice}</div>
    <div className="calendar-agenda" aria-busy={loading}><h3>{dayLabel(selected)}{selected===today && <small>今日</small>}</h3>
      {anniversary && <div className="calendar-birthday"><span>祝</span><div><strong>{dogName}ちゃんの誕生日</strong><small>大切な一日を「できた！」に残そう。</small></div></div>}
      {ready && <>
        <h4>予定 <small>{dayEvents.length}</small></h4>
        {dayEvents.length ? dayEvents.map(event=><button className="calendar-agenda-event" key={event.id} type="button" onClick={()=>open(event.category,event)}><span className="calendar-kind">{scheduleKinds.find(k=>k.key===event.category)?.mark}</span><span><strong>{event.title}</strong><small>{event.start_time?.slice(0,5) || "終日"}{event.end_date!==event.start_date?` · ${event.start_date.slice(5)}〜${event.end_date.slice(5)}`:""}{event.location?` · ${event.location}`:""}</small>{event.note && <em>{event.note}</em>}</span><b aria-hidden="true">›</b></button>) : <p className="calendar-empty">予定はまだありません。下からすぐに追加できます。</p>}
        <h4>できた・記録 <small>{dayRecords.length}</small></h4>
        {grouped.length ? grouped.map(g=><details className="calendar-log" key={g.title}><summary><span>✓ {g.title}</span><b>{g.items.length}回</b></summary>{g.items.map(r=><p key={`${r.kind}:${r.id}`}>{r.note || "記録済み"}</p>)}</details>) : <p className="calendar-empty">記録すると、ここにその日の実績が並びます。</p>}
      </>}
    </div>
    <div className="calendar-presets" aria-label="予定をかんたん追加">{scheduleKinds.slice(0,4).map(k=><button type="button" key={k.key} disabled={!online || !dogId || loading} onClick={()=>open(k.key)}><span>{k.mark}</span>{k.label}<b>＋</b></button>)}</div>
    {selected<=today && <><div className="calendar-record-actions"><button type="button" disabled={!ready} onClick={()=>onRecord(selected,"daily")}>この日の状態</button><button type="button" disabled={!ready} aria-expanded={quickWins} aria-controls="calendar-quick-wins" onClick={()=>setQuickWins(value=>!value)}>できた！を残す</button>{selected===today && <button type="button" disabled={!ready} onClick={()=>onRecord(selected,null)}>できごとを記録</button>}</div>
      {quickWins && <div id="calendar-quick-wins" className="calendar-presets">{["ノーズワークができた","来客時に吠えなかった","誕生日のお祝い","自由に記録"].map(label=><button key={label} type="button" disabled={!ready} onClick={()=>onRecord(selected,"win",label==="自由に記録"?"":label)}>{label}<b>→</b></button>)}</div>}</>}
    <p className="calendar-caption">予定は予定として、記録は実績として表示します。</p>
    {draft && <dialog ref={dialog} className="calendar-dialog" aria-labelledby="schedule-title" onCancel={e=>{e.preventDefault();close();}} onClose={()=>{if(!lock.current)setDraft(null);}}>
      <form onSubmit={(e:FormEvent)=>{e.preventDefault();void mutate();}}><header><div><small>PLAN</small><h2 id="schedule-title">{isNew?"予定を追加":"予定を編集"}</h2></div><button type="button" aria-label="閉じる" disabled={saving} onClick={close}>×</button></header>
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
