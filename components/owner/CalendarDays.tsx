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

export default function CalendarDays({ dates, selected, today, birthday, events, records, mode, onSelect, onEvent }: Props) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  return <div className={`calendar-days calendar-${mode}`} aria-label="日付を選ぶ">
    {["月", "火", "水", "木", "金", "土", "日"].map((day,index) => <span className={`calendar-weekday ${index===5?styles.saturday:index===6?styles.sunday:""}`} key={day}>{day}</span>)}
    {dates.map(date => {
      const plans = eventsOnDate(events, date);
      const logCount = records.filter(record => record.date === date).length;
      const birth = isBirthday(birthday, date);
      const titles = [...(birth ? [{ id: "birthday", title: "誕生日" }] : []), ...plans];
      const expanded = expandedDate === date;
      const visibleTitles = expanded ? titles : titles.slice(0, 2);
      const hiddenCount = Math.max(0, titles.length - 2);
      const label = dateLabel(date);
      const holiday = japaneseHoliday(date);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const dayColor = holiday || weekday === 0 ? styles.sunday : weekday === 6 ? styles.saturday : "";
      return <div key={date} className={`${styles.day} ${dayColor} ${selected === date ? styles.selected : ""} ${date === today ? styles.today : ""} ${date.slice(0, 7) !== selected.slice(0, 7) ? styles.adjacent : ""}`}>
        <button className={styles.select} type="button" aria-pressed={selected === date} aria-current={date === today ? "date" : undefined}
          aria-label={`${label}${date === today ? "、今日" : ""}${holiday?`、${holiday}`:""}、予定${plans.length}件、記録${logCount}件${birth ? "、誕生日" : ""}${titles.length ? `、${titles.map(item => item.title).join("、")}` : ""}`}
          onClick={() => onSelect(date)}>
          <strong>{Number(date.slice(8))}</strong>
          {holiday && <small className={styles.holiday}>{holiday}</small>}
          {logCount > 0 && <span className={styles.logs} aria-hidden="true"><i className="record-dot" />{logCount}</span>}
        </button>
        <div className={styles.titles} id={`calendar-titles-${date}`}>
          {visibleTitles.map(item => "category" in item
            ? <button type="button" className={styles.title} key={item.id} title={item.title} aria-label={`${item.title}の予定を確認・編集`} onClick={() => onEvent?.(item)}>{item.title}</button>
            : <span className={styles.title} key={item.id}>{item.title}</span>)}
        </div>
        {hiddenCount > 0 && <button className={styles.more} type="button" aria-expanded={expanded} aria-controls={`calendar-titles-${date}`}
          aria-label={`${label}の予定を${expanded ? "畳む" : `あと${hiddenCount}件表示`}`}
          onClick={() => { onSelect(date); setExpandedDate(expanded ? null : date); }}>
          {expanded ? "閉じる" : `＋${hiddenCount}件`}
        </button>}
      </div>;
    })}
  </div>;
}
