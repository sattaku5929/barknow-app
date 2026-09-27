"use client";

import { FormEvent, useEffect, useState } from "react";
import DailyCheckScoreSelector, { dailyCheckFields } from "./DailyCheckScoreSelector";
import { deviceLocalDate, deviceLocalTime, emptyDailyCheckScores, loadDailyCheck, saveDailyCheck } from "@/lib/observations/dailyCheck";
import type { DailyCheckScores } from "@/lib/observations/dailyCheck";

export default function DailyCheckForm({ dogId, initialDate, online, onBack, onSaved }: {
  dogId?: string;
  initialDate: string;
  online: boolean;
  onBack: () => void;
  onSaved: (savedDate: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(deviceLocalTime);
  const [scores, setScores] = useState<DailyCheckScores>(emptyDailyCheckScores);
  const [note, setNote] = useState("");
  const [existing, setExisting] = useState(false);
  const [loading, setLoading] = useState(Boolean(dogId && online));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const today = deviceLocalDate();
  const isToday = date === today;

  useEffect(() => {
    if (!dogId || !online || !date) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(false);
      setError("");
      try {
        const check = await loadDailyCheck(dogId, date);
        if (!active) return;
        setExisting(Boolean(check));
        setScores(check?.scores ?? emptyDailyCheckScores());
        setNote(check?.note ?? "");
        setTime(check?.time ?? deviceLocalTime());
      } catch {
        if (active) { setLoadError(true); setError("この日の記録を読み込めませんでした。画面を開き直してください。"); }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [dogId, online, date]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading || loadError || !dogId || !online) return;
    if (!Object.values(scores).some((value) => value !== null)) {
      setError("少なくとも1項目を選んでください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveDailyCheck(dogId, date, time, scores, note);
      onSaved(date);
    } catch {
      setError("保存できませんでした。接続と入力内容を確認して、もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="screen-form daily-check-form" onSubmit={submit}>
      <button type="button" className="topic-back" onClick={onBack}>← テーマを選び直す</button>
      <div className="selected-topic category-daily"><div><p>DAILY CHECK</p><h2>{isToday ? "今日のチェック" : "過去の日のチェック"}</h2></div></div>
      <p className="lead">わかる項目だけ選んでください。1項目から記録できます。</p>
      <details className="daily-check-date-options">
        <summary>{isToday ? "過去の日付を記録する" : `${date} の記録を編集中・日付を変更`}</summary>
        <div className="daily-check-date-content">
          <label className="field-label">記録する日付<input type="date" value={date} max={today} onChange={(event) => { if (event.target.value) { setLoading(true); setDate(event.target.value); } }} required /></label>
          {!isToday && <button type="button" onClick={() => { setLoading(true); setDate(today); }}>今日のチェックに戻る</button>}
        </div>
      </details>
      {existing && !loading && <p className="daily-check-existing">✓ この日の記録を編集中</p>}
      {loading ? <p role="status">この日の記録を読み込んでいます…</p> : (
        <div className="daily-check-fields">{dailyCheckFields.map(({ key, label }) => (
          <DailyCheckScoreSelector key={key} label={label} value={scores[key]}
            onChange={(value) => { setScores((current) => ({ ...current, [key]: value })); setError(""); }} />
        ))}</div>
      )}
      <p className="daily-check-hint">選んだ位置をもう一度押すと未入力に戻せます。</p>
      <label className="field-label">気づいたこと（任意）<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={5000} /></label>
      {error && <p className="observation-error" role="alert">{error}</p>}
      {!online && <p className="observation-error" role="status">接続を確認してから保存してください。</p>}
      <button className="primary-button" type="submit" disabled={saving || loading || loadError || !online || !dogId}>
        {saving ? "保存中…" : existing ? "変更を保存する" : isToday ? "今日のチェックを保存する" : "チェックを保存する"}<span>→</span>
      </button>
    </form>
  );
}
