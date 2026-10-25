import ThemeIllustration from "./ThemeIllustration";
import styles from "./ObservationEventHub.module.css";
import { eventThemes } from "@/lib/observations/observationEvent";
import type { EventTheme, ObservationEvent } from "@/lib/observations/observationEvent";

export default function ObservationEventHub({ selectedThemes, events, onSelect, onEdit, compact = false, disabled = false, personalized = false, themesLoaded = true, onConfigureThemes }: {
  selectedThemes: EventTheme[]; events: ObservationEvent[]; onSelect: (theme: EventTheme) => void;
  onEdit: (event: ObservationEvent) => void; compact?: boolean; disabled?: boolean;
  personalized?: boolean; themesLoaded?: boolean; onConfigureThemes?: () => void;
}) {
  const primaryKeys: EventTheme[] = [...selectedThemes];
  for (const key of (personalized ? [] : ["barking", "walk", "dog_reaction"]) as EventTheme[]) {
    if (primaryKeys.length >= 3) break;
    if (!primaryKeys.includes(key)) primaryKeys.push(key);
  }
  const primary = primaryKeys.map((key) => eventThemes.find((theme) => theme.key === key)).filter((theme): theme is (typeof eventThemes)[number] => Boolean(theme));
  const secondary = eventThemes.filter((theme) => !primaryKeys.includes(theme.key));
  return <div className={`observation-event-hub ${styles.hub}`}>
    {personalized && <div className="quick-log-themes-heading"><div><h3>プロフィールで選んだ観察テーマ</h3><p>気づいたテーマをタップして記録</p></div>{onConfigureThemes && <button type="button" onClick={onConfigureThemes}>変更</button>}</div>}
    {personalized && themesLoaded && primary.length === 0 && <p className="quick-log-empty">観察テーマを選ぶと、ここからすぐに記録できます。「変更」から設定しましょう。</p>}
    <div className={`event-theme-chips ${styles.grid}${personalized ? " quick-log-theme-grid" : ""}`}>{primary.map((theme) => {
      const count = events.filter(entry => entry.themeKey === theme.key).length;
      return <button className={styles.card} key={theme.key} data-theme={theme.key} type="button" disabled={disabled} onClick={() => onSelect(theme.key)} aria-label={personalized ? `${theme.label}を記録${count ? `・今日${count}件` : ""}` : undefined}>
        <ThemeIllustration theme={theme.key} />
        {personalized ? <><span className="quick-log-theme-label">{theme.label}<small>{count ? `今日 ${count}件` : "気づいたときに記録"}</small></span><span className="quick-log-theme-add" aria-hidden="true">＋</span></> : <><span className={styles.label}>{theme.label}</span><span className="quick-log-theme-add" aria-hidden="true">＋</span></>}
      </button>;
    })}</div>
    {compact ? secondary.length > 0 && <details className="event-more"><summary>{personalized ? "ほかのできごとを記録" : "ほかのテーマから選ぶ"}</summary><div className={`event-theme-chips is-secondary ${styles.grid}`}>{secondary.map((theme) => <button className={styles.card} key={theme.key} data-theme={theme.key} type="button" disabled={disabled} onClick={() => onSelect(theme.key)}><ThemeIllustration theme={theme.key} /><span className={styles.label}>{theme.label}</span><span className="quick-log-theme-add" aria-hidden="true">＋</span></button>)}</div></details>
      : <><p className="event-more-title">ほかのテーマ</p><div className={`event-theme-chips is-secondary ${styles.grid}`}>{secondary.map((theme) => <button className={styles.card} key={theme.key} data-theme={theme.key} type="button" disabled={disabled} onClick={() => onSelect(theme.key)}><ThemeIllustration theme={theme.key} /><span className={styles.label}>{theme.label}</span><span className="quick-log-theme-add" aria-hidden="true">＋</span></button>)}</div></>}
    {events.length > 0 && <details className="event-today-list"><summary>今日のできごと · {events.length}件<span aria-hidden="true">⌄</span></summary>{events.map((entry) => <button key={entry.id} type="button" onClick={() => onEdit(entry)}>
      <span>{eventThemes.find((item) => item.key === entry.themeKey)?.label ?? "できごと"} · {entry.result === "success" ? "うまくできた" : entry.result === "neutral" ? "いつも通り" : "気になった"}</span><span>編集 ›</span>
    </button>)}</details>}
  </div>;
}
