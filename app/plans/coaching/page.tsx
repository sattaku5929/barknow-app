"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/app/supabase";

type AuthState = "checking" | "authenticated" | "anonymous";

const configuredMonthlyPrice = process.env.NEXT_PUBLIC_COACHING_MONTHLY_PRICE?.trim() || "月額 9,800円";

export default function CoachingPlanPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthState(nextSession?.user ? "authenticated" : "anonymous");
    };

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("[Coaching plan] session check failed", error);
      applySession(error ? null : data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function startCheckout() {
    if (!session?.user.id || checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutMessage("");

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: session.user.id }),
      });
      const result = await response.json().catch(() => null) as { checkoutUrl?: string | null; message?: string; error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "申し込み処理を開始できませんでした");
      if (result?.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setCheckoutMessage(result?.message || "Stripe決済の準備が整い次第、この画面からお申し込みいただけます。");
    } catch (error) {
      console.error("[Coaching plan] checkout request failed", { userId: session.user.id, error });
      setCheckoutMessage(error instanceof Error ? error.message : "申し込み処理を開始できませんでした");
    } finally {
      setCheckoutBusy(false);
    }
  }

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_82%_16%,rgba(0,134,97,.12),transparent_30%),linear-gradient(145deg,#fff_0%,#faf8f3_55%,#edf6f1_100%)] text-[#292b29]">
      <header className="relative z-20 mx-auto flex min-h-[68px] w-[calc(100%-32px)] max-w-280 items-center justify-between border-b border-[#00866121] sm:min-h-[78px] sm:w-[calc(100%-48px)]">
        <Link href="/" className="flex items-center gap-2.5 text-inherit no-underline" aria-label="WanTone ホームへ戻る">
          <Image className="size-9 rounded-[10px] object-cover sm:size-[42px]" src="/icon.png" alt="BarKnow" width={42} height={42} priority />
          <span className="block"><strong className="block text-base tracking-[.02em]">WanTone</strong><small className="mt-px block text-[9px] tracking-[.09em] text-[#6f7873]">by BarKnow</small></span>
        </Link>
        <a className="text-[10px] font-bold text-[#008661] no-underline sm:text-xs" href="https://barknow-official.vercel.app/app/" target="_blank" rel="noopener noreferrer">サービスについて ↗</a>
      </header>

      <section className="relative mx-auto grid min-h-[calc(100svh-136px)] w-[calc(100%-32px)] max-w-280 grid-cols-1 items-center gap-[30px] py-10 sm:w-[calc(100%-48px)] sm:gap-[42px] sm:py-[45px] lg:grid-cols-[minmax(0,1.08fr)_minmax(350px,.78fr)] lg:gap-[70px] lg:py-16 lg:pb-[72px]">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(rgba(0,134,97,.15)_.65px,transparent_.65px)] bg-size-[22px_22px] opacity-20" aria-hidden="true" />
        <div className="relative z-10">
          <p className="mb-[18px] flex items-center gap-3 text-[10px] font-extrabold tracking-[.2em] text-[#008661] before:h-px before:w-[34px] before:bg-[#008661] before:content-['']">WAN TONE COACHING</p>
          <h1 className="m-0 text-4xl leading-[1.32] font-medium tracking-[.01em] sm:text-[clamp(39px,5vw,65px)]">WanTone<br /><span className="text-[.62em] text-[#008661]">オンラインコーチングプラン</span></h1>
          <p className="mt-[18px] max-w-[620px] text-[13px] leading-8 text-[#505a54] sm:mt-[25px] sm:text-[15px]">日々の記録をプロコーチと共有しながら、愛犬に合う方法を一緒に見つける継続サポートです。</p>
          <div className="mt-[27px] grid border-y border-[#0086612e] sm:mt-[38px]">
            <article className="grid grid-cols-[39px_minmax(0,1fr)] gap-[13px] border-b border-[#00866121] py-4 sm:py-5"><b className="text-[10px] tracking-[.12em] text-[#008661]">01</b><div><strong className="block text-sm font-semibold sm:text-base">月4回の個別オンラインレッスン</strong><p className="mt-1.5 text-xs leading-7 text-[#6f7873]">愛犬の様子と記録を見ながら、次に試すことを具体的に整理します。</p></div></article>
            <article className="grid grid-cols-[39px_minmax(0,1fr)] gap-[13px] py-4 sm:py-5"><b className="text-[10px] tracking-[.12em] text-[#008661]">02</b><div><strong className="block text-sm font-semibold sm:text-base">24時間チャット相談・回数無制限</strong><p className="mt-1.5 text-xs leading-7 text-[#6f7873]">迷った場面をそのまま共有。写真や動画も使って担当コーチに相談できます。</p></div></article>
          </div>
        </div>

        <aside className="relative z-10 mx-auto w-full max-w-[540px] rounded-[4px_27px_4px_4px] border border-[#0086612b] bg-white/93 p-[28px_19px_21px] shadow-[0_28px_70px_rgba(29,67,52,.12)] backdrop-blur-lg sm:rounded-[4px_34px_4px_4px] sm:p-9 lg:max-w-none" aria-label="コーチングプラン申し込み">
          <p className="mb-[18px] text-[10px] font-extrabold tracking-[.2em] text-[#008661]">MONTHLY PLAN</p>
          <h2 className="m-0 text-[21px] leading-[1.55] font-medium sm:text-2xl">愛犬との毎日に、<br />相談できる安心を。</h2>
          <div className="my-5 border-y border-[#00866126] py-[19px] sm:mt-6">
            <span className="block text-[10px] font-bold text-[#6f7873]">月額料金</span>
            <strong className="mt-1 block text-[21px] leading-[1.45] font-bold text-[#006c4f] sm:text-[25px]">{configuredMonthlyPrice}</strong>
            <small className="mt-0.5 block text-[9px] text-[#6f7873]">税込</small>
          </div>
          <ul className="m-0 grid list-none gap-[9px] p-0 text-xs text-[#4d5852]">
            <li className="before:mr-[9px] before:font-black before:text-[#008661] before:content-['✓']">個別オンラインレッスン 月4回</li>
            <li className="before:mr-[9px] before:font-black before:text-[#008661] before:content-['✓']">担当コーチへのチャット相談 無制限</li>
            <li className="before:mr-[9px] before:font-black before:text-[#008661] before:content-['✓']">日々の記録・写真・動画を共有</li>
          </ul>

          {authState === "checking" && (
            <div className="mt-[23px] flex items-center gap-2.5 rounded-[13px] bg-[#eff5f2] px-3.5 py-[13px] text-[11px] text-[#5f6e67]" role="status"><i className="size-[15px] animate-spin rounded-full border-2 border-[#c7d8d0] border-t-[#008661] motion-reduce:animate-none" aria-hidden="true" />ログイン状態を確認しています</div>
          )}

          {authState === "anonymous" && (
            <section className="mt-[23px] grid grid-cols-[34px_minmax(0,1fr)] gap-x-2.5 gap-y-[3px] rounded-2xl border border-[#00866121] bg-[#f3f8f5] p-4" aria-labelledby="login-required-title">
              <span className="row-span-2 text-[19px]" aria-hidden="true">🔒</span>
              <div><strong className="block text-xs text-[#334a40]" id="login-required-title">ログインが必要です</strong><p className="mt-[3px] text-[10px] leading-4 text-[#6f7873]">このページを閲覧するにはログインが必要です。</p></div>
              <Link className="col-span-full mt-2.5 grid min-h-11.5 place-items-center rounded-[13px] bg-[#006c4f] text-xs font-extrabold text-white no-underline" href="/?auth=login&next=%2Fplans%2Fcoaching">ログイン画面へ</Link>
            </section>
          )}

          {authState === "authenticated" && (
            <>
              <div className="mt-[23px] flex items-center gap-2.5 rounded-[13px] bg-[#eff5f2] px-3.5 py-[13px] text-[11px] text-[#5f6e67]"><span className="grid size-[25px] place-items-center rounded-full bg-[#008661] text-[11px] text-white" aria-hidden="true">✓</span><div><small className="block text-[8px] text-[#6f7873]">ログイン済み</small><strong className="mt-0.5 block max-w-[250px] overflow-hidden text-[10px] text-ellipsis whitespace-nowrap">{session?.user.email || "WanToneユーザー"}</strong></div></div>
              <button type="button" className="mt-3 flex min-h-13.5 w-full cursor-pointer items-center justify-center gap-[18px] rounded-full border-0 bg-[#008661] text-[13px] font-extrabold text-white shadow-[0_12px_28px_rgba(0,134,97,.2)] disabled:cursor-wait disabled:opacity-60" onClick={() => void startCheckout()} disabled={checkoutBusy}>
                {checkoutBusy ? "Stripeへ接続しています…" : "Stripeで安全に申し込む"}<span className="text-[17px]">→</span>
              </button>
            </>
          )}

          {checkoutMessage && <p className="mt-3 rounded-[11px] bg-[#edf7f2] px-3 py-[11px] text-[10px] leading-[1.65] text-[#006c4f]" role="status">{checkoutMessage}</p>}
          <p className="mt-[13px] text-center text-[9px] leading-[1.65] text-[#88918c]">決済情報はStripeが安全に管理します。WanToneにカード番号は保存されません。</p>
        </aside>
      </section>

      <footer className="mx-auto flex w-[calc(100%-32px)] max-w-280 items-center justify-between gap-3 border-t border-[#0086611f] py-[22px] pb-[30px] text-[10px] text-[#6f7873] sm:w-[calc(100%-48px)]"><span>© 2026 BarKnow.</span><Link className="font-bold text-[#008661] no-underline" href="/">WanToneアプリへ戻る</Link></footer>
    </main>
  );
}
