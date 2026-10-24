"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/supabase";

export default function SecuritySmoke() {
  const [result, setResult] = useState<{ aal: string; status: number; diagnostic: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalidResult, setInvalidResult] = useState<number | null>(null);

  async function check() {
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) { setMessage("このPreviewではまだログインしていません。下の「ログイン画面を開く」からログイン後、このページへ戻ってください。"); return; }
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw new Error("認証状態を確認できません");
      const response = await fetch("/api/google-calendar/status", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      setResult({ aal: assurance.data.currentLevel ?? "unknown", status: response.status, diagnostic: typeof body.diagnostic === "string" ? body.diagnostic : "none" });
    } catch {
      setMessage("テストを実行できませんでした。ログインと通信状態を確認してください。");
    } finally {
      setBusy(false);
    }
  }

  async function checkInvalidToken() {
    setBusy(true);
    setMessage("");
    setInvalidResult(null);
    try {
      const response = await fetch("/api/google-calendar/status", {
        method: "GET",
        headers: { Authorization: "Bearer invalid-test-token" },
        cache: "no-store",
      });
      setInvalidResult(response.status);
    } catch {
      setMessage("無効トークンの検証に失敗しました。通信状態を確認してください。");
    } finally {
      setBusy(false);
    }
  }

  return <main style={{ minHeight: "100svh", background: "#f8faf8", padding: "40px 20px", color: "#17372e" }}>
    <section style={{ maxWidth: 440, margin: "auto", background: "white", borderRadius: 20, padding: 24 }}>
      <p style={{ color: "#008661" }}>WanTone / Security Test</p>
      <h1>認証テスト</h1>
      <p>Googleカレンダーの接続状態を読み取るだけの検証です。</p>
      <button disabled={busy} onClick={() => void check()} style={{ width: "100%", background: "#008661", color: "white", border: 0, borderRadius: 12, padding: 16 }}>
        {busy ? "確認中…" : "認証テストを実行"}
      </button>
      {result && <div aria-live="polite"><p>認証レベル: {result.aal}</p><p>HTTPステータス: {result.status}</p><p>診断コード: {result.diagnostic}</p></div>}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #e1ebe6" }}>
        <h2 style={{ fontSize: 18 }}>無効トークンの拒否テスト</h2>
        <p>固定の無効文字列でAPIを呼びます。ログイン状態や認証設定は変更しません。</p>
        <button type="button" disabled={busy} onClick={() => void checkInvalidToken()} style={{ width: "100%", padding: 14, borderRadius: 12, border: "1px solid #008661", color: "#008661", background: "#fff" }}>無効トークンでテスト</button>
        {invalidResult !== null && <p aria-live="polite">HTTPステータス: {invalidResult} — {invalidResult === 401 ? "PASS（拒否）" : "要調査"}</p>}
      </div>
      {message && <p role="alert">{message}</p>}
      <Link href="/" style={{ display: "block", marginTop: 20, padding: 14, borderRadius: 12, border: "1px solid #008661", color: "#008661", textAlign: "center", textDecoration: "none" }}>ログイン画面を開く</Link>
      <p>ログイン・2段階認証が終わったら、Safariでこの認証テスト画面に戻ってください。</p>
      <p>認証コードやトークンは共有しないでください。</p>
    </section>
  </main>;
}
