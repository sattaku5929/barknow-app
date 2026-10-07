export const scheduleKinds = [
  { key: "travel", label: "旅行", mark: "旅", title: "愛犬と旅行" },
  { key: "daycare", label: "保育園", mark: "園", title: "保育園" },
  { key: "vaccination", label: "予防接種", mark: "医", title: "狂犬病予防接種" },
  { key: "event", label: "イベント", mark: "会", title: "わんこのイベント" },
  { key: "appointment", label: "通院・ケア", mark: "予", title: "通院・ケア" },
  { key: "birthday", label: "お祝い", mark: "祝", title: "お誕生日のお祝い" },
  { key: "other", label: "その他", mark: "他", title: "" },
] as const;
export type ScheduleKind = (typeof scheduleKinds)[number]["key"];
export type CalendarEvent = {
  id: string; dog_id: string; category: ScheduleKind; title: string;
  start_date: string; end_date: string; start_time: string | null;
  location: string; note: string;
};
export type CalendarRecord = {
  id: string; date: string; title: string; note: string;
  kind: "daily" | "event" | "legacy" | "care";
};
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function weekStart(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  return addDays(value, -(day === 0 ? 6 : day - 1));
}
export function periodStart(period: "day" | "week" | "month", date: string) {
  return period === "week" ? weekStart(date) : period === "month" ? `${date.slice(0, 7)}-01` : date;
}
export function monthDays(value: string) {
  const first = `${value.slice(0, 7)}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  const start = weekStart(first);
  const end = addDays(weekStart(last), 6);
  return Array.from({ length: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 }, (_, i) => addDays(start, i));
}
export function moveMonth(value: string, amount: number) {
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const first = date.toISOString().slice(0, 10);
  const next = new Date(date); next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = Number(addDays(next.toISOString().slice(0, 10), -1).slice(8));
  return `${first.slice(0, 8)}${String(Math.min(Number(value.slice(8)), lastDay)).padStart(2, "0")}`;
}
export function eventsOnDate(events: CalendarEvent[], date: string) {
  return events.filter((event) => event.start_date <= date && event.end_date >= date)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.title.localeCompare(b.title));
}
export function isBirthday(birthday: string, date: string) {
  return isDateKey(birthday) && isDateKey(date) && date >= birthday && birthday.slice(5) === date.slice(5);
}
export function scheduleError(event: Pick<CalendarEvent, "category" | "title" | "start_date" | "end_date" | "start_time" | "location" | "note">) {
  if (!scheduleKinds.some((kind) => kind.key === event.category)) return "予定の種類を選んでください。";
  if (!event.title.trim() || event.title.trim().length > 100) return "予定名を1〜100文字で入力してください。";
  if (!isDateKey(event.start_date) || !isDateKey(event.end_date)) return "日付を確認してください。";
  if (event.end_date < event.start_date) return "終了日は開始日以降にしてください。";
  if (Date.parse(event.end_date) - Date.parse(event.start_date) > 366 * 86400000) return "1つの予定は366日以内にしてください。";
  if (event.start_time && !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(event.start_time)) return "時間を確認してください。";
  if (event.location.length > 200 || event.note.length > 2000) return "場所は200文字、メモは2000文字以内にしてください。";
  return null;
}
