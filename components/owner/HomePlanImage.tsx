import Image from "next/image";
import type { CSSProperties } from "react";
import { homeImagePlan, type HomeImageSlot } from "@/lib/ui/homeImagePlan";
import styles from "./HomePlanImage.module.css";

type Props = { slot: HomeImageSlot; className?: string; decorative?: boolean; sizes?: string };

export default function HomePlanImage({ slot, className = "", decorative = false, sizes = "(max-width: 600px) 24vw, 180px" }: Props) {
  const image = homeImagePlan[slot];
  const position = {
    "--plan-fit-mobile": image.mobile.fit,
    "--plan-position-mobile": `${image.mobile.x}% ${image.mobile.y}%`,
    "--plan-fit-desktop": image.desktop.fit,
    "--plan-position-desktop": `${image.desktop.x}% ${image.desktop.y}%`,
  } as CSSProperties;
  return <span className={`${styles.frame} ${slot === "hero" && image.reference ? styles.referenceHero : ""} ${className}`.trim()} style={position} aria-hidden={decorative || undefined}>
    <Image src={image.src} alt={decorative ? "" : image.alt} fill sizes={sizes} preload={slot === "hero"} draggable={false} className={styles.image} />
  </span>;
}
