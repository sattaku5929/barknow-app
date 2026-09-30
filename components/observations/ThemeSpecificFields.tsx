import type { EventTheme } from "@/lib/observations/observationEvent";

const fields: Record<EventTheme, { key: string; label: string; options?: string[] }[]> = {
  barking: [{ key: "trigger", label: "何に吠えたか" }],
  walk: [{ key: "mood", label: "散歩中の様子" }, { key: "sniffing", label: "におい嗅ぎ", options: ["多かった", "いつも通り", "少なかった"] }, { key: "pulling", label: "引っ張り", options: ["あった", "なかった"] }, { key: "stopping", label: "立ち止まり", options: ["あった", "なかった"] }, { key: "encounter", label: "他犬・人への反応" }],
  alone: [{ key: "hours", label: "留守番時間" }, { key: "before_after", label: "留守番前後の様子" }, { key: "signs", label: "吠え・破壊・排泄など" }],
  toilet: [{ key: "success", label: "トイレの結果", options: ["成功", "失敗"] }, { key: "place", label: "場所" }, { key: "timing", label: "タイミング" }],
  dog_reaction: [{ key: "reaction", label: "相手への反応" }, { key: "direction", label: "近づいた / 離れた", options: ["近づいた", "離れた", "そのまま"] }],
  person_reaction: [{ key: "reaction", label: "人への反応" }],
  biting: [{ key: "kind", label: "噛み方", options: ["甘噛み", "強い噛み"] }, { key: "before", label: "直前の状況" }],
  meal: [{ key: "pace", label: "食べ方" }, { key: "finished", label: "完食したか", options: ["完食", "残した"] }, { key: "appetite", label: "食欲", options: ["良い", "いつも通り", "気になる"] }],
  sleep_rest: [{ key: "settled", label: "落ち着いて休めたか", options: ["はい", "少し", "いいえ"] }, { key: "period", label: "睡眠時間帯" }, { key: "interrupted", label: "中断の有無", options: ["あり", "なし"] }],
  grooming: [{ key: "care", label: "ケア内容" }, { key: "reaction", label: "嫌がり方" }, { key: "progress", label: "どこまでできたか" }],
};
export function themeFieldLabel(theme: EventTheme, key: string): string {
  return fields[theme].find((field) => field.key === key)?.label ?? "このテーマについて";
}
export default function ThemeSpecificFields({ theme, data, onChange }: { theme: EventTheme; data: Record<string, string>; onChange: (data: Record<string, string>) => void }) {
  return <div className="event-theme-fields"><h3>このテーマについて（任意）</h3>{fields[theme].map(({ key, label, options }) => <label className="field-label" key={key}>{label}
    {options ? <select className="event-select" value={data[key] ?? ""} onChange={(e) => onChange({ ...data, [key]: e.target.value })}><option value="">選択しない</option>{options.map((option) => <option key={option}>{option}</option>)}</select>
      : <input value={data[key] ?? ""} maxLength={200} onChange={(e) => onChange({ ...data, [key]: e.target.value })} placeholder="任意" />}
  </label>)}</div>;
}
