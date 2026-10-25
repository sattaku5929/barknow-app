"use client";

import { useEffect, useRef } from "react";
import styles from "./RecordQuickActions.module.css";

type Props = {
  onDaily: () => void;
  onEvent: () => void;
  onClose: () => void;
  dailyCompleted: boolean;
  eventCount: number | null;
};

export default function RecordQuickActions({onDaily,onEvent,onClose,dailyCompleted,eventCount}:Props) {
  const dailyRef=useRef<HTMLButtonElement>(null);
  const sheetRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dailyRef.current?.focus();
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();onClose();return;}
      if(event.key!=="Tab"||!sheetRef.current)return;
      const controls=Array.from(sheetRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first=controls[0],last=controls[controls.length-1];
      if(!first||!last)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener("keydown",escape);
    return()=>{window.removeEventListener("keydown",escape);if(previous?.isConnected && !previous.closest("[inert]"))previous.focus();};
  },[onClose]);

  return <div className={styles.backdrop} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={sheetRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="quick-record-title" aria-describedby="quick-record-help">
      <div className={styles.grab} aria-hidden="true"/>
      <div className={styles.header}>
        <div><small>QUICK LOG</small><h2 id="quick-record-title">何を記録しますか？</h2><p id="quick-record-help">今日の様子を、気軽に残しましょう。</p></div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <div className={styles.actions}>
        <button ref={dailyRef} type="button" onClick={onDaily} className={styles.action}>
          <span className={styles.symbol} aria-hidden="true">◉</span>
          <span className={styles.copy}><strong>今日の状態を記録</strong>
            <small>Daily Check · 気分・食欲・睡眠など</small>
            {dailyCompleted&&<span className={styles.status}>今日の記録済み · 編集できます</span>}</span>
          <span className={styles.arrow} aria-hidden="true">→</span>
        </button>
        <button type="button" onClick={onEvent} className={styles.action}>
          <span className={styles.symbol} aria-hidden="true">✎</span>
          <span className={styles.copy}><strong>できごとを記録</strong>
            <small>吠え・散歩・できたことなど</small>
            {eventCount!==null&&eventCount>0&&<span className={styles.status}>今日 {eventCount} 件</span>}</span>
          <span className={styles.arrow} aria-hidden="true">→</span>
        </button>
      </div>
      <button type="button" className={styles.cancel} onClick={onClose}>キャンセル</button>
    </section>
  </div>;
}
