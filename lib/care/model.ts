export type CarePeriod = "day" | "week" | "month";
export type CareGoalType = "brush" | "teeth" | "paws" | "bath" | "nails" | "ears" | "training" | "custom";
export type CareGoal = {id:string;title:string;goalType:CareGoalType;targetCount:number;period:CarePeriod;reminderTime:string|null;createdAt:string};
export type CareTemplate = Omit<CareGoal,"id"|"createdAt">;
export function careLayout(count:number) { return count <= 3 ? "cards" : count <= 8 ? "tiles" : "dense"; }
export function validTargetCount(count:number) { return Number.isInteger(count) && count >= 1 && count <= 31; }
export function careGoalError(goal:CareTemplate) {
  if (!goal.title.trim() || goal.title.trim().length > 40) return "やることを1〜40文字で入力してください。";
  if (!validTargetCount(goal.targetCount)) return "目標回数は1〜31回の整数にしてください。";
  if (!["day","week","month"].includes(goal.period)) return "期間を確認してください。";
  if (!["brush","teeth","paws","bath","nails","ears","training","custom"].includes(goal.goalType)) return "項目を確認してください。";
  return null;
}
export function careState(period:CarePeriod,count:number,target:number) { return count>=target ? period==="day"?"完了":"達成" : target===1?"できた":`${count}/${target}`; }
