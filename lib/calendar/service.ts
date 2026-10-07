import { supabase } from "../../app/supabase";
import type { CalendarEvent, CalendarRecord } from "./model";

// Read every page: busy days must not silently disappear at PostgREST's row limit.
async function pages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await query(start, start + 499);
    if (error) throw new Error(error.message);
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
}
export async function loadCalendar(dogId: string, start: string, end: string) {
  const [events, observations, legacy, care] = await Promise.all([
    pages<CalendarEvent>((a,b) => supabase.from("wt_calendar_events").select("id,dog_id,category,title,start_date,end_date,start_time,location,note").eq("dog_id",dogId).lte("start_date",end).gte("end_date",start).order("start_date").order("id").range(a,b)),
    pages<{id:string;local_date:string;entry_kind:string;theme_key:string|null;note:string|null}>((a,b) => supabase.from("wt_observation_entries").select("id,local_date,entry_kind,theme_key,note").eq("dog_id",dogId).is("deleted_at",null).gte("local_date",start).lte("local_date",end).order("local_date").order("id").range(a,b)),
    pages<{id:string;recorded_on:string;category:string;good_moment:string|null;behavior_note:string|null}>((a,b) => supabase.from("wt_daily_records").select("id,recorded_on,category,good_moment,behavior_note").eq("dog_id",dogId).gte("recorded_on",start).lte("recorded_on",end).order("recorded_on").order("id").range(a,b)),
    pages<{id:string;completed_on:string;wt_care_goals:{title:string}|{title:string}[]|null}>((a,b) => supabase.from("wt_care_goal_completions").select("id,completed_on,wt_care_goals!inner(title,dog_id)").eq("dog_id",dogId).eq("wt_care_goals.dog_id",dogId).gte("completed_on",start).lte("completed_on",end).order("completed_on").order("id").range(a,b)),
  ]);
  const labels: Record<string,string> = { walk:"散歩", barking:"吠え", alone:"お留守番", toilet:"トイレ",dog_reaction:"犬への反応",person_reaction:"人への反応",biting:"噛み",meal:"食事",sleep_rest:"睡眠・休息",grooming:"ケア",sleep:"睡眠",win:"できた！",daily:"日々の状態" };
  const records: CalendarRecord[] = [
    ...observations.map(r => ({id:r.id,date:r.local_date,title:r.entry_kind === "daily_check" ? "日々の状態" : labels[r.theme_key ?? ""] ?? "できごと",note:r.note ?? "",kind:r.entry_kind === "daily_check" ? "daily" as const : "event" as const})),
    ...legacy.map(r => ({id:r.id,date:r.recorded_on,title:labels[r.category] ?? "記録",note:r.good_moment || r.behavior_note || "",kind:"legacy" as const})),
    ...care.map(r => ({id:r.id,date:r.completed_on,title:(Array.isArray(r.wt_care_goals) ? r.wt_care_goals[0] : r.wt_care_goals)?.title ?? "お世話",note:"できた",kind:"care" as const})),
  ];
  return { events, records };
}
export async function saveCalendarEvent(event: CalendarEvent, isNew: boolean) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("ログインを確認してください。");
  const payload = {...event,owner_id:user.id,title:event.title.trim(),location:event.location.trim(),note:event.note.trim()};
  const query = isNew ? supabase.from("wt_calendar_events").upsert(payload,{onConflict:"id"}) : supabase.from("wt_calendar_events").update(payload).eq("id",event.id).eq("dog_id",event.dog_id);
  const { data, error } = await query.select("id").single();
  if (error || !data) throw new Error(error?.message ?? "保存できませんでした。");
}
export async function deleteCalendarEvent(event: CalendarEvent) {
  const { data, error } = await supabase.from("wt_calendar_events").delete().eq("id",event.id).eq("dog_id",event.dog_id).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "削除できませんでした。");
}
