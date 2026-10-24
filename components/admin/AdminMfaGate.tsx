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
    setBusy(true);
    setMessage("");
    const result = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "WanTone Admin" });
    setBusy(false);
    if (result.error || !result.data.totp) {
      const detail = result.error?.message ?? "QRコードの生成に失敗しました";
      const code = result.error?.code ? ` (${result.error.code})` : "";
      setMessage(`登録できませんでした: ${detail}${code}`);
      return;
    }
    setFactorId(result.data.id);
    setQr(result.data.totp.qr_code);
    setSecret(result.data.totp.secret);
    setStage("verify");
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
      <section aria-labelledby="admin-mfa-title" style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", background: "white", borderRadius: 20, padding: "30px 24px", boxShadow: "0 12px 44px #203a3020" }}>
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
          <form onSubmit={(event) => void verify(event)} style={{ marginTop: 18 }}>
            <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.8, color: "#54635c" }}>
              Google Authenticatorなどの認証アプリに表示されている、6桁の数字を入力してください。
            </p>
            <label htmlFor="admin-totp" style={{ display: "block", marginBottom: 10, fontWeight: 700, fontSize: 16 }}>
              認証コード（6桁）
            </label>
            <input
              id="admin-totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              aria-describedby="admin-totp-help"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              style={{ display: "block", boxSizing: "border-box", width: "100%", minHeight: 68, padding: "14px 16px", marginBottom: 8, border: "2px solid #008661", borderRadius: 12, background: "#fbfefd", color: "#17392e", fontSize: 30, fontWeight: 700, letterSpacing: "0.26em", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
            />
            <p id="admin-totp-help" style={{ margin: "0 0 20px", color: "#687970", fontSize: 13 }}>
              {code.length} / 6桁入力済み
            </p>
            <button
              disabled={busy || code.length !== 6}
              type="submit"
              style={{ display: "block", width: "100%", minHeight: 56, padding: "14px 18px", border: 0, borderRadius: 12, background: busy || code.length !== 6 ? "#bfd8ce" : "#008661", color: busy || code.length !== 6 ? "#335c4d" : "#ffffff", fontSize: 16, fontWeight: 700, cursor: busy || code.length !== 6 ? "not-allowed" : "pointer" }}
            >
              {busy ? "認証中…" : "6桁のコードで認証する"}
            </button>
            <p style={{ margin: "12px 0 0", color: "#687970", fontSize: 13, textAlign: "center" }}>
              認証が完了すると管理画面が開きます。
            </p>
          </form>
        </>}
        {message && <p role="alert" style={{ color: "#a13b32" }}>{message}</p>}
      </section>
    </main>
  );
}
