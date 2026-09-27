import { eventThemes } from "@/lib/observations/observationEvent";
import type { EventTheme, ObservationEvent } from "@/lib/observations/observationEvent";

export default function ObservationEventHub({ selectedThemes, events, onSelect, onEdit, compact = false, disabled = false }: {
  selectedThemes: EventTheme[]; events: ObservationEvent[]; onSelect: (theme: EventTheme) => void;
  onEdit: (event: ObservationEvent) => void; compact?: boolean; disabled?: boolean;
}) {
  const primaryKeys: EventTheme[] = [...selectedThemes];
  for (const key of ["barking", "walk", "dog_reaction"] as EventTheme[]) {
    if (primaryKeys.length >= 3) break;
    if (!primaryKeys.includes(key)) primaryKeys.push(key);
  }
  const primary = primaryKeys.map((key) => eventThemes.find((theme) => theme.key === key)).filter((theme): theme is (typeof eventThemes)[number] => Boolean(theme));
  const secondary = eventThemes.filter((theme) => !primaryKeys.includes(theme.key));
  return <div className="observation-event-hub">
    <div className="event-theme-chips">{primary.map((theme) => <button key={theme.key} type="button" disabled={disabled} onClick={() => onSelect(theme.key)}>{theme.label}<span aria-hidden="true">＋</span></button>)}</div>
    {compact ? <details className="event-more"><summary>ほかのテーマから選ぶ</summary><div className="event-theme-chips is-secondary">{secondary.map((theme) => <button key={theme.key} type="button" disabled={disabled} onClick={() => onSelect(theme.key)}>{theme.label}</button>)}</div></details>
      : <><p className="event-more-title">ほかのテーマ</p><div className="event-theme-chips is-secondary">{secondary.map((theme) => <button key={theme.key} type="button" disabled={disabled} onClick={() => onSelect(theme.key)}>{theme.label}</button>)}</div></>}
    {events.length > 0 && <div className="event-today-list"><h3>今日のできごと · {events.length}件</h3>{events.map((entry) => <button key={entry.id} type="button" onClick={() => onEdit(entry)}>
      <span>{eventThemes.find((item) => item.key === entry.themeKey)?.label ?? "できごと"} · {entry.result === "success" ? "うまくできた" : entry.result === "neutral" ? "いつも通り" : "気になった"}</span><span>編集 ›</span>
    </button>)}</div>}
  </div>;
}
