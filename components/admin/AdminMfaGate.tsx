"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/supabase";

type Stage = "checking" | "enroll" | "verify" | "ready" | "error";

export default function AdminMfaGate({ children, onVerified }: { children: React.ReactNode; onVerified?: () => void }) {
  const notified = useRef(false);
  const [stage, setStage] = useState<Stage>("checking");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setStage("checking");
    setMessage("");
    const [aal, factors] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (aal.error || factors.error) {
      setMessage("認証状態を確認できません。再度ログインしてください。");
      setStage("error");
      return;
    }
    const verified = factors.data.totp.find((factor) => factor.status === "verified");
    if (verified && aal.data.currentLevel === "aal2") {
      setStage("ready");
      return;
    }
    if (verified) {
      setFactorId(verified.id);
      setStage("verify");
      return;
    }
    setStage("enroll");
  }, []);

  useEffect(() => { void check(); }, [check]);

  async function enroll() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      // Supabase keeps abandoned enrollments as unverified factors. A new
      // enrollment can be rejected until these stale factors are removed.
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setMessage(`認証設定を確認できません: ${factors.error.message}`);
        return;
      }
      const verified = factors.data.all.find((factor) =>
        factor.factor_type === "totp" && factor.status === "verified"
      );
      if (verified) {
        setFactorId(verified.id);
        setQr("");
        setSecret("");
        setStage("verify");
        return;
      }
      const stale = factors.data.all.filter((factor) =>
        factor.factor_type === "totp" && factor.status === "unverified"
      );
      for (const factor of stale) {
        const removal = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removal.error) {
          setMessage(`途中の登録を整理できません: ${removal.error.message}`);
          return;
        }
      }
      const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "WanTone Admin" });
      if (result.error || !result.data.totp) {
        const detail = result.error?.message ?? "QRコードの生成に失敗しました";
        const errorCode = result.error?.code ? ` (${result.error.code})` : "";
        setMessage(`登録できませんでした: ${detail}${errorCode}`);
        return;
      }
      setFactorId(result.data.id);
      setQr(result.data.totp.qr_code);
      setSecret(result.data.totp.secret);
      setStage("verify");
    } catch (error) {
      setMessage(`登録処理に失敗しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    setMessage("");
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    const result = challenge.error ? { error: challenge.error } :
      await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (result.error) {
      setBusy(false);
      setMessage("認証コードを確認できませんでした。最新の6桁コードを入力してください。");
      setCode("");
      return;
    }
    await supabase.auth.refreshSession();
    setCode("");
    setQr("");
    setSecret("");
    setBusy(false);
    await check();
  }

  useEffect(() => {
    if (stage === "ready" && !notified.current) {
      notified.current = true;
      onVerified?.();
    }
  }, [stage, onVerified]);

  if (stage === "ready") return <>{children}</>;
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, background: "#f8f9f6", color: "#202522" }}>
      <section aria-labelledby="admin-mfa-title" style={{ width: "100%", maxWidth: 420, background: "white", borderRadius: 20, padding: 28, boxShadow: "0 12px 44px #203a3020" }}>
        <p style={{ color: "#008661", letterSpacing: ".18em", fontSize: 12 }}>WANTONE · SECURITY</p>
        <h1 id="admin-mfa-title" style={{ fontSize: 25, marginBlock: 16 }}>管理者の2段階認証</h1>
        {stage === "checking" && <p role="status">認証状態を確認しています…</p>}
        {stage === "error" && <button type="button" onClick={() => void check()}>再試行</button>}
        {stage === "enroll" && <>
          <p>管理画面を利用するには、Google Authenticatorなどの認証アプリを登録してください。</p>
          <button type="button" disabled={busy} onClick={() => void enroll()}>認証アプリを登録する</button>
        </>}
        {stage === "verify" && <>
          {qr && <div>
            <p>認証アプリでQRコードを読み取ってください。</p>
            {/* QR is returned by Supabase Auth; never send the secret to app logs or analytics. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="認証アプリ登録用QRコード" width={210} height={210} />
            <details><summary>QRコードを読み取れない場合</summary><code style={{ overflowWrap: "anywhere" }}>{secret}</code></details>
          </div>}
          <form onSubmit={(event) => void verify(event)}>
            <label htmlFor="admin-totp">認証アプリの6桁コード</label>
            <input id="admin-totp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required style={{ display: "block", width: "100%", padding: 12, marginBlock: 12 }} />
            <button disabled={busy || code.length !== 6} type="submit">認証して管理画面へ</button>
          </form>
        </>}
        {message && <p role="alert" style={{ color: "#a13b32" }}>{message}</p>}
      </section>
    </main>
  );
}
