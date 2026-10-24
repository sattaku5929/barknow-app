"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";

type PreferenceKey = "chat" | "care" | "announcements";
type Preferences = Record<PreferenceKey, boolean>;
const defaults: Preferences = { chat: true, care: true, announcements: false };
const keys: PreferenceKey[] = ["chat", "care", "announcements"];

function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...defaults };
  const source = value as Record<string, unknown>;
  return {
    chat: typeof source.chat === "boolean" ? source.chat : defaults.chat,
    care: typeof source.care === "boolean" ? source.care : defaults.care,
    announcements: typeof source.announcements === "boolean" ? source.announcements : defaults.announcements,
  };
}

export default function NotificationPreferences({
  hasCoach, isSubscribed, busy, supported, denied, onDeviceToggle, onTest, onBack,
}: {
  hasCoach: boolean;
  isSubscribed: boolean;
  busy: boolean;
  supported: boolean;
  denied: boolean;
  onDeviceToggle: () => void;
  onTest: () => void;
  onBack: () => void;
}) {
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setMessage("通知設定を取得できませんでした。");
    } else {
      setPreferences(parsePreferences(data.user.user_metadata?.notification_preferences));
      setMessage("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggle(key: PreferenceKey) {
    if (saving || loading || (key === "chat" && !hasCoach)) return;
    const next = { ...preferences, [key]: !preferences[key] };
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ data: { notification_preferences: next } });
    if (error) {
      setMessage("保存できませんでした。再度お試しください。");
    } else {
      setPreferences(next);
      setMessage("保存しました");
    }
    setSaving(false);
  }

  const rows: { key: PreferenceKey; title: string; description: string }[] = [
    { key: "chat", title: "チャット通知", description: "担当コーチからの新着メッセージ" },
    { key: "care", title: "お世話のリマインド", description: "毎日やることの未完了通知" },
    { key: "announcements", title: "運営からのお知らせ", description: "新しいお知らせの通知" },
  ];

  return (
    <section className="screen-form settings-profile-editor">
      <button type="button" className="settings-back" onClick={onBack}>← 設定へ戻る</button>
      <div style={{ marginBottom: 24 }}>
        <p className="card-label">NOTIFICATIONS</p>
        <h1>通知設定</h1>
        <p>受け取りたい通知を選択できます。通知の種類はPC・スマホで共通です。</p>
      </div>
      <section className="profile-form-section" aria-label="端末の通知">
        <h2>この端末の通知</h2>
        <p>通知の許可・登録はスマホやPCごとに設定します。</p>
        <p aria-live="polite">{isSubscribed ? "この端末：ON" : denied ? "この端末：ブラウザで拒否されています" : supported ? "この端末：OFF" : "この端末は通知非対応です"}</p>
        <button type="button" disabled={busy || !supported} onClick={onDeviceToggle}>{busy ? "設定中…" : isSubscribed ? "この端末の通知をOFFにする" : "この端末の通知をONにする"}</button>
        {isSubscribed && <button type="button" disabled={busy} onClick={onTest} style={{ marginLeft: 8 }}>テスト通知を送る</button>}
        {denied && <p>通知を許可するには端末またはブラウザの設定を変更してください。</p>}
      </section>
      <section className="profile-form-section" aria-label="通知の種類">
        <h2>通知の種類</h2>
        {rows.map(({ key, title, description }) => {
          const disabled = loading || saving || (key === "chat" && !hasCoach);
          const checked = key === "chat" && !hasCoach ? false : preferences[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 0", borderBottom: "1px solid #e3eae5", opacity: key === "chat" && !hasCoach ? 0.48 : 1 }}>
              <div><strong>{title}</strong><p style={{ margin: "4px 0", fontSize: 13 }}>{description}</p>{key === "chat" && !hasCoach && <small>担当コーチが決まると利用できます</small>}</div>
              <button type="button" role="switch" aria-label={title} aria-checked={checked} disabled={disabled} className={`settings-toggle ${checked ? "is-on" : ""}`} onClick={() => void toggle(key)}><i /></button>
            </div>
          );
        })}
        <p role="status" aria-live="polite">{loading ? "読み込み中…" : message}</p>
        <p style={{ fontSize: 12 }}>運営からのお知らせは、この設定に関係なくアプリ内のベルから確認できます。</p>
      </section>
    </section>
  );
}
