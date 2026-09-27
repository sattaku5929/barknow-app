import type { EventResult } from "@/lib/observations/observationEvent";
const options: { value: EventResult; label: string; mark: string }[] = [
  { value: "success", label: "うまくできた", mark: "✓" },
  { value: "neutral", label: "いつも通り", mark: "○" },
  { value: "concern", label: "気になった", mark: "!" },
];
export default function EventResultSelector({ value, onChange }: { value: EventResult | null; onChange: (value: EventResult) => void }) {
  return <fieldset className="event-result"><legend>出来事の結果 <span>必須</span></legend><div className="event-result-options">
    {options.map(({ value: key, label, mark }) => <button type="button" key={key} className={key === value ? "is-selected" : ""}
      aria-pressed={key === value} onClick={() => onChange(key)}><span aria-hidden="true">{mark}</span>{label}</button>)}
  </div></fieldset>;
}
