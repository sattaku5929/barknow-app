import type { CareGoal } from "@/lib/care/model";
import type { HomeImageSlot } from "./homeImagePlan";

/** Illustration selection is presentation only; goals and their identities stay intact. */
export function careImageSlot(goal: Pick<CareGoal, "goalType" | "title">): HomeImageSlot | null {
  if (/(足|あし|肉球|パウ).*(拭|ふき|ふく)|散歩後/.test(goal.title)) return "wipe";
  if (goal.goalType === "brush") return "brushing";
  if (goal.goalType === "teeth") return "teeth";
  if (goal.goalType === "paws") return "paw";
  return null;
}
