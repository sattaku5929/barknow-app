"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/supabase";
import PasswordVisibilityButton from "@/components/auth/PasswordVisibilityButton";

type RecoveryState = "checking" | "ready" | "invalid" | "complete";

export default function ResetPasswordPage() {
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    // Only the PASSWORD_RECOVERY event may open the form.
    // A regular signed-in session or a forged #type=recovery fragment is insufficient.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") setState("ready");
    });

    const timer = window.setTimeout(() => {
      if (mounted) setState((current) => current === "checking" ? "invalid" : current);
    }, 6000);
    return () => { mounted = false; window.clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) { setError("パスワードは8文字以上にしてください。"); return; }
    if (password !== confirm) { setError("確認用パスワードが一致しません。"); return; }
    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("再設定リンクの認証を確認できませんでした。");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirm("");
      setState("complete");
    } catch {
      setError("パスワードを更新できませんでした。新しい再設定メールを発行して、もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 20, background: "#f9fafb", color: "#183c30" }}>
      <section style={{ background: "#fff", width: "100%", maxWidth: 430, boxSizing: "border-box", borderRadius: 20, padding: "32px 24px", boxShadow: "0 10px 40px #17352c12" }}>
        <p style={{ fontSize: 12, letterSpacing: ".16em", fontWeight: 700, color: "#008661" }}>WAN TONE · SECURITY</p>
        <h1 style={{ fontSize: 24, margin: "14px 0" }}>パスワードの再設定</h1>
        {state === "checking" && <p role="status">再設定リンクを確認しています…</p>}
        {state === "invalid" && <div role="alert">
          <p>再設定リンクを確認できませんでした。リンクの有効期限が切れている可能性があります。</p>
          <Link href="/" style={{ color: "#008661", fontWeight: 700 }}>ログイン画面へ戻る</Link>
        </div>}
        {state === "complete" && <div role="status">
          <p>新しいパスワードに変更しました。</p>
          <Link href="/" style={{ color: "#008661", fontWeight: 700 }}>アプリに戻る</Link>
        </div>}
        {state === "ready" && <form onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: 14 }}>
          <p style={{ margin: "4px 0", fontSize: 14, color: "#56675f" }}>新しいパスワードを入力してください（8文字以上）。</p>
          <label htmlFor="new-password" style={{ fontWeight: 700 }}>新しいパスワード</label>
          <div style={{ position: "relative" }}>
            <input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} style={{ padding: "13px 56px 13px 13px", fontSize: 16, border: "1px solid #a4bcb1", borderRadius: 10, width: "100%", boxSizing: "border-box" }} />
            <PasswordVisibilityButton visible={showPassword} onToggle={() => setShowPassword((current) => !current)} label="新しいパスワード" />
          </div>
          <label htmlFor="confirm-password" style={{ fontWeight: 700 }}>新しいパスワード（確認）</label>
          <div style={{ position: "relative" }}>
            <input id="confirm-password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)} style={{ padding: "13px 56px 13px 13px", fontSize: 16, border: "1px solid #a4bcb1", borderRadius: 10, width: "100%", boxSizing: "border-box" }} />
            <PasswordVisibilityButton visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((current) => !current)} label="確認用パスワード" />
          </div>
          {error && <p role="alert" style={{ color: "#a13b32", fontSize: 14 }}>{error}</p>}
          <button type="submit" disabled={saving} style={{ padding: 15, border: 0, borderRadius: 12, background: "#008661", color: "#fff", fontSize: 16, fontWeight: 700, opacity: saving ? .6 : 1 }}>{saving ? "更新しています…" : "新しいパスワードに変更する"}</button>
        </form>}
      </section>
    </main>
  );
}
