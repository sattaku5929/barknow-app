"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/supabase";

export default function SubscriptionManagementEntry() {
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const response = await fetch("/api/billing/portal", {
          headers: { Authorization: "Bearer " + data.session.access_token },
          cache: "no-store",
        });
        const result = await response.json();
        if (active && response.ok) setEligible(result.manageable === true);
      } catch { /* Unverified subscription is not displayed. */ }
    });
    return () => { active = false; };
  }, []);

  async function manage() {
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("ログインし直してください");
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { Authorization: "Bearer " + data.session.access_token },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || "契約管理画面を開けませんでした");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "契約管理画面を開けませんでした");
      setBusy(false);
    }
  }

  if (!eligible) return null;
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void manage()}>
        <span className="settings-row-icon" aria-hidden="true">¥</span>
        <span><strong>契約・お支払い</strong><small>契約内容の確認・解約手続き</small></span>
        <i aria-hidden="true">›</i>
      </button>
      {error && <p role="alert">{error}。お問い合わせからもご相談いただけます。</p>}
    </>
  );
}
