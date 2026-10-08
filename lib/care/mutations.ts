import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareGoal } from "./model";
import { careGoalError, validTargetCount } from "./model";
type Scope={ownerId:string;dogId:string};
const columns="id,title,goal_type,target_count,period,reminder_time,created_at";
type Row={id:string;title:string;goal_type:CareGoal["goalType"];target_count:number;period:CareGoal["period"];reminder_time:string|null;created_at:string};
function adapt(row:Row):CareGoal { return {id:row.id,title:row.title,goalType:row.goal_type,targetCount:row.target_count,period:row.period,reminderTime:row.reminder_time?.slice(0,5)??null,createdAt:row.created_at}; }
export async function createCareGoal(client:SupabaseClient,scope:Scope,goal:CareGoal) {
  const message=careGoalError(goal);if(message)throw new Error(message);
  const {data,error}=await client.from("wt_care_goals").upsert({id:goal.id,owner_id:scope.ownerId,dog_id:scope.dogId,title:goal.title.trim(),goal_type:goal.goalType,target_count:goal.targetCount,period:goal.period,reminder_time:goal.reminderTime,active:true},{onConflict:"id"}).select(columns).single();
  if(error||!data)throw new Error("追加できませんでした。接続を確認してもう一度お試しください。");
  return adapt(data);
}
export async function changeCareCount(client:SupabaseClient,scope:Scope,id:string,count:number,reminderTime?:string|null) {
  if(!validTargetCount(count))throw new Error("目標回数は1〜31回の整数にしてください。");
  if(reminderTime!==undefined && reminderTime!==null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime))throw new Error("お知らせ時間を確認してください。");
  // Save target and optional reminder together; preserve identity, period and history.
  const {data,error}=await client.from("wt_care_goals").update({target_count:count,...(reminderTime===undefined?{}:{reminder_time:reminderTime})}).eq("id",id).eq("owner_id",scope.ownerId).eq("dog_id",scope.dogId).eq("active",true).select(columns).single();
  if(error||!data)throw new Error("回数を保存できませんでした。接続を確認してもう一度お試しください。");
  return adapt(data);
}
export async function archiveCareGoal(client:SupabaseClient,scope:Scope,id:string) {
  // Archive instead of DELETE: retain linked history in the calendar.
  const {data,error}=await client.from("wt_care_goals").update({active:false}).eq("id",id).eq("owner_id",scope.ownerId).eq("dog_id",scope.dogId).eq("active",true).select("id").single();
  if(error||!data)throw new Error("項目を外せませんでした。接続を確認してもう一度お試しください。");
}
