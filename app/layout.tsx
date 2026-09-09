import type { Metadata, Viewport } from "next";
import { Josefin_Sans, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-noto-jp",
  display: "swap",
});

const josefinSans = Josefin_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-josefin",
  display: "swap",
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
      <body className={`${notoSansJP.variable} ${josefinSans.variable}`}>{children}</body>
    </html>
  );
}
