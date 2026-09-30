"use client";

import { useEffect, useRef, useState } from "react";
import { themeFieldLabel } from "@/components/observations/ThemeSpecificFields";
import { loadCoachObservation, currentObservationCounts } from "@/lib/insights/coachObservation";
import type { CoachEvent } from "@/lib/insights/coachObservation";
import { dailyLabels, eventResultLabels, featuredDaily, featuredInsights, handlerComparisons, orderedThemes, themeLabel } from "@/lib/insights/presentation";
import type { InsightFilter } from "@/lib/insights/recordSources";
import type { DailyMetricKey } from "@/lib/insights/trendTypes";
import DailyCheckTrendCard from "./DailyCheckTrendCard";
import HandlerComparisonCard from "./HandlerComparisonCard";
import InsightCard from "./InsightCard";
import InsightEmptyState from "./InsightEmptyState";
import ThemeTrendCard from "./ThemeTrendCard";

type Observation = Awaited<ReturnType<typeof loadCoachObservation>>;
type Selection = { filter: InsightFilter; daily: boolean; title: string };

const stateLabels: Record<string, string> = { calm: "落ち着いていた", excited: "興奮していた", tired: "疲れていた", hungry: "お腹が空いていた", uneasy: "そわそわしていた", unknown: "分からない" };
const environmentLabels: Record<string, string> = { home: "家", street: "道", park: "公園", cafe: "カフェ", shop: "お店", daycare: "保育園", vehicle: "乗り物", other: "その他" };
const distanceLabels: Record<string, string> = { under_1m: "1m未満", "1_3m": "1〜3m", "3_5m": "3〜5m", "5_10m": "5〜10m", over_10m: "10m以上", unknown: "分からない" };
const outcomeLabels: Record<string, string> = { no_reaction: "反応しなかった", settled_quickly: "すぐ落ち着いた", partly_settled: "少し落ち着いた", unchanged: "変わらなかった", escalated: "反応が強くなった" };
const targetLabels: Record<string, string> = { dog: "犬", person: "人", sound: "音", object: "物", owner: "飼い主", none: "対象なし", other: "その他" };
const responseLabels: Record<string, string> = { soothed: "声をかけた", waited: "見守った", moved_away: "距離を取った", redirected: "気をそらした", other: "その他" };

