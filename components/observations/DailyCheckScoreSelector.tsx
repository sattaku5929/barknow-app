import type { DailyCheckScores } from "@/lib/observations/dailyCheck";

export const dailyCheckFields: { key: keyof DailyCheckScores; label: string }[] = [
  { key: "appetite", label: "食欲" },
  { key: "sleepRest", label: "睡眠・休息" },
  { key: "activity", label: "活動・運動" },
  { key: "exploration", label: "探索・におい嗅ぎ" },
  { key: "calmness", label: "落ち着き" },
  { key: "toilet", label: "トイレ" },
];

const scoreLabels = ["気になる", "少し気になる", "いつも通り", "良い", "とても良い"];

export default function DailyCheckScoreSelector({ label, value, onChange }: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset className="daily-check-score">
      <legend>{label}<span>{value === null ? "未入力" : scoreLabels[value - 1]}</span></legend>
      <div className="daily-check-score-scale">
        <div className="daily-check-score-steps" role="group" aria-label={`${label}の評価、5段階`}>
          {[1, 2, 3, 4, 5].map((score) => (
            <button type="button" key={score} className={value === score ? "is-selected" : ""}
              aria-label={`${label}：${score}、${scoreLabels[score - 1]}`}
              aria-pressed={value === score} onClick={() => onChange(value === score ? null : score)}><span aria-hidden="true" /></button>
          ))}
        </div>
        <div className="daily-check-score-labels" aria-hidden="true"><span>気になる</span><span>いつも通り</span><span>とても良い</span></div>
      </div>
    </fieldset>
  );
}
