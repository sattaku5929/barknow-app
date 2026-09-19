import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "WanTone｜BarKnow",
    short_name: "WanTone",
    description: "愛犬の毎日を記録し、担当コーチへ相談できるケアアプリです。",
    start_url: "/",
    display: "standalone",
    background_color: "#fcfbf8",
    theme_color: "#008661",
    icons: [
      { src: "/icon.png", sizes: "4267x4267", type: "image/png", purpose: "any" },
    ],
  };
}
