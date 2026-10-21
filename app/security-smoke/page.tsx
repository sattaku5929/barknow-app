"use client";
import { useState } from "react";
import { supabase } from "@/app/supabase";

export default function SecuritySmoke() {
  const [result, setResult] = useState<{ aal: string; status: number } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("ログインが必要です");
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw new Error("認証状態を確認できません");
      const response = await fetch("/api/google-calendar/status", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      setResult({ aal: assurance.data.currentLevel ?? "unknown", status: response.status });
    } catch {
      setMessage("テストを実行できませんでした。ログインと通信状態を確認してください。");
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
      {result && <div aria-live="polite"><p>認証レベル: {result.aal}</p><p>HTTPステータス: {result.status}</p></div>}
      {message && <p role="alert">{message}</p>}
      <p>認証コードやトークンは共有しないでください。</p>
    </section>
  </main>;
}
