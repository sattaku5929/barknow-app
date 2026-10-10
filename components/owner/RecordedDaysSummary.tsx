"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/supabase";
import { loadRecordedDays } from "@/lib/observations/recordedDays";

type Props = { dogId?: string; online: boolean; revision: string; legacyRecords: readonly unknown[] };

export default function RecordedDaysSummary({ dogId, online, revision, legacyRecords }: Props) {
  const [result, setResult] = useState<{dogId: string; count: number | null} | null>(null);
  useEffect(() => {
    if (!dogId || !online) return;
    let active = true;
    let request = 0;
    async function refresh() {
      const currentRequest = ++request;
      try {
        const count = await loadRecordedDays(supabase, dogId!);
        if (active && request === currentRequest) setResult({dogId: dogId!, count});
      } catch {
        if (active && request === currentRequest) setResult({dogId: dogId!, count: null});
      }
    }
    function resume() { if (document.visibilityState === "visible") void refresh(); }
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [dogId, online, revision, legacyRecords]);

  const count = !dogId ? 0 : online && result?.dogId === dogId ? result.count : null;
  return <span><small>記録した日</small><strong aria-live="polite" aria-label={count === null ? "記録日数を確認中、または接続を確認してください" : `記録した日 ${count}日`}>{count ?? "—"}<em>DAYS</em></strong></span>;
}
