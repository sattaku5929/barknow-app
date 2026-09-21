import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "オンラインコーチングプラン | WanTone",
  description: "月4回の個別オンラインレッスンと、専属トレーナーによるチャットサポートが利用できるWanToneのコーチングプランです。",
};

export default function CoachingPlanLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
