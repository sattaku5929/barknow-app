"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";
import type { MembershipSummary } from "@/lib/membership";

export default function MembershipOverview() {
  const [status, setStatus] = useState<MembershipSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("ログイン状態を確認できませんでした");
      const result = await fetch("/api/membership", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(payload.error || "会員情報を取得できませんでした");
      setStatus(payload as MembershipSummary);
    } catch (error) {
      setStatus(null);
      setErrorMessage(error instanceof Error ? error.message : "会員情報を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const state = status?.state;
  const staffPremiumAccess = status?.staffPremiumAccess === true;
  const description = staffPremiumAccess
    ? "有料会員向け機能を課金なしで利用できます（コーチ機能は担当確定後）"
    : state === "active"
    ? "月額プランの内容を確認する"
    : state === "payment_attention"
      ? "プラン・契約状況のご案内"
      : state === "ended"
        ? "もう一度、愛犬との毎日をサポート"
        : "プロのサポートで、愛犬との毎日をもっと豊かに";

  return (
    <section className="settings-group" aria-labelledby="settings-membership-title">
      <p className="settings-group-label" id="settings-membership-title">会員ステータス</p>
      <Link href="/membership" className="block no-underline" aria-label="会員ステータス・月額プランの詳細を見る" style={{ color: "inherit", textDecoration: "none" }}>
        <div style={{ border: "1px solid #d8e9e1", borderRadius: 18, padding: "19px 18px", background: "linear-gradient(120deg, #fff 5%, #f0f8f4 100%)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: "#60776b", display: "block", fontSize: 12, marginBottom: 7 }}>現在のご利用区分</span>
            <strong style={{ display: "block", fontSize: 19, color: "#008661", lineHeight: 1.35 }} aria-live="polite">
              {loading ? "確認しています…" : errorMessage ? "確認できませんでした" : staffPremiumAccess ? "運営アカウント" : status?.label ?? "確認できませんでした"}
            </strong>
            <span style={{ display: "block", fontSize: 12, color: "#63766c", lineHeight: 1.6, marginTop: 7 }}>
              {errorMessage ? "タップしてプランを確認できます" : description}
            </span>
          </div>
          <span aria-hidden="true" style={{ flexShrink: 0, color: "#008661", fontSize: 26, fontWeight: 300 }}>›</span>
        </div>
      </Link>
    </section>
  );
}