function EventDetail({ event, handler, onChat }: { event: CoachEvent; handler: string; onChat: (event: CoachEvent) => void }) {
  const fields: [string, string][] = [];
  if (event.stateBefore) fields.push(["その前の様子", stateLabels[event.stateBefore] ?? event.stateBefore]);
  if (event.environment) fields.push(["場所・環境", environmentLabels[event.environment] ?? event.environment]);
  if (event.targetType) fields.push(["相手・対象", targetLabels[event.targetType] ?? event.targetType]);
  if (event.distanceBand) fields.push(["距離感", distanceLabels[event.distanceBand] ?? event.distanceBand]);
  if (event.intensity !== null) fields.push(["反応の強さ", `${event.intensity} / 5`]);
  if (event.durationSeconds !== null) fields.push(["続いた時間", `${event.durationSeconds}秒`]);
  if (event.ownerResponseKeys?.length) fields.push(["飼い主の対応", event.ownerResponseKeys.map((key) => responseLabels[key] ?? key).join("・")]);
  if (event.outcome) fields.push(["その後", outcomeLabels[event.outcome] ?? event.outcome]);
  if (event.recoverySeconds !== null) fields.push(["落ち着くまで", `${event.recoverySeconds}秒`]);
  for (const [key, value] of Object.entries(event.themeData)) if (value) fields.push([themeFieldLabel(event.themeKey, key), value]);
  return <div className="coach-event-detail">
    <p>主に対応した人：{handler}</p>
    {fields.length > 0 && <dl>{fields.map(([label, value], index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    <button type="button" onClick={() => onChat(event)}>この記録について確認する →</button>
  </div>;
}

export default function CoachObservationSummary({ dogId, ownerId, dogName, onChat }: {
  dogId: string; ownerId: string; dogName: string; onChat: (event?: { id: string; theme: string }) => void;
}) {
  const [observation, setObservation] = useState<Observation | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [showAllDaily, setShowAllDaily] = useState(false);
  const eventsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void loadCoachObservation(dogId, ownerId).then((data) => {
      if (active) { setObservation(data); setStatus("ready"); }
    }).catch(() => { if (active) { setObservation(null); setStatus("error"); } });
    return () => { active = false; };
  }, [dogId, ownerId]);

  const showRecords = (title: string, filter: InsightFilter = { period: "current" }, daily = false) => {
    setSelection({ title, filter, daily });
    window.setTimeout(() => eventsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  if (status === "loading") return <section className="coach-observation-summary" role="status">観察サマリーを読み込んでいます…</section>;
  if (status === "error" || !observation) return <section className="coach-observation-summary" role="alert">観察サマリーを読み込めませんでした。担当関係と接続を確認してください。</section>;

  const { trends, events, members, selectedThemes } = observation;
  const counts = currentObservationCounts(trends);
  const insights = featuredInsights(trends);
  const themes = orderedThemes(trends, selectedThemes);
  const handlers = handlerComparisons(trends);
  const daily = featuredDaily(trends);
  const dailyAll = trends.daily_metrics.filter((row) => row.period === "current" && !daily.some((item) => item.current.metric_key === row.metric_key));
  const filtered = selection?.daily ? [] : events.filter((event) => {
    const filter = selection?.filter ?? { period: "current" };
    return event.localDate >= (filter.period === "current" ? trends.current_start : trends.previous_start)
      && event.localDate <= (filter.period === "previous" ? trends.previous_end : trends.as_of_local_date)
      && (!filter.themeKey || event.themeKey === filter.themeKey)
      && (!filter.handlerIds?.length || (event.handlerId !== null && filter.handlerIds.includes(event.handlerId)));
  });
  const localTime = (value: string) => new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  return <section className="coach-observation-summary" aria-label={`${dogName}の観察サマリー`}>
    <header><span className="card-label">OBSERVATION / 直近7日間</span><h2>観察サマリー</h2><p>{dogName}の記録から、最近の様子を振り返ります。</p></header>
    <section className="insight-section"><h3>最近の様子</h3>
      <div className="coach-observation-numbers"><p><strong>{counts.dailyDays}日</strong><span>Daily Check</span></p><p><strong>{counts.events}件</strong><span>できごと</span></p><p><strong>{counts.concerns}件</strong><span>気になった記録</span></p></div>
      {themes.length > 0 && <p className="insight-summary-themes">{themes.map((row) => `${themeLabel(row.theme_key)} ${row.total_count}件`).join(" · ")}</p>}
    </section>
    <section className="insight-section"><h3>最近の気づき</h3>
      {insights.length ? <div className="insight-card-stack">{insights.map((insight, index) => <InsightCard key={`${insight.kind}-${insight.themeKey ?? "daily"}-${index}`} insight={insight}
        onRecords={() => showRecords(insight.kind === "daily" ? "Daily Check" : themeLabel(insight.themeKey ?? ""), { themeKey: insight.themeKey, period: insight.period, handlerIds: insight.handlerIds }, insight.kind === "daily")} />)}</div>
        : <InsightEmptyState hasRecords={counts.events > 0 || daily.length > 0} />}
    </section>
    {themes.length > 0 && <section className="insight-section"><h3>観察テーマ</h3><div className="insight-theme-list">{themes.map((row) => <ThemeTrendCard key={row.theme_key} trend={row}
      onRecords={() => showRecords(themeLabel(row.theme_key), { themeKey: row.theme_key, period: "current" })} />)}</div></section>}
    {handlers.length > 0 && <section className="insight-section"><h3>担当した人による記録の違い</h3><div className="insight-card-stack">{handlers.map(({ theme, handlers: pair }) => <HandlerComparisonCard key={theme.theme_key} theme={theme} handlers={pair}
      onRecords={() => showRecords(themeLabel(theme.theme_key), { themeKey: theme.theme_key, period: "current", handlerIds: pair.map((row) => row.handled_by_member_id) })} />)}</div></section>}
    {daily.length > 0 && <section className="insight-section"><h3>Daily Check</h3><p className="insight-section-intro">入力した日の記録から、確認したい項目を選んでいます。</p>
      <div className="insight-daily-list">{daily.map((item) => <DailyCheckTrendCard key={item.current.metric_key} {...item} />)}</div>
      {dailyAll.length > 0 && <><button type="button" className="coach-text-button" onClick={() => setShowAllDaily((value) => !value)}>{showAllDaily ? "項目を閉じる" : "ほかの項目を見る"}</button>
        {showAllDaily && <div className="coach-daily-more">{dailyAll.map((row) => <p key={row.metric_key}><span>{dailyLabels[row.metric_key as DailyMetricKey]}</span><strong>平均 {row.average_score}</strong><small>{row.entered_days}日分</small></p>)}</div>}</>}
    </section>}
    <div ref={eventsRef} className="insight-section coach-recent-events">
      <div className="coach-events-heading"><h3>{selection ? `${selection.title}の記録` : "最近のできごと"}</h3>{selection && <button type="button" className="coach-text-button" onClick={() => { setSelection(null); setExpandedEvent(null); }}>絞り込みを解除</button>}</div>
      {selection?.daily ? <ul className="coach-event-list">{trends.daily_event_days.filter((day) => day.local_date >= (selection.filter.period === "current" ? trends.current_start : trends.previous_start) && day.local_date <= (selection.filter.period === "previous" ? trends.previous_end : trends.as_of_local_date) && day.calmness_score !== null).map((day) => <li key={day.local_date}><strong>{day.local_date}</strong><p>落ち着き {day.calmness_score} / 5 · できごと {day.event_count}件</p></li>)}</ul>
        : filtered.length ? <><ul className="coach-event-list">{filtered.map((event) => <li key={event.id}><button type="button" className="coach-event-toggle" aria-expanded={expandedEvent === event.id} onClick={() => setExpandedEvent((id) => id === event.id ? null : event.id)}>
          <span><strong>{themeLabel(event.themeKey)} · {eventResultLabels[event.result]}</strong><small>{event.localDate} {localTime(event.occurredAt)} · {event.handlerId ? members.get(event.handlerId) ?? "以前登録した担当者" : "担当者の記録なし"}</small>{event.note && <em>{event.note}</em>}</span><b aria-hidden="true">{expandedEvent === event.id ? "−" : "+"}</b></button>
          {expandedEvent === event.id && <EventDetail event={event} handler={event.handlerId ? members.get(event.handlerId) ?? "以前登録した担当者" : "記録なし"} onChat={(selected) => onChat({ id: selected.id, theme: themeLabel(selected.themeKey) })} />}</li>)}</ul>{filtered.length === 60 && <small>直近60件を表示しています。</small>}</>
          : <p className="coach-event-empty">{selection ? "条件に合う記録はありません。" : "直近7日の記録はまだありません。"}</p>}
    </div>
    <button type="button" className="coach-chat-link" onClick={() => onChat()}>この記録について飼い主と話す →</button>
  </section>;
}
