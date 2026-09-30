export default function EventSecondsField({ label, value, onChange }: {
  label: string; value: number | null; onChange: (value: number | null) => void;
}) {
  return <label className="field-label">{label}（秒）
    <input type="number" inputMode="numeric" min={0} max={604800} step={1} value={value ?? ""}
      onKeyDown={(event) => { if (["-", "+", ".", ",", "e", "E"].includes(event.key)) event.preventDefault(); }}
      onChange={(event) => {
        const text = event.target.value;
        if (text === "") { onChange(null); return; }
        if (/^\d+$/.test(text) && Number(text) <= 604800) onChange(Number(text));
      }} />
  </label>;
}
