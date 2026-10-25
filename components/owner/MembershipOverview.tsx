"use client";

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
    // Run loading asynchronously to avoid setState synchronously in an effect.
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return (
    <section className="settings-group" aria-labelledby="settings-membership-title">
      <p className="settings-group-label" id="settings-membership-title">会員ステータス</p>
      <div style={{ background: "var(--surface, #fff)", border: "1px solid #e0e9e5", borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ color: "#596e64", display: "block", fontSize: 12, marginBottom: 5 }}>現在のご利用区分</span>
            <strong style={{ display: "block", fontSize: 17, color: "#126549" }} aria-live="polite">
              {loading ? "確認しています…" : errorMessage ? "確認できませんでした" : status?.label ?? "確認できませんでした"}
            </strong>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} style={{ borderRadius: 10, border: "1px solid #c9ddd3", background: "#f7fbf9", color: "#008661", padding: "9px 12px", fontSize: 12 }}>
            更新
          </button>
        </div>
        {!loading && !errorMessage && status?.state === "active" && (
          <p style={{ margin: "9px 0 0", fontSize: 12, color: "#596e64" }}>
            月額会員として登録されています。契約管理・解約機能は準備中です。
          </p>
        )}
        {!loading && !errorMessage && status?.state === "payment_attention" && (
          <p style={{ margin: "9px 0 0", fontSize: 12, color: "#8f5d36" }}>
            契約状況をご確認ください。ご不明な場合はお問い合わせからご連絡ください。
          </p>
        )}
        {!loading && !errorMessage && status?.state === "standard" && (
          <p style={{ margin: "9px 0 0", fontSize: 12, color: "#596e64" }}>
            有料契約の登録は確認されていません。決済・申込方法は現在準備中です。
          </p>
        )}
        {!loading && !errorMessage && status?.state === "ended" && (
          <p style={{ margin: "9px 0 0", fontSize: 12, color: "#596e64" }}>月額契約は終了しています。</p>
        )}
        {errorMessage && <p role="alert" style={{ margin: "10px 0 0", color: "#a43832", fontSize: 12 }}>{errorMessage}</p>}
      </div>
    </section>
  );
}
