export type CarePeriod = "day" | "week" | "month";
export type CareGoalType = "brush" | "teeth" | "paws" | "bath" | "nails" | "ears" | "training" | "custom" | "walk" | "meal" | "water" | "toilet" | "sleep" | "home" | "ball" | "toy" | "nose" | "book" | "star" | "people" | "hospital" | "medicine" | "vaccine" | "weight" | "temperature" | "shield" | "car" | "travel" | "school" | "park" | "birthday" | "camera";
export const careIconOptions: ReadonlyArray<{value:CareGoalType;label:string;category:string}> = [
  {value:"brush",category:"お手入れ",label:"ブラシ"}, {value:"teeth",category:"お手入れ",label:"歯"},
  {value:"paws",category:"お手入れ",label:"肉球"}, {value:"bath",category:"お手入れ",label:"お風呂"},
  {value:"nails",category:"お手入れ",label:"爪"}, {value:"ears",category:"その他",label:"ハート"},
  {value:"training",category:"その他",label:"チェック"}, {value:"custom",category:"その他",label:"プラス"},
  {value:"walk",label:"散歩",category:"日常"},
  {value:"meal",label:"ごはん",category:"日常"},
  {value:"water",label:"水",category:"日常"},
  {value:"toilet",label:"トイレ",category:"日常"},
  {value:"sleep",label:"睡眠",category:"日常"},
  {value:"home",label:"お留守番",category:"日常"},
  {value:"ball",label:"ボール",category:"遊び・学び"},
  {value:"toy",label:"おもちゃ",category:"遊び・学び"},
  {value:"nose",label:"ノーズワーク",category:"遊び・学び"},
  {value:"book",label:"学び",category:"遊び・学び"},
  {value:"star",label:"ごほうび",category:"遊び・学び"},
  {value:"people",label:"交流",category:"遊び・学び"},
  {value:"hospital",label:"通院",category:"健康"},
  {value:"medicine",label:"お薬",category:"健康"},
  {value:"vaccine",label:"予防接種",category:"健康"},
  {value:"weight",label:"体重",category:"健康"},
  {value:"temperature",label:"体調",category:"健康"},
  {value:"shield",label:"予防ケア",category:"健康"},
  {value:"car",label:"車",category:"お出かけ"},
  {value:"travel",label:"旅行",category:"お出かけ"},
  {value:"school",label:"保育園",category:"お出かけ"},
  {value:"park",label:"公園",category:"お出かけ"},
  {value:"birthday",label:"誕生日",category:"お出かけ"},
  {value:"camera",label:"写真",category:"お出かけ"},
];
export function validCareIcon(value:unknown):value is CareGoalType { return careIconOptions.some(option=>option.value===value); }
export type CareGoal = {id:string;title:string;goalType:CareGoalType;targetCount:number;period:CarePeriod;reminderTime:string|null;createdAt:string};
export type CareTemplate = Omit<CareGoal,"id"|"createdAt">;
export function careLayout(count:number) { return count <= 3 ? "cards" : count <= 8 ? "tiles" : "dense"; }
export function validTargetCount(count:number) { return Number.isInteger(count) && count >= 1 && count <= 31; }
export function careGoalError(goal:CareTemplate) {
  if (!goal.title.trim() || goal.title.trim().length > 40) return "やることを1〜40文字で入力してください。";
  if (!validTargetCount(goal.targetCount)) return "目標回数は1〜31回の整数にしてください。";
  if (!["day","week","month"].includes(goal.period)) return "期間を確認してください。";
  if (!validCareIcon(goal.goalType)) return "項目を確認してください。";
  return null;
}
export function careState(period:CarePeriod,count:number,target:number) { return count>=target ? period==="day"?"完了":"達成" : target===1?"できた":`${count}/${target}`; }
