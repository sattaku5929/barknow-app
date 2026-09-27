"use client";
import { FormEvent, useEffect, useState } from "react";
import { loadHouseholdMembers, saveObservationEvent, eventThemes } from "@/lib/observations/observationEvent";
import type { HouseholdMember, ObservationEvent, EventTheme, EventResult } from "@/lib/observations/observationEvent";
import EventResultSelector from "./EventResultSelector";
import EventHandlerSelector from "./EventHandlerSelector";
import EventDetailFields, { EventSituationFields } from "./EventDetailFields";
import ThemeSpecificFields from "./ThemeSpecificFields";

function emptyEvent(theme: EventTheme): ObservationEvent {
  return {
    id: "", themeKey: theme, result: "neutral", occurredAt: new Date().toISOString(),
    note: "", handlerId: null, stateBefore: null, environment: null, targetType: null,
    distanceBand: null, intensity: null, durationSeconds: null, ownerResponseKeys: null,
    outcome: null, recoverySeconds: null, themeData: {},
  };
}
export default function ObservationEventForm({ dogId, theme, editing, online, onBack, onSaved }: {
  dogId?: string; theme: EventTheme; editing?: ObservationEvent | null; online: boolean;
  onBack: () => void; onSaved: () => void;
}) {
  const [value, setValue] = useState<ObservationEvent>(() => editing ?? emptyEvent(theme));
  const [result, setResult] = useState<EventResult | null>(editing?.result ?? null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [memberLoading, setMemberLoading] = useState(true);
  const [memberError, setMemberError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!online) return;
    let active = true;
    void loadHouseholdMembers().then((rows) => { if (active) { setMembers(rows); setMemberLoading(false); } })
      .catch(() => { if (active) { setMemberError(true); setMemberLoading(false); } });
    return () => { active = false; };
  }, [online]);
  const update = (patch: Partial<ObservationEvent>) => setValue((current) => ({ ...current, ...patch }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || memberLoading || memberError || !dogId || !online) return;
    if (!result) { setError("出来事の結果を選んでください。"); return; }
    setSaving(true); setError("");
    try {
      await saveObservationEvent(dogId, {
        ...value, result, occurredAt: editing ? value.occurredAt : new Date().toISOString(),
        themeData: { schema_version: "1", ...Object.fromEntries(Object.entries(value.themeData).filter(([, text]) => typeof text === "string" && text.trim())) },
      });
      onSaved();
    } catch { setError("記録できませんでした。接続と入力内容を確認して、もう一度お試しください。"); }
    finally { setSaving(false); }
  }
  const label = eventThemes.find((item) => item.key === theme)?.label ?? "できごと";
  return <form className="screen-form observation-event-form" onSubmit={(e) => void submit(e)}>
    <button type="button" className="topic-back" onClick={onBack}>← テーマを選び直す</button>
    <div className="selected-topic category-daily"><div><p>EVENT LOG</p><h2>{label}のできごと</h2></div></div>
    <p className="lead">今日あったことを、わかる範囲で残しましょう。</p>
    <EventResultSelector value={result} onChange={(next) => { setResult(next); setError(""); }} />
    {memberLoading && online ? <p role="status">お世話する人を読み込んでいます…</p> : memberError ? <p className="observation-error" role="alert">家族の情報を読み込めませんでした。画面を開き直してください。</p>
      : <><EventHandlerSelector members={members} value={value.handlerId} onChange={(handlerId) => update({ handlerId })} />
        {value.handlerId && !members.some((member) => member.id === value.handlerId) && <p className="event-former-handler">以前登録した担当者が選ばれています。<button type="button" onClick={() => update({ handlerId: null })}>担当者を外す</button></p>}</>}
    <EventSituationFields value={value} update={update} />
    <label className="field-label">メモ（任意）<textarea rows={2} maxLength={5000} value={value.note} onChange={(e) => update({ note: e.target.value })} placeholder="何が起きたか、ひとことだけでも" /></label>
    <details className="event-more"><summary>詳しく記録する</summary>
      <EventDetailFields value={value} update={update} />
      <ThemeSpecificFields theme={theme} data={value.themeData} onChange={(themeData) => update({ themeData })} />
      {editing && <p>記録した日時：{new Date(value.occurredAt).toLocaleString("ja-JP")}</p>}
    </details>
    {error && <p className="observation-error" role="alert">{error}</p>}
    {!online && <p className="observation-error" role="status">接続を確認してから記録してください。</p>}
    <button className="primary-button" type="submit" disabled={saving || memberLoading || memberError || !dogId || !online}>
      {saving ? "保存中…" : editing ? "変更を保存する" : "記録する"}<span>→</span>
    </button>
  </form>;
}
