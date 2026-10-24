"use client";

import type { ReactNode } from "react";
import styles from "./AdminMenuNavigation.module.css";

export type AdminSection = "applications" | "customers" | "schedule" | "accounts" | "announcements" | "analytics";

const items: { id: AdminSection; title: string; help: string; icon: string }[] = [
  { id: "applications", title: "相談申込み", help: "新しい相談・対応状況", icon: "inbox" },
  { id: "customers", title: "担当顧客", help: "愛犬と飼い主の情報", icon: "users" },
  { id: "schedule", title: "予約管理", help: "面談・空き枠を確認", icon: "calendar" },
  { id: "accounts", title: "ユーザー管理", help: "会員・権限の設定", icon: "user" },
  { id: "announcements", title: "お知らせ", help: "運営からの配信", icon: "bell" },
  { id: "analytics", title: "利用状況", help: "利用データを分析", icon: "chart" },
];

function MenuIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    inbox: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 14h5l2 3h4l2-3h5" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2" /><path d="M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M8 15h3" /></>,
    user: <><circle cx="10" cy="8" r="3" /><path d="M4 20v-2a6 6 0 0 1 12 0v2M18 13v6M15 16h6" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    chart: <><path d="M4 20h16M7 17v-5M12 17V6M17 17v-8" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.icon}>{paths[name]}</svg>;
}

export default function AdminMenuNavigation({
  active,
  onSelect,
  pendingApplications,
}: {
  active: AdminSection;
  onSelect: (section: AdminSection) => void;
  pendingApplications: number;
}) {
  return (
    <nav className={styles.navigation} aria-label="管理メニュー">
      <div className={styles.group}>
        <p className={styles.groupTitle}>顧客・予約</p>
        <div className={styles.cards}>
          {items.slice(0, 3).map((item) => (
            <button type="button" key={item.id} className={`${styles.card} ${active === item.id ? styles.selected : ""}`} aria-current={active === item.id ? "page" : undefined} onClick={() => onSelect(item.id)}>
              <span className={styles.iconFrame}><MenuIcon name={item.icon} /></span>
              <span className={styles.copy}><strong>{item.title}</strong><small>{item.help}</small></span>
              {item.id === "applications" && pendingApplications > 0 && <span className={styles.count} aria-label={`未対応${pendingApplications}件`}>{pendingApplications > 99 ? "99+" : pendingApplications}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <p className={styles.groupTitle}>運営・分析</p>
        <div className={styles.cards}>
          {items.slice(3).map((item) => (
            <button type="button" key={item.id} className={`${styles.card} ${active === item.id ? styles.selected : ""}`} aria-current={active === item.id ? "page" : undefined} onClick={() => onSelect(item.id)}>
              <span className={styles.iconFrame}><MenuIcon name={item.icon} /></span>
              <span className={styles.copy}><strong>{item.title}</strong><small>{item.help}</small></span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
