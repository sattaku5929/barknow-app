"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/app/supabase";
import type { MembershipSummary } from "@/lib/membership";
import { membershipFeatureComparison } from "@/lib/entitlements";

const benefits = [
  { icon: "01", title: "プロのトレーナーに相談", description: "愛犬に合わせたしつけ・日常のお悩みを、一緒に整理します。" },
  { icon: "02", title: "記録をもとに継続サポート", description: "日々のできごとを共有しながら、変化に合わせて取り組みを考えます。" },
  { icon: "03", title: "おうちでも続けやすい", description: "オンライン面談やチャットを通じて、毎日の暮らしに寄り添います。" },
];

export default function MembershipPage() {
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (error || !data.session) return;
      const response = await fetch("/api/membership", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store",
      });
      if (response.ok) {
        const result = await response.json() as MembershipSummary;
        if (live) setMembership(result);
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const active = membership?.state === "active";
  return (
    <main className="min-h-svh bg-[#f8faf8] text-[#22362c]">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
        <Link href="/" className="text-sm font-semibold tracking-[.07em] text-[#008661] no-underline">WanTone <span className="text-[10px] font-normal text-[#61736a]">by BarKnow</span></Link>
        <Link href="/" className="text-xs text-[#60766c] no-underline">アプリに戻る ↗</Link>
      </header>

      <section className="relative overflow-hidden bg-[#ebf5ef] px-6 py-15 text-center sm:py-21">
        <div className="pointer-events-none absolute -right-16 -top-19 size-55 rounded-full bg-[#d7eae1] blur-[3px]" aria-hidden="true" />
        <p className="relative text-[10px] font-semibold tracking-[.25em] text-[#008661]">WAN TONE MEMBERSHIP</p>
        <h1 className="relative mx-auto mt-4 max-w-2xl text-[clamp(28px,5vw,48px)] leading-[1.45] font-semibold tracking-[.02em]">
          愛犬との毎日に、<br /><span className="text-[#008661]">頼れるパートナーを。</span>
        </h1>
        <p className="relative mx-auto mt-5 max-w-xl text-[13px] leading-8 text-[#586e62] sm:text-sm">
          「これでいいのかな？」と思う小さな疑問も、ひとりで抱えなくていい。<br className="hidden sm:block" />
          WanToneのオンラインコーチングで、愛犬に合った暮らしを一緒に育てていきます。
        </p>
        <div className="relative mx-auto mt-8 inline-flex items-center gap-2 rounded-full border border-[#b8dbca] bg-white/80 px-4 py-2 text-xs font-medium text-[#008661]">
          {active ? "現在、月額会員としてご利用中です" : "無料会員からのアップグレードをご案内"}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-12 sm:py-18">
        <div className="mb-7 text-center">
          <p className="text-[10px] font-semibold tracking-[.22em] text-[#008661]">WHAT YOU GET</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">もっと相談できる、もっと続けられる。</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {benefits.map(benefit => (
            <article key={benefit.icon} className="rounded-2xl border border-[#e0eae4] bg-white p-6 shadow-[0_4px_22px_rgba(0,60,38,.035)]">
              <span className="grid size-10 place-items-center rounded-xl bg-[#e9f6ee] text-xs font-semibold text-[#008661]">{benefit.icon}</span>
              <h3 className="mt-4 text-base font-semibold">{benefit.title}</h3>
              <p className="mt-3 text-xs leading-7 text-[#687a70]">{benefit.description}</p>
            </article>
          ))}
        </div>
        <section className="mt-11" aria-labelledby="membership-plan-comparison">
          <p className="text-center text-[10px] font-semibold tracking-[.22em] text-[#008661]">PLANS & FEATURES</p>
          <h2 id="membership-plan-comparison" className="mt-2 text-center text-xl font-semibold sm:text-2xl">無料で続ける。必要なときはプロと一緒に。</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-xs leading-7 text-[#66796c]">
            日々の記録やお世話管理は、無料でもずっと。月額プランでは担当コーチとのチャットやオンラインサポートが加わります。
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-[#dce9e2] bg-white">
            <table className="w-full border-collapse text-[12px] sm:text-sm">
              <thead className="bg-[#edf7f2]">
                <tr><th scope="col" className="w-[56%] px-4 py-4 text-left font-semibold text-[#355143] sm:px-6">使える機能</th>
                <th scope="col" className="px-2 py-4 text-center font-semibold text-[#536b5f]">無料</th>
                <th scope="col" className="px-2 py-4 text-center font-semibold text-[#008661]">月額</th></tr>
              </thead>
              <tbody>
                {membershipFeatureComparison.map((feature) => (
                  <tr key={feature.key} className="border-t border-[#e8efea]">
                    <th scope="row" className="px-4 py-3 text-left font-medium leading-6 text-[#415a4c] sm:px-6">{feature.label}</th>
                    <td className="px-2 py-3 text-center">{feature.free ? <span className="font-semibold text-[#008661]" aria-label="利用できます">✓</span> : <span className="text-[#b2bcb5]" aria-label="対象外">—</span>}</td>
                    <td className="px-2 py-3 text-center">{feature.paid ? <span className="font-semibold text-[#008661]" aria-label="利用できます">✓</span> : <span className="text-[#b2bcb5]" aria-label="対象外">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-6 text-[#73877b]">
            ※チャット・オンラインコーチングは、月額登録後に担当コーチが確定してから利用できます。契約料金・利用条件・受付開始日は準備中です。
          </p>
        </section>

        <div className="mt-9 rounded-2xl border border-[#d6e8dd] bg-[#fff] p-6 sm:p-9">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[.15em] text-[#008661]">ONLINE COACHING</p>
              <h2 className="mt-2 text-xl font-semibold">月額プラン</h2>
              <p className="mt-3 max-w-lg text-xs leading-7 text-[#5f7368]">
                担当トレーナーとの面談やチャットサポートを中心としたプランを準備中です。料金・サポート回数・申込方法は正式決定後にこのページでご案内します。
              </p>
            </div>
            <div className="shrink-0 rounded-xl bg-[#eef7f2] px-5 py-4 text-center text-sm font-semibold text-[#008661]">
              {active ? "月額会員" : "お申し込み準備中"}
            </div>
          </div>
          <div className="mt-6 border-t border-[#e6eee8] pt-5">
            {active ? (
              <p className="text-xs leading-7 text-[#66796c]">現在月額会員として登録されています。契約内容・解約方法のご案内は準備中です。ご不明な点はサポートへお問い合わせください。</p>
            ) : (
              <p className="text-xs leading-7 text-[#66796c]">現在、この画面での有料会員登録・決済は受け付けていません。決済サービスと契約条件が確定した後に受付を開始します。</p>
            )}
            <a href="https://barknow-official.vercel.app/#contact" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-[#008661] px-6 text-xs font-semibold text-[#008661] no-underline">
              プランについて問い合わせる ↗
            </a>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-4xl border-t border-[#e0eae4] px-5 py-6 text-center text-[11px] text-[#8a9a90]">© 2026 BarKnow · 大切な家族に、本当にいいものを。</footer>
    </main>
  );
}
