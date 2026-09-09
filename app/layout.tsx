import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Wan Tone | 愛犬とコーチをつなぐ記録アプリ",
  description: "愛犬の毎日を記録し、気になる変化をコーチに相談できるBarKnowのケアアプリです。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fcfbf8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
