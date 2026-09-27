"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/supabase";

const themes = [
  { key: "barking", label: "吠え" },
  { key: "walk", label: "お散歩" },
  { key: "alone", label: "お留守番" },
  { key: "toilet", label: "トイレ" },
  { key: "dog_reaction", label: "他の犬への反応" },
  { key: "person_reaction", label: "人への反応" },
  { key: "biting", label: "甘噛み・噛み" },
  { key: "meal", label: "食事" },
  { key: "sleep_rest", label: "睡眠・休息" },
  { key: "grooming", label: "ケア・お手入れ" },
] as const;

type ThemeRow = { id: string; theme_key: string; sort_order: number };

export default function ObservationThemeSelector({ dogId, online }: { dogId?: string; online: boolean }) {
  const [selected, setSelected] = useState<ThemeRow[]>([]);
  const [loading, setLoading] = useState(Boolean(dogId && online));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    if (!dogId || !online) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.from("wt_dog_observation_themes")
        .select("id,theme_key,sort_order").eq("dog_id", dogId).order("sort_order");
      if (!active) return;
      setLoading(false);
      if (error) setMessage("観察テーマを読み込めませんでした。画面を開き直してください。");
      else { setSelected(data ?? []); setMessage(""); }
    };
    void load();
    return () => { active = false; };
  }, [dogId, online]);

  async function toggle(key: string) {
    if (busy.current || loading || !dogId || !online || message.includes("読み込めません")) return;
    const existing = selected.find((item) => item.theme_key === key);
    if (!existing && selected.length >= 3) {
      setMessage("観察テーマは3つまで選べます");
      return;
    }
    busy.current = true;
    setSaving(true);
    setMessage("");
    try {
      if (existing) {
        const { data, error } = await supabase.from("wt_dog_observation_themes")
          .delete().eq("id", existing.id).eq("dog_id", dogId).select("id");
        if (error || data?.length !== 1) throw new Error("Theme delete failed");
        setSelected((current) => current.filter((item) => item.id !== existing.id));
      } else {
        const availableOrder = [1, 2, 3].find((order) => !selected.some((item) => item.sort_order === order));
        if (!availableOrder) throw new Error("No theme slot");
        const { data, error } = await supabase.from("wt_dog_observation_themes")
          .insert({ dog_id: dogId, theme_key: key, sort_order: availableOrder })
          .select("id,theme_key,sort_order").single();
        if (error || !data) throw new Error("Theme insert failed");
        setSelected((current) => [...current, data].sort((a, b) => a.sort_order - b.sort_order));
      }
    } catch {
      setMessage("保存できませんでした。接続を確認して、もう一度お試しください。");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="profile-form-section observation-themes" aria-labelledby="observation-themes-title">
      <div className="profile-section-heading"><span>02</span><div><h2 id="observation-themes-title">観察テーマ</h2><p>今、意識して見たいこと</p></div></div>
      <p>今、愛犬について気になっていることや、意識して見ていきたいことを選んでください。</p>
      <strong className="observation-themes-count" aria-live="polite">{selected.length} / 3 選択中</strong>
      {loading ? <p role="status">読み込んでいます…</p> : (
        <div className="observation-theme-chips">{themes.map(({ key, label }) => {
          const active = selected.some((item) => item.theme_key === key);
          return <button type="button" key={key} aria-pressed={active} className={active ? "is-selected" : ""}
            disabled={saving || !online || !dogId} onClick={() => void toggle(key)}>{active && <span aria-hidden="true">✓ </span>}{label}</button>;
        })}</div>
      )}
      {message && <p className="observation-error" role="alert">{message}</p>}
      {!dogId && <p>先に愛犬プロフィールを保存してください。</p>}
      {dogId && !online && <p>接続を確認してから選んでください。</p>}
      <small>タップすると保存されます。もう一度押すと選択を解除できます。</small>
    </section>
  );
}
