"use client";

import { useEffect, useState } from "react";
import { loadCoachDogStats } from "@/lib/insights/coachObservation";

type Stats = Awaited<ReturnType<typeof loadCoachDogStats>>;

export default function CoachAssignedDogStats({ dogId }: { dogId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCoachDogStats(dogId).then((next) => {
      if (active) setStats(next);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [dogId]);
  if (error) return <p className="coach-dog-stats" role="alert">観察記録を読み込めませんでした。</p>;
  if (!stats) return <p className="coach-dog-stats" role="status">観察記録を確認しています…</p>;
  return <div className="coach-dog-stats">
    <span>最終記録 <strong>{stats.latestDate ?? "まだありません"}</strong></span>
    <span>直近7日 <strong>できごと {stats.events}件</strong></span>
    <span>Daily Check <strong>{stats.dailyDays}日</strong></span>
    <span>気になった記録 <strong>{stats.concerns}件</strong></span>
  </div>;
}
