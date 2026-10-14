import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import "./bottom-nav.css";
import "./report-dashboard.css";
import "./owner-action-colors.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-noto-jp",
  display: "swap",
});

const editorial = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-editorial",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wan Tone | 愛犬とコーチをつなぐ記録アプリ",
  description: "愛犬の毎日を記録し、気になる変化をコーチに相談できるBarKnowのケアアプリです。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "WanTone", statusBarStyle: "default" },
  icons: { apple: "/icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fcfbf8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} ${editorial.variable}`}>{children}</body>
    </html>
  );
}
