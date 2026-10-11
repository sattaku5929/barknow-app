"use client";

import { useState } from "react";
import { eventsOnDate, isBirthday } from "@/lib/calendar/model";
import type { CalendarEvent, CalendarRecord } from "@/lib/calendar/model";
import { japaneseHoliday } from "@/lib/calendar/holidays";
import styles from "./CalendarDays.module.css";

type Props = {
  dates: string[];
  selected: string;
  today: string;
  birthday: string;
  events: CalendarEvent[];
  records: CalendarRecord[];
  mode: "week" | "month";
  onSelect: (date: string) => void;
  onEvent?: (event: CalendarEvent) => void;
};

const dateLabel = (date: string) => new Intl.DateTimeFormat("ja-JP", {
  month: "long", day: "numeric", weekday: "short", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

export function calendarWeekBands(dates: string[], events: CalendarEvent[], birthday: string) {
  const bands: { id: string; title: string; event: CalendarEvent | null; start: number; end: number; lane: number }[] = events.flatMap(event => {
    const covered = dates.flatMap((date, index) => event.start_date <= date && event.end_date >= date ? [index] : []);
    return covered.length ? [{ id: event.id, title: event.title, event, start: covered[0], end: covered.at(-1)!, lane: 0 }] : [];
  });
  dates.forEach((date, index) => {
    if (isBirthday(birthday, date)) bands.push({ id: `birthday-${date}`, title: "誕生日", event: null, start: index, end: index, lane: 0 });
  });
  bands.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start)
    || Number(!!a.event) - Number(!!b.event)
    || (a.event?.start_time ?? "").localeCompare(b.event?.start_time ?? "") || a.title.localeCompare(b.title));
  const occupied: boolean[][] = [];
  for (const band of bands) {
    let lane = 0;
    while (occupied[lane]?.slice(band.start, band.end + 1).some(Boolean)) lane++;
    occupied[lane] ??= [];
    for (let column = band.start; column <= band.end; column++) occupied[lane][column] = true;
    band.lane = lane;
  }
  return bands;
}

export default function CalendarDays({ dates, selected, today, birthday, events, mode, onSelect, onEvent }: Props) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  return <div className={`calendar-days calendar-${mode} ${styles.grid}`} aria-label="日付を選ぶ">
    {["月", "火", "水", "木", "金", "土", "日"].map((day,index) => <span className={`calendar-weekday ${index===5?styles.saturday:index===6?styles.sunday:""}`} key={day}>{day}</span>)}
    {Array.from({ length: Math.ceil(dates.length / 7) }, (_, index) => dates.slice(index * 7, index * 7 + 7)).map(week => {
      const bands = calendarWeekBands(week, events, birthday);
      const expanded = week.includes(expandedDate ?? "");
      const visible = expanded ? bands : bands.filter(band => band.lane < 2);
      const rows = Math.max(0, ...visible.map(band => band.lane + 1));
      return <div className={styles.week} key={week[0]}>
      <div className={styles.dates}>{week.map(date => {
      const plans = eventsOnDate(events, date);
      const birth = isBirthday(birthday, date);
      const titles = [...(birth ? [{ id: "birthday", title: "誕生日" }] : []), ...plans];
      const label = dateLabel(date);
      const holiday = japaneseHoliday(date);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const dayColor = holiday || weekday === 0 ? styles.sunday : weekday === 6 ? styles.saturday : "";
      return <div key={date} className={`${styles.day} ${dayColor} ${selected === date ? styles.selected : ""} ${date === today ? styles.today : ""} ${date.slice(0, 7) !== selected.slice(0, 7) ? styles.adjacent : ""}`}>
        <button className={styles.select} type="button" aria-pressed={selected === date} aria-current={date === today ? "date" : undefined}
          aria-label={`${label}${date === today ? "、今日" : ""}${holiday?`、${holiday}`:""}、予定${plans.length}件${birth ? "、誕生日" : ""}${titles.length ? `、${titles.map(item => item.title).join("、")}` : ""}`}
          onClick={() => onSelect(date)}>
          <strong>{Number(date.slice(8))}</strong>
          {holiday && <small className={styles.holiday}>{holiday}</small>}
        </button>
      </div>;
    })}</div>
    <div className={styles.titles} id={`calendar-titles-${week[0]}`} style={{ gridTemplateRows: rows ? `repeat(${rows}, 32px)` : undefined }}>
      {visible.map(band => {
        const placement = { gridColumn: `${band.start + 1} / ${band.end + 2}`, gridRow: band.lane + 1 };
        return band.event ? <button type="button" className={styles.title} key={band.id} style={placement}
          data-event-id={band.id} title={band.title} aria-label={`${band.title}、${band.event.start_date}から${band.event.end_date}の予定を確認・編集`}
          onClick={() => onEvent?.(band.event!)}>{band.title}</button>
          : <span className={styles.title} key={band.id} style={placement}>{band.title}</span>;
      })}
    </div>
    <div className={styles.overflow}>{week.map((date, column) => {
      const hiddenCount = bands.filter(band => band.lane >= 2 && band.start <= column && band.end >= column).length;
      return hiddenCount > 0 && <button key={date} style={{ gridColumn: column + 1 }} className={styles.more} type="button" aria-expanded={expanded} aria-controls={`calendar-titles-${week[0]}`}
          aria-label={`${dateLabel(date)}の予定を${expanded ? "畳む" : `あと${hiddenCount}件表示`}`}
          onClick={() => { onSelect(date); setExpandedDate(expanded ? null : date); }}>
          {expanded ? "閉じる" : `＋${hiddenCount}件`}
        </button>;
    })}</div></div>;
    })}
  </div>;
}
