"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";

type Contract = { eligible: boolean; status?: string; cancellationScheduled?: boolean };
const statusLabels: Record<string, string> = {
  active: "契約中", trialing: "お試し期間中", past_due: "お支払いの確認が必要",
  unpaid: "お支払いの確認が必要", paused: "一時停止中",
};

async function getSessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("ログインし直してください。");
  return data.session.access_token;
}

async function fetchContract(): Promise<Contract> {
  const token = await getSessionToken();
  const result = await fetch("/api/stripe/subscription", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(data.error || "契約情報を読み込めませんでした");
  return data as Contract;
}

export function SubscriptionMenuLink({ onOpen }: { onOpen: () => void }) {
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchContract()
      .then(result => { if (!cancelled) setEligible(Boolean(result.eligible)); })
      .catch(() => { if (!cancelled) setEligible(false); });
    return () => { cancelled = true; };
  }, []);

  if (!eligible) return null;
  return (
    <section className="settings-group" aria-labelledby="settings-subscription-title">
      <p className="settings-group-label" id="settings-subscription-title">ご契約</p>
      <div className="settings-list">
        <button type="button" onClick={onOpen}>
          <span className="settings-row-icon" aria-hidden="true">¥</span>
          <span><strong>契約・お支払い</strong><small>有料プランの確認・変更・解約</small></span>
          <i aria-hidden="true">›</i>
        </button>
      </div>
    </section>
  );
}

export function SubscriptionSettings({ onBack }: { onBack: () => void }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setContract(await fetchContract());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "契約情報を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  async function openPortal() {
    if (busy || !contract?.eligible) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const token = await getSessionToken();
      const result = await fetch("/api/stripe/subscription", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await result.json().catch(() => ({}));
      if (!result.ok || typeof data.url !== "string" || !data.url.startsWith("https://billing.stripe.com/")) {
        throw new Error(data.error || "契約管理画面を開けませんでした");
      }
      window.location.assign(data.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "契約管理画面を開けませんでした");
      setBusy(false);
    }
  }

  return (
    <section className="screen-form settings-profile-editor">
      <button type="button" className="settings-back" onClick={onBack}>← 設定へ戻る</button>
      <div style={{ marginBottom: 20 }}>
        <p className="card-label">SUBSCRIPTION</p>
        <h1>契約・お支払い</h1>
        <p>現在のご契約の確認・解約を行えます。</p>
      </div>
      {loading ? <p role="status">契約状況を確認しています…</p> : contract?.eligible ? (
        <section className="profile-form-section">
          <h2>オンラインコーチング</h2>
          <p>{statusLabels[contract.status || ""] || "ご契約情報があります"}</p>
          {contract.cancellationScheduled && <p>解約予約済みです。終了日などは契約管理画面でご確認ください。</p>}
          <button type="button" onClick={() => void openPortal()} disabled={busy}>
            {busy ? "接続中…" : "契約管理・解約ページを開く →"}
          </button>
          <p style={{ fontSize: 12, marginTop: 14 }}>Stripeが提供する安全な契約管理画面へ移動します。解約を希望される場合は、移動先で解約手続きを完了してください。</p>
        </section>
      ) : <p>現在、管理対象の有料プランはありません。</p>}
      {errorMessage && <p role="alert" style={{ color: "#a43832" }}>{errorMessage}</p>}
      <p style={{ fontSize: 12, marginTop: 18 }}>アプリの退会・削除だけでは、外部決済サービスの定期課金は停止しません。解約できない場合は「お問い合わせ・ご要望」からご連絡ください。</p>
    </section>
  );
}
