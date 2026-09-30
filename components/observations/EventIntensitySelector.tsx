const levels = ["かなり弱い", "弱い", "中程度", "強い", "かなり強い"] as const;

export default function EventIntensitySelector({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return <fieldset className="event-intensity">
    <legend>反応の強さ（任意）</legend>
    <div className="event-intensity-scale" role="group" aria-label="反応の強さ、5段階">
      {levels.map((label, index) => <button key={label} type="button" className={value === index + 1 ? "is-selected" : ""}
        aria-label={label} aria-pressed={value === index + 1} onClick={() => onChange(value === index + 1 ? null : index + 1)}>
        <span aria-hidden="true" />
      </button>)}
    </div>
    <div className="event-intensity-ends" aria-hidden="true"><span>弱い</span><span>中程度</span><span>強い</span></div>
    <p aria-live="polite">{value === null ? "未選択" : `選択中：${levels[value - 1]}`}</p>
  </fieldset>;
}
