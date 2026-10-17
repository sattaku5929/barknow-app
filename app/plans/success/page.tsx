import Link from "next/link";

export default function CoachingPlanSuccessPage() {
  return (
    <main className="grid min-h-svh place-items-center bg-[#F9FAFB] px-5 py-12 text-[#292b29]">
      <section className="w-full max-w-md rounded-2xl border border-[#00866129] bg-white p-7 text-center shadow-[0_2px_15px_-3px_rgba(0,0,0,.05)] sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#e6f3ee] text-2xl font-medium text-[#008661]" aria-hidden="true">✓</span>
        <p className="mt-5 text-[10px] font-medium tracking-[.18em] text-[#008661]">PAYMENT COMPLETED</p>
        <h1 className="mt-2 text-2xl leading-relaxed font-semibold">お申し込みを<br />受け付けました</h1>
        <p className="mt-3 text-xs leading-7 text-[#68716c]">決済情報を確認後、コーチングプランが有効になります。反映まで少し時間がかかる場合があります。</p>
        <Link className="mt-7 grid min-h-13 place-items-center rounded-full bg-[#008661] text-sm font-medium text-white no-underline" href="/">WanToneアプリへ戻る</Link>
      </section>
    </main>
  );
}
