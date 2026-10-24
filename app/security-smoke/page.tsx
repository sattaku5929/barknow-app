"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/app/supabase";

export default function SecuritySmoke() {
  const [result, setResult] = useState<{ aal: string; status: number; diagnostic: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalidResult, setInvalidResult] = useState<number | null>(null);
  const [adminAal1, setAdminAal1] = useState<{ aal: string; status: number } | null>(null);

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


  async function checkAdminBeforeMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    form.reset();
    setBusy(true);
    setMessage("");
    setAdminAal1(null);
    let authenticated = false;
    try {
      // This intentionally creates a genuine AAL1 session, not a modified JWT.
      const signedIn = await supabase.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session?.access_token) {
        setMessage("ログインできませんでした。入力内容を確認してください。");
        return;
      }
      authenticated = true;
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || !assurance.data) throw new Error("aal_read_failed");
      const aal = assurance.data.currentLevel ?? "unknown";
      if (aal !== "aal1") {
        setMessage("認証レベルがAAL1ではないため、APIのテストは中止しました。");
        return;
      }
      const response = await fetch("/api/google-calendar/status", {
        method: "GET",
        headers: { Authorization: "Bearer " + signedIn.data.session.access_token },
        cache: "no-store",
      });
      setAdminAal1({ aal, status: response.status });
    } catch {
      setMessage("検証に失敗しました。認証情報は表示・保存していません。");
    } finally {
      if (authenticated) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
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

      <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #e1ebe6" }}>
        <h2 style={{ fontSize: 18 }}>管理者 AAL1 の拒否テスト</h2>
        <p>管理者のメールアドレスとパスワードで通常ログインし、2段階認証前の実際のAAL1状態だけを検証します。認証コードの入力やMFA解除は不要です。</p>
        <p style={{ fontWeight: 700 }}>この操作では、このPreviewで現在ログイン中のアカウントが切り替わり、テスト後にログアウトします。管理者アカウントでのみ実行してください。</p>
        <form onSubmit={(event) => void checkAdminBeforeMfa(event)} autoComplete="off">
          <label style={{ display: "block", marginBottom: 8 }}>管理者メールアドレス
            <input type="email" name="email" required autoComplete="off" style={{ boxSizing: "border-box", display: "block", width: "100%", border: "1px solid #cbd8d1", borderRadius: 8, padding: 12, marginTop: 6 }} />
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>パスワード
            <input type="password" name="password" required autoComplete="off" style={{ boxSizing: "border-box", display: "block", width: "100%", border: "1px solid #cbd8d1", borderRadius: 8, padding: 12, marginTop: 6 }} />
          </label>
          <button type="submit" disabled={busy} style={{ width: "100%", padding: 14, background: "#008661", color: "white", borderRadius: 12, border: 0 }}>
            {busy ? "検証中…" : "管理者 AAL1 を検証"}
          </button>
        </form>
        {adminAal1 && <p aria-live="polite">認証レベル: {adminAal1.aal} / HTTP: {adminAal1.status} — {adminAal1.aal === "aal1" && adminAal1.status === 401 ? "PASS（拒否）" : "要調査"}</p>}
        <p style={{ fontSize: 13 }}>管理者のパスワードやトークンをチャットに貼らないでください。このフォームは検証用Previewにのみ存在します。</p>
      </div>
      {message && <p role="alert">{message}</p>}
      <Link href="/" style={{ display: "block", marginTop: 20, padding: 14, borderRadius: 12, border: "1px solid #008661", color: "#008661", textAlign: "center", textDecoration: "none" }}>ログイン画面を開く</Link>
      <p>ログイン・2段階認証が終わったら、Safariでこの認証テスト画面に戻ってください。</p>
      <p>認証コードやトークンは共有しないでください。</p>
    </section>
  </main>;
}
