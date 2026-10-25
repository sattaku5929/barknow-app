import type { ReactNode } from "react";
import type { EventTheme } from "@/lib/observations/observationEvent";
import styles from "./ObservationEventHub.module.css";

function Dog({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M22 33h24v15H22z" fill="#e4b78d" />
    <path d="M23 45v10m18-10v10M46 36q12 1 10-10" fill="none" stroke="#ba8964" strokeWidth="5" strokeLinecap="round" />
    <rect x="13" y="16" width="25" height="25" rx="11" fill="#eac6a2" />
    <path d="M14 18q-10-5-8 9l6 10 7-13M34 18q10-5 10 7l-5 12-8-13" fill="#ba8964" />
    <ellipse cx="25" cy="32" rx="9" ry="6" fill="#fff7eb" />
    <circle cx="21" cy="26" r="1.5" fill="#354f43" /><circle cx="31" cy="26" r="1.5" fill="#354f43" />
    <path d="m23 30 3 3 3-3Z" fill="#354f43" /><path d="M17 40h18" stroke="#008661" strokeWidth="3" />
  </g>;
}

const scenes = {
    barking: <><Dog x={8} y={2} /><path d="m65 24 8-5m-7 14h10m-12 8 8 5" stroke="#d39b55" strokeWidth="3" strokeLinecap="round" /></>,
    walk: <><path d="M8 59q30-13 72 0" fill="none" stroke="#b1cdb8" strokeWidth="5" strokeLinecap="round" /><Dog x={4} y={1} /><path d="M39 40q15-2 18-24l12-5" fill="none" stroke="#008661" strokeWidth="2.5" /><circle cx="70" cy="10" r="5" fill="#e5b978" /></>,
    alone: <><path d="m5 29 27-21 27 21v31H10V29" fill="#ddebe3" /><path d="m5 29 27-21 27 21" fill="none" stroke="#7fae94" strokeWidth="3" strokeLinejoin="round" /><Dog x={15} y={13} scale={.78} /><circle cx="74" cy="19" r="10" fill="#fff" stroke="#b6cdbf" strokeWidth="2" /><path d="M74 13v7h5" fill="none" stroke="#008661" strokeWidth="2" /></>,
    toilet: <><rect x="9" y="37" width="70" height="24" rx="7" fill="#d4e8ed" /><rect x="15" y="41" width="58" height="15" rx="4" fill="#f9fcfd" /><Dog x={13} y={-3} scale={.88} /><path d="M70 25q-8 10 0 10t0-10" fill="#9ac7d4" /></>,
    dog_reaction: <><Dog x={-1} y={13} scale={.75} /><g transform="translate(88 0) scale(-1 1)"><Dog x={-1} y={13} scale={.75} /></g><path d="M39 12q5-7 10 0l-5 7Z" fill="#d59b88" /></>,
    person_reaction: <><Dog x={-3} y={12} scale={.8} /><circle cx="66" cy="16" r="8" fill="#e9c5a7" /><path d="M54 32q12-12 24 0v15H54Z" fill="#7faa97" /><path d="M60 47v13m12-13v13" stroke="#456657" strokeWidth="5" strokeLinecap="round" /><path d="m55 32-10 8" stroke="#e9c5a7" strokeWidth="5" strokeLinecap="round" /></>,
    biting: <><Dog x={5} y={6} /><path d="M57 37q-7-7-10-2t2 6l12 7q8 4 10-2t-2-7Z" fill="#d9a277" /><path d="m61 18 5-5m3 12h7" stroke="#a9c7b4" strokeWidth="2.5" strokeLinecap="round" /></>,
    meal: <><Dog x={-1} y={-1} scale={.9} /><path d="M43 45h37l-5 15H48Z" fill="#76aa94" /><ellipse cx="61" cy="45" rx="19" ry="5" fill="#d7e8de" /><circle cx="55" cy="44" r="3" fill="#b38b65" /><circle cx="63" cy="43" r="3" fill="#b38b65" /><circle cx="69" cy="45" r="3" fill="#b38b65" /></>,
    sleep_rest: <><ellipse cx="42" cy="52" rx="34" ry="11" fill="#dbcdbd" /><path d="M17 45q0-23 29-16 21 4 15 21H22Z" fill="#e4b78d" /><ellipse cx="28" cy="43" rx="14" ry="11" fill="#eac6a2" /><path d="M17 37q-10-9-9 4l6 10" fill="#ba8964" /><path d="m24 43 4 1 4-1M61 18h9l-9 9h9m3-19h6l-6 6h6" fill="none" stroke="#688b88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
    grooming: <><Dog x={2} y={6} /><rect x="60" y="10" width="14" height="28" rx="7" transform="rotate(22 67 24)" fill="#b5ccc2" /><path d="m62 38-5 14" stroke="#9f7e5d" strokeWidth="5" strokeLinecap="round" /><path d="M49 10v8m-4-4h8m23 31v8m-4-4h8" stroke="#d7b577" strokeWidth="2" strokeLinecap="round" /></>,
  } satisfies Record<EventTheme, ReactNode>;

export default function ThemeIllustration({ theme }: { theme: EventTheme }) {
  return <svg className={styles.art} viewBox="0 0 88 68" aria-hidden="true" focusable="false"><ellipse cx="44" cy="35" rx="42" ry="31" fill="#f4f6ef" />{scenes[theme]}</svg>;
}
