import type { DailyCheckScores } from "@/lib/observations/dailyCheck";

export const dailyCheckFields: { key: keyof DailyCheckScores; label: string }[] = [
  { key: "appetite", label: "食欲" },
  { key: "sleepRest", label: "睡眠・休息" },
  { key: "activity", label: "活動・運動" },
  { key: "exploration", label: "探索・におい嗅ぎ" },
  { key: "calmness", label: "落ち着き" },
  { key: "toilet", label: "トイレ" },
];

export default function DailyCheckScoreSelector({ label, value, onChange }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset className="daily-check-score">
      <legend>{label}<span>任意</span></legend>
      <div role="group" aria-label={`${label}の評価`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button type="button" key={score} className={value === score ? "is-selected" : ""}
            aria-label={`${label}：${score}、${["とても気になる", "少し気になる", "いつも通り", "良い", "とても良い"][score - 1]}`}
            aria-pressed={value === score} onClick={() => onChange(value === score ? null : score)}>{score}</button>
        ))}
      </div>
    </fieldset>
  );
}
