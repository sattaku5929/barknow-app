import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Wan Tone by BarKnow",
    short_name: "Wan Tone",
    description: "愛犬の毎日を記録し、担当コーチへ相談できるケアアプリです。",
    start_url: "/",
    display: "standalone",
    background_color: "#fcfbf8",
    theme_color: "#008661",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
