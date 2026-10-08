import { periodStart } from "../calendar/model";
import type { CareGoal } from "./model";

export function careDate(now = new Date()) {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function careProgress(goal: Pick<CareGoal, "id" | "period">, completions: readonly { goalId: string; completedOn: string }[], date: string) {
  const start = periodStart(goal.period, date);
  return completions.filter(item => item.goalId === goal.id && item.completedOn >= start && item.completedOn <= date).length;
}

export function untilCareMidnight(now = new Date()) {
  const midnight = Date.parse(`${careDate(now)}T00:00:00+09:00`) + 86_400_000;
  return Math.max(1, midnight - now.getTime());
}

// Re-arm after resume too: mobile browsers suspend timers in the background.
export function subscribeCareDate(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const refresh = () => {
    clearTimeout(timer);
    onChange();
    timer = setTimeout(refresh, untilCareMidnight());
  };
  timer = setTimeout(refresh, untilCareMidnight());
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("pageshow", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}
