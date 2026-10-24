"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || sent) return;
    setError("");
    setSending(true);
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (requestError) {
        const code = requestError.message.toLowerCase();
        if (code.includes("rate limit") || code.includes("too many requests")) {
          setError("送信回数の上限に達しました。時間をおいて再度お試しください。");
          return;
        }
        setError("メールを送信できませんでした。時間をおいて再度お試しください。");
        return;
      }
      setSent(true);
    } catch {
      setError("通信エラーが発生しました。接続を確認して再度お試しください。");
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 20, background: "#f9fafb", color: "#183c30" }}>
      <section style={{ width: "100%", maxWidth: 430, boxSizing: "border-box", background: "#fff", borderRadius: 20, padding: "32px 24px", boxShadow: "0 10px 40px #17352c12" }}>
        <p style={{ fontSize: 12, letterSpacing: ".16em", fontWeight: 700, color: "#008661" }}>WAN TONE · SECURITY</p>
        <h1 style={{ fontSize: 24, margin: "14px 0" }}>パスワードをお忘れの方</h1>
        {sent ? (
          <div role="status">
            <p style={{ lineHeight: 1.8 }}>登録済みのメールアドレスであれば、パスワード再設定用のメールが届きます。</p>
            <p style={{ fontSize: 14, color: "#53675e", lineHeight: 1.8 }}>受信トレイや迷惑メールフォルダをご確認ください。メール内のリンクから新しいパスワードを設定できます。</p>
            <Link href="/" style={{ color: "#008661", fontWeight: 700 }}>ログイン画面へ戻る</Link>
          </div>
        ) : (
          <>
            <p style={{ color: "#53675e", fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>アカウントに登録したメールアドレスを入力してください。パスワードを再設定するためのメールをお送りします。</p>
            <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: 12 }}>
              <label htmlFor="recovery-email" style={{ fontWeight: 700, fontSize: 14 }}>メールアドレス</label>
              <input id="recovery-email" type="email" inputMode="email" autoComplete="email" autoFocus required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" style={{ width: "100%", boxSizing: "border-box", padding: "14px 12px", border: "1px solid #a4bcb1", borderRadius: 10, fontSize: 16 }} />
              {error && <p role="alert" style={{ color: "#a13b32", fontSize: 14, margin: 0 }}>{error}</p>}
              <button type="submit" disabled={sending} style={{ marginTop: 8, minHeight: 52, padding: 14, border: 0, borderRadius: 12, background: sending ? "#9ac7b8" : "#008661", color: "#fff", fontSize: 16, fontWeight: 700, cursor: sending ? "wait" : "pointer" }}>
                {sending ? "送信中…" : "再設定メールを送信する"}
              </button>
            </form>
            <Link href="/" style={{ display: "inline-block", marginTop: 24, color: "#008661", fontSize: 14, fontWeight: 700 }}>ログイン画面へ戻る</Link>
          </>
        )}
      </section>
    </main>
  );
}
