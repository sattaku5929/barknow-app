"use client";

import { FormEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ChatInput, { SentChatMessage } from "@/components/ChatInput";
import { usePushNotification } from "@/hooks/usePushNotification";
import { supabase } from "./supabase";

type View = "home" | "goals" | "record" | "report" | "coach" | "profile";
type Connection = "checking" | "online" | "local";
type Status = "良い" | "ふつう" | "気になる";
type RecordCategory = "daily" | "meal" | "barking" | "toilet" | "walk" | "sleep" | "win";
type BehaviorType = "barking" | "nipping" | "toilet_accident" | "jumping" | "pulling" | "other";
type GoalPeriod = "day" | "week" | "month";
type CareGoalType = "brush" | "teeth" | "paws" | "bath" | "nails" | "ears" | "training" | "custom";
type UserRole = "owner" | "coach" | "admin";
type AuthMode = "login" | "signup";
type CoachingStatus = "submitted" | "offered" | "assigned" | "consulting" | "payment_pending" | "active" | "closed";
type AdminTab = "applications" | "customers" | "accounts" | "schedule" | "coachProfile";

type DogProfile = {
  id?: string;
  name: string;
  breed: string;
  birthday: string;
  isFirstTimeOwner: "yes" | "no" | "";
  gender: "male" | "female" | "unknown" | "";
  trainingExperience: "first_time" | "once" | "twice" | "three_or_more" | "";
  daycareFrequency: string;
  walkFrequency: string;
  concerns: string;
  profileCompletedAt: string;
};

type OwnerProfile = {
  fullName: string;
  fullNameKana: string;
  phoneNumber: string;
  prefecture: string;
  address: string;
  birthDate: string;
  completedAt: string;
};

type DailyRecord = {
  id: string;
  category: RecordCategory;
  recordedOn: string;
  recordedTime: string;
  durationMinutes: number | null;
  behaviorTypes: BehaviorType[];
  behaviorCustomText: string;
  behaviorCustomTexts: string[];
  behaviorIntensity: number | null;
  mood: number;
  appetite: Status;
  activity: Status;
  toilet: Status;
  sleep: Status;
  behaviorNote: string;
  goodMoment: string;
};

type CoachMessage = {
  id: string;
  sender: "owner" | "coach";
  body: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "";
  mediaName: string;
  createdAt: string;
};

function mapCoachMessage(item: Record<string, unknown>): CoachMessage {
  return {
    id: String(item.id),
    sender: item.sender === "coach" ? "coach" : "owner",
    body: String(item.body ?? ""),
    mediaUrl: String(item.media_url ?? ""),
    mediaType: item.media_type === "image" || item.media_type === "video" ? item.media_type : "",
    mediaName: String(item.media_name ?? ""),
    createdAt: String(item.created_at),
  };
}

function MessageMedia({ message, onOpen }: { message: CoachMessage; onOpen?: (message: CoachMessage) => void }) {
  if (!message.mediaUrl || !message.mediaType) return null;
  if (onOpen) {
    return (
      <button type="button" className={`message-media message-media-button is-${message.mediaType}`} onClick={() => onOpen(message)} aria-label={`${message.mediaName || (message.mediaType === "image" ? "画像" : "動画")}をギャラリーで開く`}>
        {message.mediaType === "image"
          ? <img src={message.mediaUrl} alt={message.mediaName || "共有された画像"} loading="lazy" />
          : <><video src={message.mediaUrl} muted playsInline preload="metadata">動画を再生できません。</video><span className="media-play-mark" aria-hidden="true">▶</span></>}
      </button>
    );
  }
  return message.mediaType === "image"
    ? <a className="message-media" href={message.mediaUrl} target="_blank" rel="noreferrer"><img src={message.mediaUrl} alt={message.mediaName || "共有された画像"} loading="lazy" /></a>
    : <div className="message-media"><video src={message.mediaUrl} controls playsInline preload="metadata">動画を再生できません。</video></div>;
}

function urlsInMessage(body: string) {
  const matches = body.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return matches
    .map((value) => value.replace(/[.,!?;:。、！？）)\]}】]+$/u, ""))
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function UrlPreview({ value }: { value: string }) {
  const url = safeExternalUrl(value);
  if (!url) return null;
  const path = `${url.pathname === "/" ? "" : url.pathname}${url.search}`;
  const displayPath = path.length > 52 ? `${path.slice(0, 52)}…` : path;
  return (
    <a className="message-link-preview" href={url.href} target="_blank" rel="noopener noreferrer">
      <span><small>LINK</small><strong>{url.hostname.replace(/^www\./, "")}</strong>{displayPath && <em>{displayPath}</em>}</span>
      <b aria-hidden="true">↗</b>
    </a>
  );
}

function MessageBody({ body }: { body: string }) {
  const matcher = /https?:\/\/[^\s<>"']+/gi;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(body)) !== null) {
    const raw = match[0];
    const clean = raw.replace(/[.,!?;:。、！？）)\]}】]+$/u, "");
    const trailing = raw.slice(clean.length);
    if (match.index > cursor) parts.push(body.slice(cursor, match.index));
    const url = safeExternalUrl(clean);
    parts.push(url
      ? <a className="message-inline-link" href={url.href} target="_blank" rel="noopener noreferrer" key={`${match.index}-${clean}`}>{clean}</a>
      : clean);
    if (trailing) parts.push(trailing);
    cursor = match.index + raw.length;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  const firstUrl = urlsInMessage(body).find((value) => safeExternalUrl(value));
  return <><p>{parts}</p>{firstUrl && <UrlPreview value={firstUrl} />}</>;
}

type CareGoal = {
  id: string;
  title: string;
  goalType: CareGoalType;
  targetCount: number;
  period: GoalPeriod;
  reminderTime: string | null;
  createdAt: string;
};

type GoalCompletion = {
  id: string;
  goalId: string;
  completedOn: string;
  completedAt: string;
};

type AdminCustomer = {
  assignmentId: string;
  ownerId: string;
  ownerName: string;
  ownerNameKana: string;
  ownerPhoneNumber: string;
  ownerPrefecture: string;
  ownerAddress: string;
  ownerBirthDate: string;
  dogId: string;
  dogName: string;
  breed: string;
  records7d: number;
  concerns7d: number;
  latestMessage: string;
  latestMessageAt: string | null;
};

type AdminAccount = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  dogId: string | null;
  dogName: string;
  assignedCoachId: string | null;
  lastSignInAt: string | null;
  createdAt: string;
};

type AdminGoalProgress = CareGoal & {
  completedCount: number;
};

type CoachingApplication = {
  id: string;
  status: CoachingStatus;
  concernCategories: string[];
  desiredOutcome: string;
  note: string;
  assignedCoachId: string | null;
  ownerConfirmedAt: string | null;
  submittedAt: string;
};

type AdminCoachingApplication = CoachingApplication & {
  ownerId: string;
  dogId: string;
  dogName: string;
  ownerEmail: string;
  coachEmail: string | null;
};

type CoachProfile = {
  displayName: string;
  headline: string;
  bio: string;
  credentials: string;
  avatarUrl: string;
  avatarPreset: string;
  meetUrl: string;
};

type AvailabilitySlot = {
  id: string;
  coachId: string;
  coachName: string;
  coachEmail: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  sessionId: string;
  sessionStatus: OnlineSession["status"] | "";
  ownerName: string;
};
type OnlineSession = {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  dogName: string;
  coachId: string;
  coachName: string;
  coachAvatarUrl: string;
  coachHeadline: string;
  sessionType: "initial" | "followup";
  status: "booked" | "completed" | "cancelled";
  startsAt: string;
  endsAt: string;
  meetUrl: string;
  calendarSyncStatus: "pending" | "syncing" | "synced" | "error" | "not_connected";
  calendarSyncError: string;
};

const PROFILE_KEY = "wan-tone-profile-v1";
const RECORDS_KEY = "wan-tone-records-v1";
const MESSAGES_KEY = "wan-tone-messages-v1";
const CUSTOM_BEHAVIORS_KEY = "wan-tone-custom-behaviors-v1";
const CARE_GOALS_KEY = "wan-tone-care-goals-v1";
const GOAL_COMPLETIONS_KEY = "wan-tone-goal-completions-v1";
const REMINDER_SENT_KEY = "wan-tone-reminder-sent-v1";

const initialProfile: DogProfile = { name: "", breed: "", birthday: "", isFirstTimeOwner: "", gender: "", trainingExperience: "", daycareFrequency: "", walkFrequency: "", concerns: "", profileCompletedAt: "" };
const initialOwnerProfile: OwnerProfile = { fullName: "", fullNameKana: "", phoneNumber: "", prefecture: "", address: "", birthDate: "", completedAt: "" };

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

type CategoryInfo = {
  readonly id: RecordCategory;
  readonly label: string;
  readonly icon: RecordCategory;
  readonly description: string;
  readonly noteLabel: string;
  readonly placeholder: string;
};

const RECORD_CATEGORIES = [
  { id: "meal", label: "食事", icon: "meal", description: "食欲・食べ方", noteLabel: "食事で気づいたこと", placeholder: "食べ始めるまでの時間、残した量、いつもとの違いなど" },
  { id: "barking", label: "困りごと", icon: "barking", description: "吠え・甘噛みなど", noteLabel: "起きた場面と、その前後", placeholder: "直前にしていたこと、相手、場所、続いた時間など" },
  { id: "toilet", label: "トイレ", icon: "toilet", description: "回数・状態", noteLabel: "トイレで気づいたこと", placeholder: "回数、場所、便の状態、失敗した場面など" },
  { id: "walk", label: "お散歩", icon: "walk", description: "歩き方・反応", noteLabel: "散歩中の様子", placeholder: "引っ張り、立ち止まり、犬や人への反応など" },
  { id: "win", label: "できた", icon: "win", description: "小さな成長", noteLabel: "今日できたこと", placeholder: "待てができた、落ち着いて挨拶できたなど" },
] as const satisfies readonly CategoryInfo[];

const CARE_GOAL_TEMPLATES: Omit<CareGoal, "id" | "createdAt">[] = [
  { title: "ブラッシング", goalType: "brush", targetCount: 1, period: "day", reminderTime: null },
  { title: "歯磨き", goalType: "teeth", targetCount: 2, period: "week", reminderTime: null },
  { title: "肉球チェック・ケア", goalType: "paws", targetCount: 1, period: "week", reminderTime: null },
  { title: "シャンプー", goalType: "bath", targetCount: 1, period: "month", reminderTime: null },
  { title: "爪の長さをチェック", goalType: "nails", targetCount: 1, period: "month", reminderTime: null },
  { title: "耳の状態をチェック", goalType: "ears", targetCount: 1, period: "week", reminderTime: null },
  { title: "5分トレーニング", goalType: "training", targetCount: 3, period: "week", reminderTime: null },
];

const BEHAVIOR_TYPES = [
  { id: "barking", label: "吠え", description: "来客・物音・要求など" },
  { id: "nipping", label: "甘噛み・噛む", description: "遊び中・興奮時など" },
  { id: "toilet_accident", label: "トイレ失敗", description: "場所・タイミングなど" },
  { id: "jumping", label: "飛びつき", description: "人・犬への反応など" },
  { id: "pulling", label: "引っ張り", description: "散歩中の場面など" },
  { id: "other", label: "その他", description: "気になる行動" },
] as const;

const COACHING_CONCERNS = [
  { id: "barking", label: "吠え" },
  { id: "nipping", label: "噛む・甘噛み" },
  { id: "toilet", label: "トイレ" },
  { id: "walk", label: "散歩・引っ張り" },
  { id: "care", label: "日々のケア" },
  { id: "relationship", label: "接し方全般" },
] as const;

function behaviorInfo(type: BehaviorType | null | undefined) {
  return BEHAVIOR_TYPES.find((item) => item.id === type) ?? BEHAVIOR_TYPES[0];
}

function coachingStatusLabel(status: CoachingStatus) {
  return {
    submitted: "受付中",
    offered: "コーチ確認中",
    assigned: "担当決定",
    consulting: "初回相談中",
    payment_pending: "お支払い待ち",
    active: "利用中",
    closed: "終了",
  }[status];
}

function coachingConcernLabel(id: string) {
  return COACHING_CONCERNS.find((item) => item.id === id)?.label ?? id;
}

function normalizeDogGender(gender: unknown): DogProfile["gender"] {
  if (gender === "male" || gender === "male_neutered" || gender === "male_intact") return "male";
  if (gender === "female" || gender === "female_spayed" || gender === "female_intact") return "female";
  return gender === "unknown" ? "unknown" : "";
}

function dogGenderLabel(gender: DogProfile["gender"]) {
  return { male: "男の子", female: "女の子", unknown: "不明・未回答", "": "未登録" }[gender];
}

function trainingExperienceLabel(experience: DogProfile["trainingExperience"]) {
  return { first_time: "初めて", once: "1回", twice: "2回", three_or_more: "3回以上", "": "未登録" }[experience];
}

function categoryInfo(category: RecordCategory | undefined): CategoryInfo {
  if (!category || category === "daily") {
    return { id: "daily", label: "まとめ", icon: "daily", description: "一日の記録", noteLabel: "気づいたこと", placeholder: "今日の様子" };
  }
  if (category === "sleep") {
    return { id: "sleep", label: "睡眠（過去の記録）", icon: "sleep", description: "眠り・休息", noteLabel: "睡眠で気づいたこと", placeholder: "過去の睡眠記録" };
  }
  return RECORD_CATEGORIES.find((item) => item.id === category) ?? RECORD_CATEGORIES[0];
}

function goalFrequency(goal: Pick<CareGoal, "targetCount" | "period">) {
  const unit = goal.period === "day" ? "毎日" : goal.period === "week" ? "週" : "月";
  return goal.period === "day" && goal.targetCount === 1 ? unit : `${unit}${goal.targetCount}回`;
}

function goalPeriodStart(period: GoalPeriod) {
  const value = new Date(`${today()}T00:00:00+09:00`);
  if (period === "week") {
    const day = value.getDay();
    value.setDate(value.getDate() - (day === 0 ? 6 : day - 1));
  } else if (period === "month") {
    value.setDate(1);
  }
  return value.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const dateKeyValue = (value: string) => new Date(`${value}T12:00:00Z`);
const dateKeyFromValue = (value: Date) => value.toISOString().slice(0, 10);
function addToDateKey(value: string, days: number) {
  const date = dateKeyValue(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromValue(date);
}
const currentTime = () =>
  new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  });

function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", weekday: "short" }).format(
    new Date(`${value}T00:00:00+09:00`),
  );
}

function formatOnlineDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function timeMinutesJst(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function ageLabel(birthDate: string) {
  if (!birthDate) return "";
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [year, month, day] = today().split("-").map(Number);
  if (!birthYear || !birthMonth || !birthDay || birthDate > today()) return "";
  let months = (year - birthYear) * 12 + month - birthMonth;
  if (day < birthDay) months -= 1;
  return `現在 ${Math.floor(months / 12)}歳${months % 12}か月`;
}

async function resizeAvatar(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を処理できませんでした");
  const crop = Math.min(bitmap.width, bitmap.height);
  context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, size, size);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画像を変換できませんでした")), "image/webp", 0.86));
}

function calculateStreak(records: DailyRecord[]) {
  const dates = new Set(records.map((record) => record.recordedOn));
  const cursor = new Date(`${today()}T00:00:00+09:00`);
  if (!dates.has(today())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(cursor.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}


function statusScore(status: Status) {
  return status === "良い" ? 100 : status === "ふつう" ? 72 : 38;
}

function recordConditionScore(record: DailyRecord) {
  const moodScore = Math.max(20, Math.min(100, record.mood * 20));
  const categoryScore =
    record.category === "meal" ? statusScore(record.appetite)
      : record.category === "walk" ? statusScore(record.activity)
        : record.category === "toilet" ? statusScore(record.toilet)
          : record.category === "sleep" ? statusScore(record.sleep)
            : record.category === "barking" && record.behaviorIntensity
              ? Math.max(25, 105 - record.behaviorIntensity * 8)
              : record.category === "win" ? 100
                : Math.round((statusScore(record.appetite) + statusScore(record.activity) + statusScore(record.toilet) + statusScore(record.sleep)) / 4);
  return Math.round((moodScore + categoryScore) / 2);
}

function Icon({ children }: { children: ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function NavGlyph({ name }: { name: "home" | "goals" | "report" | "record" | "coach" | "profile" }) {
  const paths: Record<typeof name, ReactNode> = {
    home: <path d="M3.3 11.1 12 3.8l8.7 7.3-1.7 2-1.2-1v7.2H6.2v-7.2l-1.2 1-1.7-2Zm5.7-.4v6.1h2v-3.9h2v3.9h2v-6.1L12 8.2l-3 2.5Z" />,
    goals: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path className="icon-negative" d="m7.8 10.9 2.2 2.2 5-5M8 16.2h8" /></>,
    report: <><rect x="3.5" y="12" width="4" height="8" rx="2" /><rect x="10" y="5" width="4" height="15" rx="2" /><rect x="16.5" y="8.5" width="4" height="11.5" rx="2" /></>,
    record: <><circle cx="12" cy="12" r="9" /><path className="icon-negative" d="M12 7.8v8.4M7.8 12h8.4" /></>,
    coach: <><path d="M4.2 4.5h15.6c1.2 0 2.2 1 2.2 2.2v8.1c0 1.2-1 2.2-2.2 2.2h-8.1L6 21v-4H4.2A2.2 2.2 0 0 1 2 14.8V6.7c0-1.2 1-2.2 2.2-2.2Z" /><circle className="flat-icon-detail" cx="8" cy="10.8" r="1.2" /><circle className="flat-icon-detail" cx="12" cy="10.8" r="1.2" /><circle className="flat-icon-detail" cx="16" cy="10.8" r="1.2" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4.2 20.2c.7-4.7 3.4-7.1 7.8-7.1s7.1 2.4 7.8 7.1H4.2Z" /></>,
  };
  return <svg className="flat-icon-svg" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function CareIcon({ name }: { name: CareGoalType }) {
  const paths: Record<CareGoalType, ReactNode> = {
    brush: <><rect x="4" y="3.5" width="12" height="6" rx="2" /><rect x="15" y="5" width="5" height="3" rx="1.5" /><rect x="5.5" y="8.5" width="2.5" height="12" rx="1.25" /><rect x="9" y="8.5" width="2.5" height="12" rx="1.25" /><rect x="12.5" y="8.5" width="2.5" height="12" rx="1.25" /></>,
    teeth: <path d="M8 3c-3 0-4 2.5-3 5 1 2.5 1 4.5 1.5 8 .4 2.7 2.7 5 3.5 1l.5-3c.2-1 2.8-1 3 0l.5 3c.8 4 3.1 1.7 3.5-1 .5-3.5.5-5.5 1.5-8 1-2.5 0-5-3-5-1.5 0-2.5 1-4 1s-2.5-1-4-1Z" />,
    paws: <><ellipse cx="12" cy="15.5" rx="4.7" ry="4" /><ellipse cx="6.8" cy="10" rx="2" ry="2.6" transform="rotate(-25 6.8 10)" /><ellipse cx="11" cy="7.5" rx="2" ry="2.6" /><ellipse cx="16" cy="9" rx="2" ry="2.6" transform="rotate(25 16 9)" /></>,
    bath: <><path d="M3 10.5h18v3.2a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7v-3.2Z" /><circle cx="7" cy="7" r="2.2" /><circle cx="11" cy="4.5" r="1.8" /><circle cx="15" cy="7.2" r="1.5" /></>,
    nails: <><rect x="5.5" y="3" width="5" height="17" rx="2.5" transform="rotate(9 8 11.5)" /><rect x="13.5" y="3" width="5" height="17" rx="2.5" transform="rotate(-9 16 11.5)" /></>,
    ears: <path d="M12 5.2C7.1.7 2.7 4.6 4.8 10.1c1.2 3.2 3.7 6.1 7.2 8.5 3.5-2.4 6-5.3 7.2-8.5C21.3 4.6 16.9.7 12 5.2Z" />,
    training: <><circle cx="12" cy="12" r="9" /><path className="icon-negative" d="m7.8 12 2.7 2.7 5.8-6" /></>,
    custom: <><circle cx="12" cy="12" r="9" /><path className="icon-negative" d="M12 7.5v9M7.5 12h9" /></>,
  };
  return <svg className="flat-icon-svg" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function TopicIcon({ name }: { name: RecordCategory }) {
  const paths: Record<RecordCategory, ReactNode> = {
    daily: <><rect x="3" y="4.5" width="18" height="16.5" rx="5" /><rect className="flat-icon-detail" x="7" y="9" width="10" height="2" rx="1" /><rect className="flat-icon-detail" x="7" y="13" width="7" height="2" rx="1" /></>,
    meal: <><path d="M3 10.5h18c-.5 6.2-3.5 9.2-9 9.2s-8.5-3-9-9.2Z" /><circle cx="8" cy="7" r="2" /><circle cx="13" cy="6" r="2.3" /><circle cx="17.5" cy="8" r="1.5" /></>,
    barking: <><path d="M4 9.2 2.5 5.5V14c0 4.4 3.7 7.4 8.3 7.4s8.2-3 8.2-7.4V5.5l-2 3.7c-3.6-2-9.2-2-13 0Z" /><circle className="flat-icon-detail" cx="8.2" cy="13" r="1.2" /><circle className="flat-icon-detail" cx="14.2" cy="13" r="1.2" /><path className="icon-negative" d="M9.5 17h3" /></>,
    toilet: <path d="M7.2 20h10.2a4.1 4.1 0 0 0 1-8.1c.2-3-1.7-5-4.3-5.1.1-2.5-1.5-4.2-3.9-4.2S6.3 4.4 6.4 6.8c-2.8.4-4.3 2.7-3.4 5.2a4.1 4.1 0 0 0 4.2 8Z" />,
    walk: <><ellipse cx="12" cy="15.5" rx="4.7" ry="4" /><ellipse cx="6.8" cy="10" rx="2" ry="2.6" transform="rotate(-25 6.8 10)" /><ellipse cx="11" cy="7.5" rx="2" ry="2.6" /><ellipse cx="16" cy="9" rx="2" ry="2.6" transform="rotate(25 16 9)" /></>,
    sleep: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    win: <path d="M12 21c-1.2-1-8.5-5.4-8.5-11.3 0-3.2 2.2-5.4 5.1-5.4 1.6 0 2.8.7 3.4 1.8.6-1.1 1.8-1.8 3.4-1.8 2.9 0 5.1 2.2 5.1 5.4C20.5 15.6 13.2 20 12 21Z" />,
  };

  return (
    <svg className="flat-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

type LifeScene = "park" | "home" | "cafe";

function LifeSceneIllustration({ scene }: { scene: LifeScene }) {
  if (scene === "park") {
    return (
      <svg className="life-scene-illustration" viewBox="0 0 360 104" role="img" aria-label="愛犬と公園を散歩する暮らしのイラスト">
        <circle className="scene-sun" cx="312" cy="19" r="11" />
        <path className="scene-cloud" d="M42 26h41c0-9-9-13-16-9-5-11-23-5-20 5-4 0-5 2-5 4Z" />
        <path className="scene-ground" d="M0 87c56-10 102 8 157 0s111-8 203 0v17H0Z" />
        <path className="scene-line scene-soft-line" d="M0 88c56-10 102 8 157 0s111-8 203 0" />
        <path className="scene-tree-trunk" d="M73 54h8v36h-8z" />
        <path className="scene-green" d="M77 14c-18 0-28 12-22 24-11 7-5 23 9 22 4 9 23 7 24-3 15 2 21-15 10-22 3-12-7-21-21-21Z" />
        <circle className="scene-skin" cx="185" cy="35" r="9" />
        <path className="scene-dark" d="M176 34c1-10 16-13 19-2-6-4-12-5-19 2Z" />
        <path className="scene-person" d="M177 47c5-4 13-4 18 0l8 23-31 1 5-24Z" />
        <path className="scene-line" d="m180 52-12 16m25-16 8 14m-21 5-6 17m21-17 8 17" />
        <path className="scene-line scene-leash" d="M201 65c22-3 27 7 39 11" />
        <path className="scene-dog" d="M238 69c2-9 10-14 20-12l8-8 4 13c6 3 9 8 9 14v12h-40l-1-19Z" />
        <path className="scene-line scene-dog-line" d="m249 58 3-9 8 9m10 16h11m-34 14v-9m25 9v-9" />
        <circle className="scene-eye" cx="268" cy="67" r="1.5" />
        <path className="scene-petal" d="M120 79c-7-8-18 2 0 14 18-12 7-22 0-14Z" />
      </svg>
    );
  }

  if (scene === "cafe") {
    return (
      <svg className="life-scene-illustration" viewBox="0 0 360 104" role="img" aria-label="愛犬とカフェでくつろぐ暮らしのイラスト">
        <path className="scene-cafe-wall" d="M0 0h360v104H0z" />
        <path className="scene-awning" d="M0 13h145v20c-9 9-20 9-29 0-9 9-20 9-29 0-9 9-20 9-29 0-9 9-20 9-29 0-9 9-20 9-29 0V13Z" />
        <path className="scene-line scene-soft-line" d="M191 76h111M214 76v19m66-19v19" />
        <ellipse className="scene-table" cx="247" cy="58" rx="55" ry="8" />
        <path className="scene-line" d="M247 66v29m-19 0h38" />
        <path className="scene-cup" d="M239 41h22v15h-22zM261 44h6a5 5 0 0 1 0 9h-6" />
        <path className="scene-line scene-soft-line" d="M245 36c-5-6 5-8 0-14m10 14c-5-6 5-8 0-14" />
        <circle className="scene-skin" cx="176" cy="35" r="9" />
        <path className="scene-dark" d="M167 33c2-10 16-12 19-1-6-4-12-4-19 1Z" />
        <path className="scene-person-alt" d="M166 48c6-5 16-5 21 0l12 29h-46l13-29Z" />
        <path className="scene-line" d="m169 54-14 17m29-17 12 14" />
        <path className="scene-dog" d="M78 72c2-10 12-16 25-14l8-9 5 14c8 3 12 9 12 17v11H78V72Z" />
        <path className="scene-line scene-dog-line" d="m91 60 2-11 10 9m14 19h13M88 91v-9m32 9v-9" />
        <circle className="scene-eye" cx="115" cy="69" r="1.5" />
        <path className="scene-plant" d="M326 92V54m0 17c-14-2-20-10-19-22 12 1 19 8 19 22Zm0 9c13-2 21-10 20-22-12 0-20 8-20 22Z" />
        <path className="scene-pot" d="M313 85h27l-4 12h-19l-4-12Z" />
      </svg>
    );
  }

  return (
    <svg className="life-scene-illustration" viewBox="0 0 360 104" role="img" aria-label="愛犬とおうちでケアをする暮らしのイラスト">
      <path className="scene-home-wall" d="M0 0h360v104H0z" />
      <path className="scene-window" d="M27 14h74v55H27z" />
      <path className="scene-line scene-soft-line" d="M64 14v55M27 42h74" />
      <circle className="scene-sun" cx="48" cy="29" r="8" />
      <path className="scene-sofa" d="M221 63h112v29H221zM212 53h18v39h-18zm112 0h18v39h-18z" />
      <path className="scene-line scene-sofa-line" d="M230 63V48h45v15m0 0V48h49v15" />
      <circle className="scene-skin" cx="156" cy="31" r="9" />
      <path className="scene-dark" d="M147 30c1-10 16-13 19-2-6-4-13-5-19 2Z" />
      <path className="scene-person" d="M146 43c6-4 15-4 20 1l12 31h-45l13-32Z" />
      <path className="scene-line" d="m149 50-15 16m29-16 18 14m-42 12-4 18m35-18 6 18" />
      <path className="scene-dog" d="M174 69c2-9 11-14 22-12l8-8 5 13c7 3 11 9 11 16v15h-46V69Z" />
      <path className="scene-line scene-dog-line" d="m185 59 3-10 9 8m13 18h12m-38 18v-10m29 10V82" />
      <circle className="scene-eye" cx="207" cy="68" r="1.5" />
      <path className="scene-brush" d="m178 61 16-11 3 5-16 11Z" />
      <path className="scene-plant" d="M119 96V67m0 12c-11-2-16-8-15-18 9 1 15 7 15 18Zm0 7c10-2 16-8 16-17-10 0-16 6-16 17Z" />
      <path className="scene-pot" d="M107 88h24l-4 10h-16l-4-10Z" />
    </svg>
  );
}

function LifeMoment({ scene, eyebrow, text }: { scene: LifeScene; eyebrow: string; text: string }) {
  return (
    <figure className={`life-moment life-moment-${scene}`}>
      <LifeSceneIllustration scene={scene} />
      <figcaption><small>{eyebrow}</small><span>{text}</span></figcaption>
    </figure>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
    </div>
  );
}

function StatusSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Status;
  onChange: (value: Status) => void;
}) {
  const options: Status[] = ["良い", "ふつう", "気になる"];
  return (
    <fieldset className="status-field">
      <legend>{label}</legend>
      <div className="segmented">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={value === option ? "is-selected" : ""}
            onClick={() => onChange(option)}
            aria-pressed={value === option}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { subscribeUser, permissionStatus, subscriptionStatus, isSubscribed, refreshSubscriptionStatus } = usePushNotification();
  const [pushBusy, setPushBusy] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [anonymousUser, setAnonymousUser] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("owner");
  const [staffMode, setStaffMode] = useState<"owner" | "staff">("staff");
  const [userEmail, setUserEmail] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [adminAccountsError, setAdminAccountsError] = useState("");
  const [adminAccountFilter, setAdminAccountFilter] = useState<"all" | UserRole>("all");
  const [adminNameDrafts, setAdminNameDrafts] = useState<Record<string, string>>({});
  const [adminApplications, setAdminApplications] = useState<AdminCoachingApplication[]>([]);
  const [adminApplicationsError, setAdminApplicationsError] = useState("");
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});
  const [adminTab, setAdminTab] = useState<AdminTab>("applications");
  const [lastAdminRefresh, setLastAdminRefresh] = useState<Date | null>(null);
  const [selectedAdminCustomer, setSelectedAdminCustomer] = useState<AdminCustomer | null>(null);
  const [adminDetailRecords, setAdminDetailRecords] = useState<DailyRecord[]>([]);
  const [adminDetailMessages, setAdminDetailMessages] = useState<CoachMessage[]>([]);
  const [adminDetailGoals, setAdminDetailGoals] = useState<AdminGoalProgress[]>([]);
  const [adminDetailOwnerProfile, setAdminDetailOwnerProfile] = useState<OwnerProfile | null>(null);
  const [adminDetailDogProfile, setAdminDetailDogProfile] = useState<DogProfile | null>(null);
  const [adminDetailLoading, setAdminDetailLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [view, setView] = useState<View>("home");
  const [connection, setConnection] = useState<Connection>("checking");
  const [profile, setProfile] = useState<DogProfile>(initialProfile);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile>(initialOwnerProfile);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"owner" | "dog">("owner");
  const [onboardingError, setOnboardingError] = useState("");
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [recordDate, setRecordDate] = useState(today());
  const [recordTime, setRecordTime] = useState(currentTime());
  const [recordCategory, setRecordCategory] = useState<RecordCategory | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [behaviorTypes, setBehaviorTypes] = useState<BehaviorType[]>(["barking"]);
  const [behaviorCustomText, setBehaviorCustomText] = useState("");
  const [selectedCustomBehaviors, setSelectedCustomBehaviors] = useState<string[]>([]);
  const [customBehaviorOptions, setCustomBehaviorOptions] = useState<string[]>([]);
  const [behaviorIntensity, setBehaviorIntensity] = useState(5);
  const [reportBehaviorType, setReportBehaviorType] = useState<BehaviorType>("barking");
  const [mood, setMood] = useState(3);
  const [appetite, setAppetite] = useState<Status>("ふつう");
  const [activity, setActivity] = useState<Status>("ふつう");
  const [toilet, setToilet] = useState<Status>("ふつう");
  const [sleep, setSleep] = useState<Status>("ふつう");
  const [behaviorNote, setBehaviorNote] = useState("");
  const [goodMoment, setGoodMoment] = useState("");
  const [coachingApplication, setCoachingApplication] = useState<CoachingApplication | null>(null);
  const [coachingConcerns, setCoachingConcerns] = useState<string[]>([]);
  const [coachingOutcome, setCoachingOutcome] = useState("");
  const [coachingNote, setCoachingNote] = useState("");
  const [ownerCoachTab, setOwnerCoachTab] = useState<"sessions" | "chat">("chat");
  const ownerMessageListRef = useRef<HTMLDivElement>(null);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [assignedCoachProfile, setAssignedCoachProfile] = useState<CoachProfile | null>(null);
  const [coachProfile, setCoachProfile] = useState<CoachProfile>({ displayName: "", headline: "", bio: "", credentials: "", avatarUrl: "", avatarPreset: "paw-green", meetUrl: "" });
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [onlineSessions, setOnlineSessions] = useState<OnlineSession[]>([]);
  const [slotDate, setSlotDate] = useState(today());
  const [slotTime, setSlotTime] = useState("10:00");
  const [slotDuration, setSlotDuration] = useState(60);
  const [slotCoachId, setSlotCoachId] = useState("");
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [timelineWeekAnchor, setTimelineWeekAnchor] = useState(today());
  const [googleCalendar, setGoogleCalendar] = useState<{ connected: boolean; email: string; status: string; error: string; configured: boolean; configurationError: string }>({ connected: false, email: "", status: "", error: "", configured: true, configurationError: "" });
  const [scheduleMode, setScheduleMode] = useState<"day" | "week" | "month">("week");
  const [scheduleAnchor, setScheduleAnchor] = useState(today());
  const [scheduleCoachFilter, setScheduleCoachFilter] = useState("all");
  const [scheduleOwnerFilter, setScheduleOwnerFilter] = useState("all");
  const [calendarMode, setCalendarMode] = useState<"week" | "month">("week");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(today());
  const [careGoals, setCareGoals] = useState<CareGoal[]>([]);
  const [goalCompletions, setGoalCompletions] = useState<GoalCompletion[]>([]);
  const [customGoalTitle, setCustomGoalTitle] = useState("");
  const [customGoalCount, setCustomGoalCount] = useState(1);
  const [customGoalPeriod, setCustomGoalPeriod] = useState<GoalPeriod>("week");
  const [celebration, setCelebration] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (new URLSearchParams(window.location.search).get("view") === "coach") setView("coach");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (authenticated) void refreshSubscriptionStatus();
  }, [authenticated, refreshSubscriptionStatus]);

  useEffect(() => {
    if (ownerCoachTab !== "chat") return;
    const frame = window.requestAnimationFrame(() => {
      const messageList = ownerMessageListRef.current;
      if (messageList) messageList.scrollTop = messageList.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ownerCoachTab, messages]);

  useEffect(() => {
    if (!mediaGalleryOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMediaGalleryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mediaGalleryOpen]);

  const streak = useMemo(() => calculateStreak(records), [records]);
  const todaysRecord = records.find((record) => record.recordedOn === today());
  const dogName = profile.name || "愛犬";
  const goalProgress = (goal: CareGoal) => goalCompletions.filter(
    (completion) => completion.goalId === goal.id && completion.completedOn >= goalPeriodStart(goal.period),
  ).length;
  const completedGoalCount = careGoals.filter((goal) => goalProgress(goal) >= goal.targetCount).length;
  const nextCareGoals = careGoals.filter((goal) => goalProgress(goal) < goal.targetCount);
  const recentDays = useMemo(() => {
    const base = new Date(`${today()}T00:00:00+09:00`);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() - (6 - index));
      const value = date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      return {
        value,
        label: new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(date),
        entries: records.filter((item) => item.recordedOn === value),
      };
    });
  }, [records]);
  const recentRecords = recentDays.flatMap((day) => day.entries);
  const recentConcernCount = recentRecords.filter((record) =>
    [record.appetite, record.activity, record.toilet, record.sleep].includes("気になる"),
  ).length;
  const recentGoodCount = recentRecords.filter((record) => record.goodMoment.trim()).length;
  const recentDayValues = new Set(recentDays.map((day) => day.value));
  const latestGoodMoment = records.find((record) => recentDayValues.has(record.recordedOn) && record.goodMoment.trim())?.goodMoment.trim() ?? "";
  const shortGoodMoment = latestGoodMoment.length > 34 ? `${latestGoodMoment.slice(0, 34)}…` : latestGoodMoment;
  const growthMessage = latestGoodMoment
    ? recentGoodCount > 1
      ? `「${shortGoodMoment}」など、今週は${recentGoodCount}個の「できた」が残っています。できることが増えてきたね！`
      : `「${shortGoodMoment}」ができたね！大切な一歩が残っています。`
    : "";
  const recordedConditionDays = recentDays.filter((day) => day.entries.length > 0);
  const conditionScore = recordedConditionDays.length
    ? Math.round(recordedConditionDays.reduce((total, day) => {
        const dayScore = day.entries.reduce((sum, record) => sum + recordConditionScore(record), 0) / day.entries.length;
        return total + dayScore;
      }, 0) / recordedConditionDays.length)
    : 0;
  const recentBehaviorCount = recentRecords.filter((record) => record.category === "barking").length;
  const conditionLevel = recordedConditionDays.length < 3
    ? "記録をためています"
    : conditionScore >= 78 ? "安定している様子"
      : conditionScore >= 58 ? "少し波がある様子"
        : "気になる日が多め";
  const conditionCopy = recordedConditionDays.length < 3
    ? "3日分ほど記録すると、暮らし全体の傾向が見え始めます。"
    : conditionScore >= 78
      ? "気分や生活記録は、全体として落ち着いています。"
      : conditionScore >= 58
        ? "良い日と気になる日があります。変化した日の記録を見てみましょう。"
        : "気になる記録が続いています。必要に応じてコーチや獣医師へ相談してください。";
  const monthlyCalendar = useMemo(() => {
    const base = new Date(`${today()}T00:00:00+09:00`);
    const first = new Date(base.getFullYear(), base.getMonth() + calendarMonthOffset, 1);
    const year = first.getFullYear();
    const month = first.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = first.getDay();
    return {
      label: new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(first),
      cells: Array.from({ length: 42 }, (_, index) => {
        const day = index - leading + 1;
        if (day < 1 || day > daysInMonth) return null;
        const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const entries = records.filter((record) => record.recordedOn === value);
        return { day, value, count: entries.length, categories: Array.from(new Set(entries.map((record) => record.category))) };
      }),
    };
  }, [calendarMonthOffset, records]);
  const selectedCalendarEntries = records.filter((record) => record.recordedOn === selectedCalendarDate);
  const selectedCalendarLabel = formatDate(selectedCalendarDate);
  const todaysEntries = records.filter((record) => record.recordedOn === today());
  const walkEntries = recentRecords.filter((record) => record.category === "walk");
  const walkMinutes = walkEntries.reduce((total, record) => total + (record.durationMinutes ?? 0), 0);
  const walkByPeriod = {
    morning: walkEntries.filter((record) => Number(record.recordedTime.slice(0, 2)) < 11).length,
    daytime: walkEntries.filter((record) => {
      const hour = Number(record.recordedTime.slice(0, 2));
      return hour >= 11 && hour < 17;
    }).length,
    evening: walkEntries.filter((record) => Number(record.recordedTime.slice(0, 2)) >= 17).length,
  };
  const appetiteConcernWithoutWalk = recentDays.filter((day) => {
    const hasWalk = day.entries.some((record) => record.category === "walk");
    const hasAppetiteConcern = day.entries.some(
      (record) => record.category === "meal" && record.appetite === "気になる",
    );
    return !hasWalk && hasAppetiteConcern;
  }).length;
  const diaryInsight =
    recentDays.filter((day) => day.entries.length).length < 3
      ? "あと少し記録がたまると、散歩や食事のリズムを見比べられます。"
      : appetiteConcernWithoutWalk > 0
        ? `散歩の記録がない日に、食欲の「気になる」が${appetiteConcernWithoutWalk}日ありました。関係があるか、もう少し見てみましょう。`
        : walkEntries.length > 0
          ? `この7日でお散歩は${walkEntries.length}回${walkMinutes ? `・合計${walkMinutes}分` : ""}。積み重ねが見えています。`
          : "今週のお散歩はまだ未記録です。短いお散歩も、残すと暮らしのリズムが見えてきます。";
  const todayLabel = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${today()}T00:00:00+09:00`));
  const todayPageMessage =
    todaysEntries.length === 0
      ? "まだ何も書かれていない今日。最初の足あとを残してみよう。"
      : todaysEntries.length === 1
        ? "最初の足あとが残りました。今日のページが始まっています。"
        : todaysEntries.length < 4
          ? "少しずつ、今日の輪郭が見えてきました。"
          : "今日もよく見て、よく向き合えました。大切な一ページです。";
  const reportDays = useMemo(() => {
    const base = new Date(`${today()}T00:00:00+09:00`);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(base);
      date.setDate(base.getDate() - (13 - index));
      return {
        value: date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }),
        label: new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(date),
      };
    });
  }, []);
  const selectedBehaviorRecords = records.filter(
    (record) => record.category === "barking" && record.behaviorTypes.includes(reportBehaviorType),
  );
  const previousReportDays = new Set(reportDays.slice(0, 7).map((day) => day.value));
  const currentReportDays = reportDays.slice(7);
  const currentReportDaySet = new Set(currentReportDays.map((day) => day.value));
  const previousBehaviorTotal = selectedBehaviorRecords.filter((record) => previousReportDays.has(record.recordedOn)).length;
  const currentBehaviorRecords = selectedBehaviorRecords.filter((record) => currentReportDaySet.has(record.recordedOn));
  const currentBehaviorTotal = currentBehaviorRecords.length;
  const behaviorSeries = currentReportDays.map((day) => ({
    ...day,
    count: currentBehaviorRecords.filter((record) => record.recordedOn === day.value).length,
  }));
  const maxBehaviorCount = Math.max(1, ...behaviorSeries.map((day) => day.count));
  const behaviorPeriods = {
    morning: currentBehaviorRecords.filter((record) => Number(record.recordedTime.slice(0, 2)) < 11).length,
    daytime: currentBehaviorRecords.filter((record) => {
      const hour = Number(record.recordedTime.slice(0, 2));
      return hour >= 11 && hour < 17;
    }).length,
    evening: currentBehaviorRecords.filter((record) => Number(record.recordedTime.slice(0, 2)) >= 17).length,
  };
  const behaviorTrend =
    previousBehaviorTotal === 0
      ? currentBehaviorTotal === 0 ? "まだ記録がありません" : "記録を始めました"
      : currentBehaviorTotal < previousBehaviorTotal
        ? `${previousBehaviorTotal - currentBehaviorTotal}件減少`
        : currentBehaviorTotal > previousBehaviorTotal
          ? `${currentBehaviorTotal - previousBehaviorTotal}件増加`
          : "前の7日間と同じ";

  async function loadAdminWorkspace() {
    const [customerResult, accountResult, applicationResult] = await Promise.all([
      supabase.rpc("wt_admin_customer_overview"),
      supabase.rpc("wt_admin_accounts"),
      supabase.rpc("wt_admin_coaching_applications"),
    ]);
    if (!customerResult.error && customerResult.data) {
      setAdminCustomers(customerResult.data.map((item: Record<string, unknown>) => ({
        assignmentId: String(item.assignment_id),
        ownerId: String(item.owner_id),
        ownerName: String(item.owner_name ?? ""),
        ownerNameKana: String(item.owner_name_kana ?? ""),
        ownerPhoneNumber: String(item.owner_phone_number ?? ""),
        ownerPrefecture: String(item.owner_prefecture ?? ""),
        ownerAddress: String(item.owner_address ?? ""),
        ownerBirthDate: String(item.owner_birth_date ?? ""),
        dogId: String(item.dog_id),
        dogName: String(item.dog_name ?? "名前未登録"),
        breed: String(item.breed ?? "犬種未登録"),
        records7d: Number(item.records_7d ?? 0),
        concerns7d: Number(item.concerns_7d ?? 0),
        latestMessage: String(item.latest_message ?? ""),
        latestMessageAt: item.latest_message_at ? String(item.latest_message_at) : null,
      })));
    }
    if (accountResult.error) {
      setAdminAccountsError(accountResult.error.message);
    } else if (accountResult.data) {
      setAdminAccountsError("");
      const accounts = accountResult.data.map((item: Record<string, unknown>) => ({
        userId: String(item.user_id),
        email: String(item.email ?? "メール未確認"),
        displayName: String(item.display_name ?? ""),
        role: item.role === "admin" ? "admin" : item.role === "coach" ? "coach" : "owner",
        dogId: item.dog_id ? String(item.dog_id) : null,
        dogName: String(item.dog_name ?? "愛犬未登録"),
        assignedCoachId: item.assigned_coach_id ? String(item.assigned_coach_id) : null,
        lastSignInAt: item.last_sign_in_at ? String(item.last_sign_in_at) : null,
        createdAt: String(item.created_at),
      })) as AdminAccount[];
      setAdminAccounts(accounts);
      setAdminNameDrafts((current) => Object.fromEntries(accounts.map((account) => [account.userId, current[account.userId] ?? account.displayName])));
    }
    if (applicationResult.error) {
      setAdminApplicationsError(applicationResult.error.message);
    } else if (applicationResult.data) {
      setAdminApplicationsError("");
      setAdminApplications(applicationResult.data.map((item: Record<string, unknown>) => ({
        id: String(item.application_id),
        ownerId: String(item.owner_id),
        ownerName: String(item.owner_name ?? ""),
        ownerPhoneNumber: String(item.owner_phone_number ?? ""),
        ownerPrefecture: String(item.owner_prefecture ?? ""),
        ownerAddress: String(item.owner_address ?? ""),
        ownerBirthDate: String(item.owner_birth_date ?? ""),
        dogId: String(item.dog_id),
        dogName: String(item.dog_name ?? "名前未登録"),
        ownerEmail: String(item.owner_email ?? "メール未確認"),
        status: String(item.status) as CoachingStatus,
        concernCategories: Array.isArray(item.concern_categories) ? item.concern_categories.map(String) : [],
        desiredOutcome: String(item.desired_outcome ?? ""),
        note: String(item.note ?? ""),
        assignedCoachId: item.assigned_coach_id ? String(item.assigned_coach_id) : null,
        ownerConfirmedAt: null,
        coachEmail: item.coach_email ? String(item.coach_email) : null,
        submittedAt: String(item.submitted_at),
      })));
    }
    setLastAdminRefresh(new Date());
  }

  async function loadStaffBookingWorkspace() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    if (userRole === "coach") {
      const { data } = await supabase.from("wt_coach_profiles").select("display_name,headline,bio,credentials,avatar_url,avatar_preset,meet_url").eq("coach_id", userData.user.id).maybeSingle();
      if (data) setCoachProfile({ displayName: data.display_name ?? "", headline: data.headline ?? "", bio: data.bio ?? "", credentials: data.credentials ?? "", avatarUrl: data.avatar_url ?? "", avatarPreset: data.avatar_preset ?? "paw-green", meetUrl: data.meet_url ?? "" });
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.access_token) {
        const response = await fetch("/api/google-calendar/status", { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } });
        const status = await response.json().catch(() => null);
        if (response.ok && status) setGoogleCalendar({ connected: Boolean(status.connected), email: status.connection?.google_email ?? "", status: status.connection?.sync_status ?? "", error: status.connection?.last_error ?? "", configured: status.configuration?.configured !== false, configurationError: status.configuration?.error ?? "" });
        void fetch("/api/google-calendar/sync", { method: "POST", headers: { Authorization: `Bearer ${sessionData.session.access_token}` } }).catch(() => undefined);
      }
    }
    const [{ data: slots }, { data: sessions }] = await Promise.all([
      supabase.rpc("wt_staff_availability_slots"),
      supabase.rpc("wt_staff_online_sessions"),
    ]);
    if (slots) setAvailableSlots(slots.map((slot: Record<string, unknown>) => ({
      id: String(slot.slot_id), coachId: String(slot.coach_id), coachName: String(slot.coach_name ?? "コーチ"),
      coachEmail: String(slot.coach_email ?? ""), startsAt: String(slot.starts_at), endsAt: String(slot.ends_at),
      active: Boolean(slot.active), sessionId: String(slot.session_id ?? ""),
      sessionStatus: String(slot.session_status ?? "") as AvailabilitySlot["sessionStatus"], ownerName: String(slot.owner_name ?? ""),
    })));
    if (sessions) setOnlineSessions(sessions.map((session: Record<string, unknown>) => ({ id: String(session.session_id), ownerId: String(session.owner_id ?? ""), ownerEmail: String(session.owner_email ?? ""), ownerName: String(session.owner_name ?? session.owner_email ?? "オーナー"), dogName: String(session.dog_name ?? ""), coachId: String(session.coach_id ?? ""), coachName: String(session.coach_name ?? "コーチ"), coachAvatarUrl: String(session.coach_avatar_url ?? ""), coachHeadline: String(session.coach_headline ?? ""), sessionType: session.session_type === "followup" ? "followup" : "initial", status: String(session.status) as OnlineSession["status"], startsAt: String(session.starts_at), endsAt: String(session.ends_at), meetUrl: String(session.meet_url ?? ""), calendarSyncStatus: String(session.calendar_sync_status ?? "not_connected") as OnlineSession["calendarSyncStatus"], calendarSyncError: String(session.calendar_sync_error ?? "") })));
  }

  async function loadOwnerBookingWorkspace(application: CoachingApplication) {
    if (!application.assignedCoachId) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const [{ data: profileData }, { data: sessions, error: sessionsError }] = await Promise.all([
      supabase.from("wt_coach_profiles").select("display_name,headline,bio,credentials,avatar_url,avatar_preset,meet_url").eq("coach_id", application.assignedCoachId).maybeSingle(),
      supabase.from("wt_online_sessions").select("id,coach_id,session_type,status,starts_at,ends_at,meet_url,calendar_sync_status,calendar_sync_error").eq("owner_id", userData.user.id).order("starts_at", { ascending: false }),
    ]);
    if (profileData) setAssignedCoachProfile({ displayName: profileData.display_name ?? "担当コーチ", headline: profileData.headline ?? "", bio: profileData.bio ?? "", credentials: profileData.credentials ?? "", avatarUrl: profileData.avatar_url ?? "", avatarPreset: profileData.avatar_preset ?? "paw-green", meetUrl: profileData.meet_url ?? "" });
    if (!sessionsError && sessions) {
      const coachIds = Array.from(new Set(sessions.map((session) => session.coach_id).filter(Boolean)));
      const { data: coachProfiles } = coachIds.length
        ? await supabase.from("wt_coach_profiles").select("coach_id,display_name,headline,avatar_url").in("coach_id", coachIds)
        : { data: [] };
      const profilesByCoach = new Map((coachProfiles ?? []).map((coach) => [coach.coach_id, coach]));
      setOnlineSessions(sessions.map((session) => {
        const sessionCoach = profilesByCoach.get(session.coach_id);
        return { id: session.id, ownerId: userData.user.id, ownerEmail: "", ownerName: "", dogName, coachId: session.coach_id ?? "", coachName: sessionCoach?.display_name || (session.coach_id === application.assignedCoachId ? profileData?.display_name : "") || "担当コーチ", coachAvatarUrl: sessionCoach?.avatar_url ?? "", coachHeadline: sessionCoach?.headline ?? "", sessionType: session.session_type as "initial" | "followup", status: session.status as OnlineSession["status"], startsAt: session.starts_at, endsAt: session.ends_at, meetUrl: session.meet_url ?? "", calendarSyncStatus: (session.calendar_sync_status ?? "not_connected") as OnlineSession["calendarSyncStatus"], calendarSyncError: session.calendar_sync_error ?? "" };
      }));
    }
    if (application.ownerConfirmedAt) {
      const { data: slots } = await supabase.rpc("wt_owner_available_slots", { target_application_id: application.id });
      if (slots) {
        let mapped: AvailabilitySlot[] = slots.map((slot: Record<string, unknown>) => ({ id: String(slot.slot_id), coachId: application.assignedCoachId ?? "", coachName: profileData?.display_name ?? "担当コーチ", coachEmail: "", startsAt: String(slot.starts_at), endsAt: String(slot.ends_at), active: true, sessionId: "", sessionStatus: "", ownerName: "" }));
        const { data: sessionData } = await supabase.auth.getSession();
        if (mapped.length && sessionData.session?.access_token) {
          const response = await fetch("/api/google-calendar/freebusy", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` }, body: JSON.stringify({ applicationId: application.id, timeMin: mapped[0].startsAt, timeMax: mapped[mapped.length - 1].endsAt }) });
          const result = await response.json().catch(() => null);
          if (response.ok && Array.isArray(result?.busy)) mapped = mapped.filter((slot) => !result.busy.some((range: { start: string; end: string }) => new Date(range.start) < new Date(slot.endsAt) && new Date(range.end) > new Date(slot.startsAt)));
        }
        setAvailableSlots(mapped);
      }
    }
  }

  useEffect(() => {
    const savedProfile = readLocal<Partial<DogProfile> & { gender?: unknown }>(PROFILE_KEY, {});
    const localProfile = { ...initialProfile, ...savedProfile, gender: normalizeDogGender(savedProfile.gender) };
    const localRecords: DailyRecord[] = readLocal<DailyRecord[]>(RECORDS_KEY, []).map((record): DailyRecord => ({
      ...record,
      category: record.category ?? "daily",
      recordedTime: record.recordedTime ?? "12:00",
      durationMinutes: record.durationMinutes ?? null,
      behaviorTypes: record.behaviorTypes?.length ? record.behaviorTypes : record.category === "barking" ? ["barking"] : [],
      behaviorCustomText: record.behaviorCustomText ?? "",
      behaviorCustomTexts: record.behaviorCustomTexts?.length ? record.behaviorCustomTexts : record.behaviorCustomText ? [record.behaviorCustomText] : [],
      behaviorIntensity: record.behaviorIntensity ?? null,
    }));
    const localMessages = readLocal<CoachMessage[]>(MESSAGES_KEY, []).map((message) => ({ ...message, mediaUrl: message.mediaUrl ?? "", mediaType: message.mediaType ?? "", mediaName: message.mediaName ?? "" }));
    const localCareGoals = readLocal<CareGoal[]>(CARE_GOALS_KEY, []).map((goal) => ({ ...goal, reminderTime: goal.reminderTime ?? null }));
    const localGoalCompletions = readLocal<GoalCompletion[]>(GOAL_COMPLETIONS_KEY, []);
    const savedCustomBehaviors = readLocal<string[]>(CUSTOM_BEHAVIORS_KEY, []);
    const localCustomBehaviors = localRecords
      .flatMap((record) => record.behaviorCustomTexts ?? [])
      .map((label) => label.trim())
      .filter(Boolean);
    const initialCustomBehaviors = Array.from(new Set([...savedCustomBehaviors, ...localCustomBehaviors])).slice(0, 12);
    // Local storage is the offline source of truth during the first hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(localProfile);
    setRecords(localRecords);
    setMessages(localMessages);
    setCareGoals(localCareGoals);
    setGoalCompletions(localGoalCompletions);
    setCustomBehaviorOptions(initialCustomBehaviors);
    writeLocal(CUSTOM_BEHAVIORS_KEY, initialCustomBehaviors);

    async function connect() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
          setConnection("local");
          return;
        }
        const userId = session.user.id;
        const isAnonymous = Boolean(session.user.is_anonymous);
        setAuthenticated(true);
        setAnonymousUser(isAnonymous);
        setUserEmail(session.user.email ?? "");
        setCurrentUserId(userId);

        let role: UserRole = "owner";
        if (!isAnonymous) {
          const roleResult = await supabase.from("wt_user_roles").select("role").eq("user_id", userId).maybeSingle();
          if (!roleResult.error && (roleResult.data?.role === "admin" || roleResult.data?.role === "coach")) role = roleResult.data.role;
        }
        setUserRole(role);

        if (role === "admin" || role === "coach") {
          if (role === "coach") setAdminTab("customers");
          await loadAdminWorkspace();
        }

        const [dogResult, recordResult, messageResult, onboardingResult] = await Promise.all([
          supabase.from("wt_dogs").select("id,name,breed,birthday").eq("owner_id", userId).maybeSingle(),
          supabase
            .from("wt_daily_records")
            .select("id,category,recorded_on,recorded_time,duration_minutes,behavior_type,behavior_types,behavior_custom_text,behavior_custom_texts,behavior_intensity,mood,appetite,activity,toilet,sleep,behavior_note,good_moment")
            .eq("owner_id", userId)
            .order("recorded_on", { ascending: false })
            .order("recorded_time", { ascending: false })
            .limit(100),
          supabase
            .from("wt_coach_messages")
            .select("*")
            .eq("owner_id", userId)
            .order("created_at", { ascending: true })
            .limit(50),
          supabase.rpc("wt_owner_onboarding_snapshot"),
        ]);

        if (dogResult.error || recordResult.error || messageResult.error) throw new Error("Schema unavailable");
        if (dogResult.data) {
          const remoteProfile: DogProfile = {
            id: dogResult.data.id,
            name: dogResult.data.name,
            breed: dogResult.data.breed ?? "",
            birthday: dogResult.data.birthday ?? "",
            isFirstTimeOwner: "",
            gender: "",
            trainingExperience: "",
            daycareFrequency: "",
            walkFrequency: "",
            concerns: "",
            profileCompletedAt: "",
          };
          setProfile(remoteProfile);
          writeLocal(PROFILE_KEY, remoteProfile);
        }
        if (!onboardingResult.error && onboardingResult.data && role === "owner" && !isAnonymous) {
          const snapshot = onboardingResult.data as { owner?: Record<string, unknown> | null; dog?: Record<string, unknown> | null };
          const owner = snapshot.owner;
          const dog = snapshot.dog;
          const nextOwner: OwnerProfile = {
            fullName: String(owner?.full_name ?? ""),
            fullNameKana: String(owner?.full_name_kana ?? ""),
            phoneNumber: String(owner?.phone_number ?? ""),
            prefecture: String(owner?.prefecture ?? ""),
            address: String(owner?.address ?? ""),
            birthDate: String(owner?.owner_birth_date ?? ""),
            completedAt: String(owner?.completed_at ?? ""),
          };
          setOwnerProfile(nextOwner);
          if (dog) {
            setProfile((current) => {
              const nextProfile: DogProfile = {
                ...current,
                id: String(dog.id ?? current.id ?? "") || undefined,
                birthday: String(dog.birth_date ?? current.birthday ?? ""),
                isFirstTimeOwner: dog.is_first_time_owner === true ? "yes" : dog.is_first_time_owner === false ? "no" : "",
                gender: normalizeDogGender(dog.gender),
                trainingExperience: String(dog.training_experience ?? "") as DogProfile["trainingExperience"],
                daycareFrequency: String(dog.daycare_frequency ?? ""),
                walkFrequency: String(dog.walk_frequency ?? ""),
                concerns: String(dog.concerns ?? ""),
                profileCompletedAt: String(dog.completed_at ?? ""),
              };
              writeLocal(PROFILE_KEY, nextProfile);
              return nextProfile;
            });
          }
          const needsOwner = !owner?.completed_at;
          const needsDog = !dog?.completed_at;
          setOnboardingRequired(needsOwner || needsDog);
          setOnboardingStep(needsOwner ? "owner" : "dog");
        }
        if (recordResult.data) {
          const remoteRecords: DailyRecord[] = recordResult.data.map((item): DailyRecord => ({
            id: item.id,
            category: (item.category as RecordCategory) ?? "daily",
            recordedOn: item.recorded_on,
            recordedTime: item.recorded_time?.slice(0, 5) ?? "12:00",
            durationMinutes: item.duration_minutes ?? null,
            behaviorTypes: item.behavior_types?.length
              ? (item.behavior_types as BehaviorType[])
              : item.category === "barking" ? [((item.behavior_type as BehaviorType | null) ?? "barking")] : [],
            behaviorCustomText: item.behavior_custom_text ?? "",
            behaviorCustomTexts: item.behavior_custom_texts?.length
              ? (item.behavior_custom_texts as string[])
              : item.behavior_custom_text ? [item.behavior_custom_text] : [],
            behaviorIntensity: item.behavior_intensity ?? null,
            mood: item.mood,
            appetite: item.appetite as Status,
            activity: item.activity as Status,
            toilet: item.toilet as Status,
            sleep: item.sleep as Status,
            behaviorNote: item.behavior_note ?? "",
            goodMoment: item.good_moment ?? "",
          }));
          setRecords(remoteRecords);
          writeLocal(RECORDS_KEY, remoteRecords);
          const remoteCustomBehaviors = remoteRecords
            .flatMap((record) => record.behaviorCustomTexts)
            .map((label) => label.trim())
            .filter(Boolean);
          const mergedCustomBehaviors = Array.from(new Set([...readLocal<string[]>(CUSTOM_BEHAVIORS_KEY, []), ...remoteCustomBehaviors])).slice(0, 12);
          setCustomBehaviorOptions(mergedCustomBehaviors);
          writeLocal(CUSTOM_BEHAVIORS_KEY, mergedCustomBehaviors);
        }
        if (messageResult.data) {
          const remoteMessages = messageResult.data.map((item) => mapCoachMessage(item));
          setMessages(remoteMessages);
          writeLocal(MESSAGES_KEY, remoteMessages);
        }
        const [goalResult, completionResult, coachingResult] = await Promise.all([
          supabase
            .from("wt_care_goals")
            .select("id,title,goal_type,target_count,period,reminder_time,created_at")
            .eq("owner_id", userId)
            .eq("active", true)
            .order("created_at", { ascending: true }),
          supabase
            .from("wt_care_goal_completions")
            .select("id,goal_id,completed_on,completed_at")
            .eq("owner_id", userId)
            .gte("completed_on", new Date(Date.now() - 1000 * 60 * 60 * 24 * 62).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }))
            .order("completed_at", { ascending: false }),
          supabase
            .from("wt_coaching_applications")
            .select("id,status,concern_categories,desired_outcome,note,assigned_coach_id,owner_confirmed_at,submitted_at")
            .eq("owner_id", userId)
            .order("submitted_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (!goalResult.error && goalResult.data) {
          const remoteGoals: CareGoal[] = goalResult.data.map((item) => ({
            id: item.id,
            title: item.title,
            goalType: item.goal_type as CareGoalType,
            targetCount: item.target_count,
            period: item.period as GoalPeriod,
            reminderTime: item.reminder_time?.slice(0, 5) ?? null,
            createdAt: item.created_at,
          }));
          setCareGoals(remoteGoals);
          writeLocal(CARE_GOALS_KEY, remoteGoals);
        }
        if (!completionResult.error && completionResult.data) {
          const remoteCompletions: GoalCompletion[] = completionResult.data.map((item) => ({
            id: item.id,
            goalId: item.goal_id,
            completedOn: item.completed_on,
            completedAt: item.completed_at,
          }));
          setGoalCompletions(remoteCompletions);
          writeLocal(GOAL_COMPLETIONS_KEY, remoteCompletions);
        }
        if (!coachingResult.error && coachingResult.data) {
          setCoachingApplication({
            id: coachingResult.data.id,
            status: coachingResult.data.status as CoachingStatus,
            concernCategories: coachingResult.data.concern_categories ?? [],
            desiredOutcome: coachingResult.data.desired_outcome ?? "",
            note: coachingResult.data.note ?? "",
            assignedCoachId: coachingResult.data.assigned_coach_id ?? null,
            ownerConfirmedAt: coachingResult.data.owner_confirmed_at ?? null,
            submittedAt: coachingResult.data.submitted_at,
          });
        }
        setConnection("online");
      } catch {
        setConnection("local");
      } finally {
        setAuthReady(true);
      }
    }

    void connect();
  }, []);

  useEffect(() => {
    function checkReminders() {
      const now = currentTime();
      const sent = readLocal<Record<string, string>>(REMINDER_SENT_KEY, {});
      const due = careGoals.filter((goal) =>
        goal.reminderTime && goal.reminderTime <= now && goalProgress(goal) < goal.targetCount && sent[goal.id] !== today(),
      );
      if (!due.length) return;
      const nextSent = { ...sent };
      due.forEach((goal) => {
        nextSent[goal.id] = today();
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`${dogName}の ${goal.title}`, { body: "今日のひと手間を、できたにしよう。" });
        }
      });
      writeLocal(REMINDER_SENT_KEY, nextSent);
      showNotice(`そろそろ「${due[0].title}」の時間です`);
    }
    checkReminders();
    const timer = window.setInterval(checkReminders, 60_000);
    return () => window.clearInterval(timer);
  }, [careGoals, goalCompletions, dogName]);

  useEffect(() => {
    if (!authReady || (userRole !== "admin" && userRole !== "coach")) return;
    const timer = window.setInterval(() => void loadAdminWorkspace(), 30_000);
    return () => window.clearInterval(timer);
  }, [authReady, userRole]);

  useEffect(() => {
    if (!authReady || !authenticated) return;
    const initialLoad = window.setTimeout(() => {
      if (userRole === "admin" || userRole === "coach") void loadStaffBookingWorkspace();
      if (coachingApplication?.assignedCoachId) void loadOwnerBookingWorkspace(coachingApplication);
    }, 0);
    const channel = supabase.channel(`booking-${currentUserId || "session"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wt_coach_availability_slots" }, () => {
        if (userRole === "admin" || userRole === "coach") void loadStaffBookingWorkspace();
        if (coachingApplication?.assignedCoachId) void loadOwnerBookingWorkspace(coachingApplication);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wt_online_sessions" }, () => {
        if (userRole === "admin" || userRole === "coach") void loadStaffBookingWorkspace();
        if (coachingApplication?.assignedCoachId) void loadOwnerBookingWorkspace(coachingApplication);
      }).subscribe();
    return () => { window.clearTimeout(initialLoad); void supabase.removeChannel(channel); };
  }, [authReady, authenticated, currentUserId, userRole, coachingApplication?.id, coachingApplication?.assignedCoachId, coachingApplication?.ownerConfirmedAt]);

  useEffect(() => {
    if (!authReady || userRole !== "coach") return;
    const result = new URLSearchParams(window.location.search).get("googleCalendar");
    const reason = new URLSearchParams(window.location.search).get("calendarReason");
    if (!result) return;
    const timer = window.setTimeout(() => {
      if (result === "connected") showNotice("Google Calendarと連携しました");
      else if (result === "denied") showNotice("Google Calendar連携がキャンセルされました");
      else if (reason === "state_expired") showNotice("認証の有効時間が切れました。もう一度Googleと連携してください");
      else if (reason === "configuration") showNotice("Google OAuthの環境設定を確認してください");
      else showNotice("Google Calendar連携を完了できませんでした。Google Cloudの設定を確認してください");
      setStaffMode("staff");
      setAdminTab("coachProfile");
      window.history.replaceState({}, "", window.location.pathname);
      void loadStaffBookingWorkspace();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authReady, userRole]);

  useEffect(() => {
    if (!authReady || !authenticated || anonymousUser) return;
    async function refreshCoachingStatus() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data, error } = await supabase
        .from("wt_coaching_applications")
        .select("id,status,concern_categories,desired_outcome,note,assigned_coach_id,owner_confirmed_at,submitted_at")
        .eq("owner_id", userData.user.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return;
      if (coachingApplication?.status === "offered" && data.status === "assigned") {
        showNotice("担当コーチが決まりました");
      }
      setCoachingApplication({
        id: data.id,
        status: data.status as CoachingStatus,
        concernCategories: data.concern_categories ?? [],
        desiredOutcome: data.desired_outcome ?? "",
        note: data.note ?? "",
        assignedCoachId: data.assigned_coach_id ?? null,
        ownerConfirmedAt: data.owner_confirmed_at ?? null,
        submittedAt: data.submitted_at,
      });
    }
    const timer = window.setInterval(() => void refreshCoachingStatus(), 30_000);
    return () => window.clearInterval(timer);
  }, [authReady, authenticated, anonymousUser, userRole, coachingApplication?.status]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function enablePushNotifications() {
    setPushBusy(true);
    try {
      const subscription = await subscribeUser();
      showNotice(subscription ? "新着メッセージの通知をオンにしました" : permissionStatus === "denied" ? "ブラウザまたは端末の設定から通知を許可してください" : "通知の許可が必要です");
    } catch (error) {
      showNotice(error instanceof Error ? `通知を設定できませんでした（${error.message}）` : "通知を設定できませんでした");
    } finally {
      setPushBusy(false);
    }
  }

  async function authorizedFetch(url: string, init: RequestInit = {}) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("ログイン情報を確認できません");
    return fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${data.session.access_token}` } });
  }

  function clearOwnerCache() {
    [PROFILE_KEY, RECORDS_KEY, MESSAGES_KEY, CUSTOM_BEHAVIORS_KEY, CARE_GOALS_KEY, GOAL_COMPLETIONS_KEY, REMINDER_SENT_KEY]
      .forEach((key) => window.localStorage.removeItem(key));
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setSaving(true);
    try {
      if (anonymousUser) {
        const { error } = await supabase.auth.updateUser(
          { email: authEmail.trim(), password: authPassword },
          { emailRedirectTo: window.location.origin },
        );
        if (error) throw error;
        showNotice("確認メールを送りました。メール内のリンクを開いてください");
        return;
      }
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          showNotice("確認メールを送りました。認証後、自動でログインできます");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      }
      clearOwnerCache();
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "認証に失敗しました";
      const normalized = message.toLowerCase();
      setAuthError(
        normalized.includes("email signups are disabled") || normalized.includes("signup is disabled")
          ? "メールの新規登録が無効です。SupabaseのAuthentication設定でEmailを有効にしてください。"
          : normalized.includes("database error saving new user")
            ? "ユーザー保存用のDB設定が未完了です。migration 008・009を実行してください。"
            : normalized.includes("rate limit") || normalized.includes("too many requests")
              ? "確認メールの送信上限に達しています。しばらく待ってから再度お試しください。"
              : normalized.includes("invalid login")
                ? "メールアドレスまたはパスワードが違います。"
                : normalized.includes("already registered") || normalized.includes("already been registered")
                  ? "このメールアドレスは登録済みです。「ログイン」からお進みください。"
                  : normalized.includes("password")
                    ? "パスワードは8文字以上で設定してください。"
                    : normalized.includes("invalid email")
                      ? "メールアドレスの形式を確認してください。"
                      : `登録できませんでした（${message}）`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!authEmail.trim()) {
      setAuthError("先にメールアドレスを入力してください。");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), { redirectTo: window.location.origin });
    setSaving(false);
    if (error) setAuthError("再設定メールを送れませんでした。Supabase設定を確認してください。");
    else showNotice("パスワード再設定メールを送りました");
  }

  async function signOut() {
    await supabase.auth.signOut();
    clearOwnerCache();
    window.location.reload();
  }

  async function changeAccountRole(account: AdminAccount, role: UserRole) {
    if (account.userId === currentUserId && role !== "admin") {
      showNotice("自分自身の管理者権限は解除できません");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("wt_admin_set_role", { target_user_id: account.userId, next_role: role });
    if (error) showNotice(`権限を変更できませんでした（${error.message}）`);
    else {
      showNotice(`${account.email}を${role === "admin" ? "管理者" : role === "coach" ? "コーチ" : "飼い主"}に変更しました`);
      await loadAdminWorkspace();
    }
    setSaving(false);
  }

  async function saveAccountDisplayName(account: AdminAccount) {
    const displayName = (adminNameDrafts[account.userId] ?? "").trim();
    if (!displayName) {
      showNotice("ユーザー名を入力してください");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("wt_admin_set_display_name", {
      target_user_id: account.userId,
      target_display_name: displayName,
    });
    if (error) showNotice(`ユーザー名を変更できませんでした（${error.message}）`);
    else {
      showNotice(`${displayName}として保存しました`);
      await loadAdminWorkspace();
    }
    setSaving(false);
  }

  async function assignCustomerToCoach(account: AdminAccount, coachId: string) {
    if (!account.dogId) {
      showNotice("愛犬登録後に担当へ追加できます");
      return;
    }
    setSaving(true);
    const { error } = !coachId
      ? await supabase.rpc("wt_admin_remove_assignment", { target_dog_id: account.dogId })
      : await supabase.rpc("wt_admin_assign_customer", { target_owner_id: account.userId, target_dog_id: account.dogId, target_coach_id: coachId });
    if (error) showNotice(`担当を変更できませんでした（${error.message}）`);
    else {
      const coach = adminAccounts.find((item) => item.userId === coachId);
      showNotice(coachId ? `${account.dogName}の担当を${coach?.email ?? "コーチ"}に設定しました` : `${account.dogName}の担当を解除しました`);
      await loadAdminWorkspace();
    }
    setSaving(false);
  }

  async function openAdminCustomer(customer: AdminCustomer) {
    setSelectedAdminCustomer(customer);
    setAdminDetailLoading(true);
    setAdminDetailOwnerProfile(null);
    setAdminDetailDogProfile(null);
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 29).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const [recordResult, messageResult, goalResult, completionResult, ownerProfileResult, dogProfileResult] = await Promise.all([
      supabase
        .from("wt_daily_records")
        .select("id,category,recorded_on,recorded_time,duration_minutes,behavior_type,behavior_types,behavior_custom_text,behavior_custom_texts,behavior_intensity,mood,appetite,activity,toilet,sleep,behavior_note,good_moment")
        .eq("dog_id", customer.dogId)
        .order("recorded_on", { ascending: false })
        .order("recorded_time", { ascending: false })
        .limit(100),
      supabase
        .from("wt_coach_messages")
        .select("*")
        .eq("dog_id", customer.dogId)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("wt_care_goals")
        .select("id,title,goal_type,target_count,period,reminder_time,created_at")
        .eq("dog_id", customer.dogId)
        .eq("active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("wt_care_goal_completions")
        .select("id,goal_id,completed_on,completed_at")
        .eq("dog_id", customer.dogId)
        .gte("completed_on", since),
      supabase.from("wt_owner_profiles").select("full_name,full_name_kana,phone_number,prefecture,address,owner_birth_date,onboarding_completed_at").eq("user_id", customer.ownerId).maybeSingle(),
      supabase.from("wt_dogs").select("id,name,breed,birthday,birth_date,is_first_time_owner,gender,training_experience,daycare_frequency,walk_frequency,concerns,profile_completed_at").eq("id", customer.dogId).maybeSingle(),
    ]);

    if (!ownerProfileResult.error && ownerProfileResult.data) setAdminDetailOwnerProfile({ fullName: ownerProfileResult.data.full_name ?? "", fullNameKana: ownerProfileResult.data.full_name_kana ?? "", phoneNumber: ownerProfileResult.data.phone_number ?? "", prefecture: ownerProfileResult.data.prefecture ?? "", address: ownerProfileResult.data.address ?? "", birthDate: ownerProfileResult.data.owner_birth_date ?? "", completedAt: ownerProfileResult.data.onboarding_completed_at ?? "" });
    else setAdminDetailOwnerProfile({ fullName: customer.ownerName, fullNameKana: customer.ownerNameKana, phoneNumber: customer.ownerPhoneNumber, prefecture: customer.ownerPrefecture, address: customer.ownerAddress, birthDate: customer.ownerBirthDate, completedAt: "" });
    if (!dogProfileResult.error && dogProfileResult.data) setAdminDetailDogProfile({ id: dogProfileResult.data.id, name: dogProfileResult.data.name, breed: dogProfileResult.data.breed ?? "", birthday: dogProfileResult.data.birth_date ?? dogProfileResult.data.birthday ?? "", isFirstTimeOwner: dogProfileResult.data.is_first_time_owner === true ? "yes" : dogProfileResult.data.is_first_time_owner === false ? "no" : "", gender: normalizeDogGender(dogProfileResult.data.gender), trainingExperience: (dogProfileResult.data.training_experience ?? "") as DogProfile["trainingExperience"], daycareFrequency: dogProfileResult.data.daycare_frequency ?? "", walkFrequency: dogProfileResult.data.walk_frequency ?? "", concerns: dogProfileResult.data.concerns ?? "", profileCompletedAt: dogProfileResult.data.profile_completed_at ?? "" });

    if (recordResult.error || messageResult.error || goalResult.error || completionResult.error) {
      showNotice("顧客データを読み込めませんでした。Supabaseのmigration 008を確認してください");
      setAdminDetailLoading(false);
      return;
    }

    const detailRecords: DailyRecord[] = (recordResult.data ?? []).map((item) => ({
      id: item.id,
      category: (item.category as RecordCategory) ?? "daily",
      recordedOn: item.recorded_on,
      recordedTime: item.recorded_time?.slice(0, 5) ?? "12:00",
      durationMinutes: item.duration_minutes ?? null,
      behaviorTypes: item.behavior_types?.length
        ? (item.behavior_types as BehaviorType[])
        : item.category === "barking" ? [((item.behavior_type as BehaviorType | null) ?? "barking")] : [],
      behaviorCustomText: item.behavior_custom_text ?? "",
      behaviorCustomTexts: item.behavior_custom_texts?.length
        ? (item.behavior_custom_texts as string[])
        : item.behavior_custom_text ? [item.behavior_custom_text] : [],
      behaviorIntensity: item.behavior_intensity ?? null,
      mood: item.mood,
      appetite: item.appetite as Status,
      activity: item.activity as Status,
      toilet: item.toilet as Status,
      sleep: item.sleep as Status,
      behaviorNote: item.behavior_note ?? "",
      goodMoment: item.good_moment ?? "",
    }));
    const detailMessages: CoachMessage[] = (messageResult.data ?? []).map((item) => mapCoachMessage(item));
    const completionCounts = new Map<string, number>();
    (completionResult.data ?? []).forEach((item) => completionCounts.set(item.goal_id, (completionCounts.get(item.goal_id) ?? 0) + 1));
    const detailGoals: AdminGoalProgress[] = (goalResult.data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      goalType: item.goal_type as CareGoalType,
      targetCount: item.target_count,
      period: item.period as GoalPeriod,
      reminderTime: item.reminder_time ?? null,
      createdAt: item.created_at,
      completedCount: completionCounts.get(item.id) ?? 0,
    }));
    setAdminDetailRecords(detailRecords);
    setAdminDetailMessages(detailMessages);
    setAdminDetailGoals(detailGoals);
    setAdminDetailLoading(false);
  }

  function toggleCoachingConcern(concern: string) {
    setCoachingConcerns((current) => current.includes(concern)
      ? current.filter((item) => item !== concern)
      : current.length < 3 ? [...current, concern] : current);
    if (!coachingConcerns.includes(concern) && coachingConcerns.length >= 3) showNotice("相談テーマは3つまで選べます");
  }

  async function submitCoachingApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.name) {
      showNotice("先に愛犬プロフィールを登録してください");
      setView("profile");
      return;
    }
    if (!coachingConcerns.length || !coachingOutcome.trim()) {
      showNotice("相談テーマと、目指したい状態を入力してください");
      return;
    }
    if (connection !== "online") {
      showNotice("オンライン接続後にお申し込みいただけます");
      return;
    }
    setSaving(true);
    const userId = await getUserId();
    if (!userId) {
      setSaving(false);
      return;
    }
    try {
      const dogId = await ensureRemoteDog(userId);
      const { data, error } = await supabase
        .from("wt_coaching_applications")
        .insert({
          owner_id: userId,
          dog_id: dogId,
          concern_categories: coachingConcerns,
          desired_outcome: coachingOutcome.trim(),
          note: coachingNote.trim(),
        })
        .select("id,status,concern_categories,desired_outcome,note,assigned_coach_id,owner_confirmed_at,submitted_at")
        .single();
      if (error) throw error;
      setCoachingApplication({
        id: data.id,
        status: data.status as CoachingStatus,
        concernCategories: data.concern_categories ?? [],
        desiredOutcome: data.desired_outcome,
        note: data.note ?? "",
        assignedCoachId: data.assigned_coach_id ?? null,
        ownerConfirmedAt: data.owner_confirmed_at ?? null,
        submittedAt: data.submitted_at,
      });
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.access_token) {
        void fetch("/api/coaching-notification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ applicationId: data.id }),
        }).catch(() => undefined);
      }
      showNotice("コーチング相談を受け付けました");
    } catch (error) {
      const message = error instanceof Error ? error.message : "申込みに失敗しました";
      showNotice(message.includes("wt_coaching_applications") ? "Supabaseでmigration 011を実行してください" : `申込みに失敗しました（${message}）`);
    } finally {
      setSaving(false);
    }
  }

  async function assignCoachingApplication(application: AdminCoachingApplication, coachId: string) {
    if (!coachId) return;
    setSaving(true);
    const { error } = await supabase.rpc("wt_admin_assign_coaching_application", {
      target_application_id: application.id,
      target_coach_id: coachId,
    });
    if (error) {
      setAssignmentErrors((current) => ({ ...current, [application.id]: error.message }));
      showNotice("担当を設定できませんでした。申込み欄の詳細を確認してください");
    }
    else {
      setAssignmentErrors((current) => {
        const next = { ...current };
        delete next[application.id];
        return next;
      });
      showNotice(`${application.dogName}の担当候補へ確認を依頼しました`);
      await loadAdminWorkspace();
    }
    setSaving(false);
  }

  async function updateCoachingStatus(application: AdminCoachingApplication, status: CoachingStatus) {
    setSaving(true);
    const { error } = await supabase.rpc("wt_admin_update_coaching_status", {
      target_application_id: application.id,
      next_status: status,
    });
    if (error) showNotice(`状態を変更できませんでした（${error.message}）`);
    else {
      showNotice(`${application.dogName}を「${coachingStatusLabel(status)}」に変更しました`);
      await loadAdminWorkspace();
    }
    setSaving(false);
  }

  async function acceptCoachingOffer(application: AdminCoachingApplication) {
    setSaving(true);
    const { error } = await supabase.rpc("wt_coach_accept_application", {
      target_application_id: application.id,
    });
    if (error) {
      showNotice(`担当を確定できませんでした（${error.message}）`);
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.access_token) {
        void fetch("/api/coaching-assignment-notification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({ applicationId: application.id }),
        }).catch(() => undefined);
      }
      showNotice(`${application.dogName}の担当を引き受けました`);
      await loadAdminWorkspace();
    }
    setSaving(false);
  }

  async function declineCoachingOffer(application: AdminCoachingApplication) {
    setSaving(true);
    const { error } = await supabase.rpc("wt_coach_decline_application", {
      target_application_id: application.id,
    });
    if (error) showNotice(`担当依頼を戻せませんでした（${error.message}）`);
    else {
      showNotice("担当依頼をadminへ戻しました");
      await loadAdminWorkspace();
    }
    setSaving(false);
  }

  async function confirmAssignedCoach() {
    if (!coachingApplication || !window.confirm("この担当者で決定しますか？")) return;
    setSaving(true);
    const { error } = await supabase.rpc("wt_owner_confirm_coach", { target_application_id: coachingApplication.id });
    if (error) showNotice(`担当を確定できませんでした（${error.message}）`);
    else {
      const confirmed = { ...coachingApplication, ownerConfirmedAt: new Date().toISOString() };
      setCoachingApplication(confirmed);
      showNotice("担当コーチが決定しました");
      await loadOwnerBookingWorkspace(confirmed);
    }
    setSaving(false);
  }

  async function saveCoachProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    if (coachProfile.meetUrl && !coachProfile.meetUrl.startsWith("https://meet.google.com/")) {
      showNotice("Google Meet URLを確認してください");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("wt_coach_profiles").upsert({ coach_id: userData.user.id, display_name: coachProfile.displayName.trim(), headline: coachProfile.headline.trim(), bio: coachProfile.bio.trim(), credentials: coachProfile.credentials.trim(), avatar_url: coachProfile.avatarUrl.trim() || null, avatar_preset: coachProfile.avatarPreset, meet_url: coachProfile.meetUrl.trim() || null, updated_at: new Date().toISOString() });
    showNotice(error ? `プロフィールを保存できませんでした（${error.message}）` : "コーチプロフィールを保存しました");
    setSaving(false);
  }

  async function uploadCoachAvatar(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return showNotice("JPEG・PNG・WebP画像を選んでください");
    if (file.size > 8 * 1024 * 1024) return showNotice("画像は8MB以下にしてください");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    setSaving(true);
    try {
      const blob = await resizeAvatar(file);
      const path = `${userData.user.id}/avatar.webp`;
      const { error } = await supabase.storage.from("coach-avatars").upload(path, blob, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("coach-avatars").getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error: profileError } = await supabase.from("wt_coach_profiles").upsert({ coach_id: userData.user.id, avatar_url: publicUrl, avatar_preset: coachProfile.avatarPreset, updated_at: new Date().toISOString() });
      if (profileError) throw profileError;
      setCoachProfile((current) => ({ ...current, avatarUrl: publicUrl }));
      showNotice("画像を512pxに整えてアップロードしました");
    } catch (error) {
      showNotice(`画像を保存できませんでした（${error instanceof Error ? error.message : "処理エラー"}）`);
    }
    setSaving(false);
  }

  async function connectGoogleCalendar() {
    setSaving(true);
    try {
      const response = await authorizedFetch("/api/google-calendar/connect", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error ?? "連携を開始できませんでした");
      window.location.href = result.url;
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Google Calendarへ接続できませんでした");
      setSaving(false);
    }
  }

  async function disconnectGoogleCalendar() {
    if (!window.confirm("Google Calendar連携を解除しますか？")) return;
    const response = await authorizedFetch("/api/google-calendar/status", { method: "DELETE" });
    if (response.ok) {
      setGoogleCalendar({ connected: false, email: "", status: "", error: "", configured: true, configurationError: "" });
      showNotice("Google Calendar連携を解除しました");
    } else showNotice("連携を解除できませんでした");
  }

  function resetAvailabilityEditor() {
    setEditingSlotId(null);
    setSlotDate(today());
    setSlotTime("10:00");
    setSlotDuration(60);
  }

  function availabilitySlotIsLocked(slot: AvailabilitySlot) {
    return Boolean(slot.sessionId && slot.sessionStatus !== "cancelled");
  }

  function chooseTimelineTime(day: string, event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = Math.min(23 * 60 + 30, Math.max(0, Math.round(((event.clientY - rect.top) / rect.height * 24 * 60) / 30) * 30));
    setEditingSlotId(null);
    setSlotDate(day);
    setSlotTime(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    window.setTimeout(() => document.querySelector(".slot-create-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  function editAvailabilitySlot(slot: AvailabilitySlot) {
    if (availabilitySlotIsLocked(slot)) {
      showNotice("予約済みの枠は直接変更できません。カレンダーで予約をキャンセルするか、個別変更してください");
      setScheduleAnchor(new Date(slot.startsAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
      setScheduleMode("day");
      return;
    }
    const startsAt = new Date(slot.startsAt);
    setEditingSlotId(slot.id);
    setSlotCoachId(slot.coachId);
    setSlotDate(startsAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
    setSlotTime(new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(startsAt));
    setSlotDuration(Math.round((new Date(slot.endsAt).getTime() - startsAt.getTime()) / 60_000));
  }

  async function saveAvailabilitySlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user || !slotDate || !slotTime) return;
    const targetCoachId = userRole === "admin" ? slotCoachId : userData.user.id;
    if (!targetCoachId) return showNotice("対応枠を登録するコーチを選択してください");
    const startsAt = new Date(`${slotDate}T${slotTime}:00+09:00`);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return showNotice("現在より後の日時を選んでください");
    const endsAt = new Date(startsAt.getTime() + slotDuration * 60_000);
    setSaving(true);
    const { error } = editingSlotId
      ? await supabase.rpc("wt_staff_update_availability_slot", { target_slot_id: editingSlotId, next_starts_at: startsAt.toISOString(), next_ends_at: endsAt.toISOString() })
      : await supabase.rpc("wt_staff_create_availability_slot", { target_coach_id: targetCoachId, next_starts_at: startsAt.toISOString(), next_ends_at: endsAt.toISOString() });
    if (error) showNotice(`${editingSlotId ? "空き枠を変更" : "空き枠を追加"}できませんでした（${error.message}）`);
    else {
      showNotice(editingSlotId ? "オンライン対応枠を変更しました" : "オンライン対応枠を追加しました");
      resetAvailabilityEditor();
      await loadStaffBookingWorkspace();
    }
    setSaving(false);
  }

  async function removeAvailabilitySlot(slot: AvailabilitySlot) {
    if (availabilitySlotIsLocked(slot)) {
      showNotice(`この枠は${slot.ownerName || "オーナー"}が予約済みです。先に予約をキャンセルするか、個別変更してください`);
      setScheduleAnchor(new Date(slot.startsAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }));
      setScheduleMode("day");
      return;
    }
    if (!window.confirm(`${formatOnlineDate(slot.startsAt)}の対応枠を削除しますか？`)) return;
    const { error } = await supabase.rpc("wt_staff_delete_availability_slot", { target_slot_id: slot.id });
    showNotice(error ? `削除できませんでした（${error.message}）` : "対応枠を削除しました");
    if (!error) {
      if (editingSlotId === slot.id) resetAvailabilityEditor();
      await loadStaffBookingWorkspace();
    }
  }

  async function bookOnlineSession(slot: AvailabilitySlot) {
    if (!coachingApplication) return;
    const hasInitial = onlineSessions.some((session) => session.sessionType === "initial" && session.status !== "cancelled");
    const sessionType = hasInitial ? "followup" : "initial";
    const label = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAt));
    if (!window.confirm(`${label}で${sessionType === "initial" ? "初回" : "継続"}オンライン診断を予約しますか？`)) return;
    setSaving(true);
    try {
      const response = await authorizedFetch("/api/online-sessions/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: coachingApplication.id, slotId: slot.id, sessionType }) });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        showNotice(`予約できませんでした（${result?.error ?? `サーバーエラー ${response.status}`}）`);
        return;
      }
      showNotice("オンライン診断を予約しました。Meetを準備しています");
      await loadOwnerBookingWorkspace(coachingApplication);
    } catch (error) {
      showNotice(`予約できませんでした（${error instanceof Error ? error.message : "ネットワーク接続を確認してください"}）`);
    } finally {
      setSaving(false);
    }
  }

  async function updateOnlineSessionStatus(sessionId: string, status: "completed" | "cancelled") {
    if (!window.confirm(status === "completed" ? "面談を完了にしますか？" : "この予約をキャンセルしますか？")) return;
    const { error } = await supabase.rpc("wt_staff_update_online_session", { target_session_id: sessionId, next_status: status });
    showNotice(error ? `予約を更新できませんでした（${error.message}）` : status === "completed" ? "面談を完了にしました" : "予約をキャンセルしました");
    if (!error) {
      void authorizedFetch("/api/google-calendar/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) }).catch(() => undefined);
      await loadStaffBookingWorkspace();
    }
  }

  function moveSchedule(direction: number) {
    if (scheduleMode !== "month") {
      setScheduleAnchor(addToDateKey(scheduleAnchor, direction * (scheduleMode === "week" ? 7 : 1)));
      return;
    }
    const date = dateKeyValue(scheduleAnchor);
    date.setUTCMonth(date.getUTCMonth() + direction);
    setScheduleAnchor(dateKeyFromValue(date));
  }

  function moveCalendarMonth(delta: number) {
    const nextOffset = Math.min(0, calendarMonthOffset + delta);
    const base = new Date(`${today()}T00:00:00+09:00`);
    const nextMonth = new Date(base.getFullYear(), base.getMonth() + nextOffset, 1);
    setCalendarMonthOffset(nextOffset);
    setSelectedCalendarDate(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`);
  }

  function openNewRecord(category: RecordCategory | null = null) {
    setEditingRecordId(null);
    setRecordCategory(category);
    setRecordDate(today());
    setRecordTime(currentTime());
    setDurationMinutes(20);
    setBehaviorTypes(["barking"]);
    setBehaviorCustomText("");
    setSelectedCustomBehaviors([]);
    setBehaviorIntensity(5);
    setMood(3);
    setAppetite("ふつう");
    setActivity("ふつう");
    setToilet("ふつう");
    setSleep("ふつう");
    setBehaviorNote("");
    setGoodMoment("");
    setView("record");
  }

  const behaviorSelectionCount = behaviorTypes.filter((type) => type !== "other").length + selectedCustomBehaviors.length;

  function toggleBehaviorType(type: BehaviorType) {
    if (type === "other") return;
    setBehaviorTypes((current) => {
      const fixed = current.filter((item) => item !== "other");
      if (fixed.includes(type)) return fixed.filter((item) => item !== type);
      if (fixed.length + selectedCustomBehaviors.length >= 3) {
        showNotice("困りごとは最大3つまで選べます");
        return fixed;
      }
      return [...fixed, type];
    });
  }

  function selectCustomBehavior(label: string) {
    if (selectedCustomBehaviors.includes(label)) {
      setSelectedCustomBehaviors((current) => current.filter((item) => item !== label));
      return;
    }
    if (behaviorTypes.filter((type) => type !== "other").length + selectedCustomBehaviors.length >= 3) {
      showNotice("困りごとは最大3つまで選べます");
      return;
    }
    setSelectedCustomBehaviors((current) => [...current, label]);
  }

  function addCustomBehavior() {
    const label = behaviorCustomText.trim();
    if (!label) return;
    if (!selectedCustomBehaviors.includes(label) && behaviorSelectionCount >= 3) {
      showNotice("困りごとは最大3つまで選べます");
      return;
    }
    const nextOptions = Array.from(new Set([label, ...customBehaviorOptions])).slice(0, 12);
    setCustomBehaviorOptions(nextOptions);
    writeLocal(CUSTOM_BEHAVIORS_KEY, nextOptions);
    setSelectedCustomBehaviors((current) => current.includes(label) ? current : [...current, label]);
    setBehaviorCustomText("");
  }

  async function getUserId() {
    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("[Auth] getSession failed", error);
    if (data.session?.user.id) return data.session.user.id;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) console.error("[Auth] getUser failed", userError);
    return userData.user?.id ?? null;
  }

  async function ensureRemoteDog(userId: string, nextProfile = profile) {
    if (nextProfile.id) return nextProfile.id;
    const { data, error } = await supabase
      .from("wt_dogs")
      .upsert(
        {
          owner_id: userId,
          name: nextProfile.name || "愛犬",
          breed: nextProfile.breed || null,
          birthday: nextProfile.birthday || null,
        },
        { onConflict: "owner_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    setProfile((current) => ({ ...current, id: data.id }));
    return data.id as string;
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    writeLocal(PROFILE_KEY, profile);
    try {
      if (connection === "online") {
        const userId = await getUserId();
        if (!userId) throw new Error("No session");
        const [{ data, error }, { error: ownerError }] = await Promise.all([
          supabase.from("wt_dogs").upsert({ owner_id: userId, name: profile.name, breed: profile.breed || null, birthday: profile.birthday || null, birth_date: profile.birthday || null, is_first_time_owner: profile.isFirstTimeOwner === "yes" ? true : profile.isFirstTimeOwner === "no" ? false : null, gender: profile.gender || null, training_experience: profile.trainingExperience, daycare_frequency: profile.daycareFrequency, walk_frequency: profile.walkFrequency, concerns: profile.concerns, profile_completed_at: profile.profileCompletedAt || new Date().toISOString() }, { onConflict: "owner_id" }).select("id").single(),
          supabase.from("wt_owner_profiles").upsert({ user_id: userId, full_name: ownerProfile.fullName.trim(), full_name_kana: ownerProfile.fullNameKana.trim(), phone_number: ownerProfile.phoneNumber.trim(), prefecture: ownerProfile.prefecture, address: ownerProfile.address.trim(), owner_birth_date: ownerProfile.birthDate || null, onboarding_completed_at: ownerProfile.completedAt || new Date().toISOString(), updated_at: new Date().toISOString() }),
        ]);
        if (error || ownerError) throw error ?? ownerError;
        setProfile((current) => ({ ...current, id: data.id }));
        showNotice("プロフィールを保存しました");
      } else {
        showNotice("この端末にプロフィールを保存しました");
      }
      setView("home");
    } catch {
      setConnection("local");
      showNotice("この端末にプロフィールを保存しました");
    } finally {
      setSaving(false);
    }
  }

  async function saveOwnerOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOnboardingError("");
    const normalized = {
      fullName: ownerProfile.fullName.trim(),
      fullNameKana: ownerProfile.fullNameKana.trim(),
      phoneNumber: ownerProfile.phoneNumber.trim(),
      birthDate: ownerProfile.birthDate,
      prefecture: ownerProfile.prefecture,
      address: ownerProfile.address.trim(),
    };
    const missingLabel = [
      [normalized.fullName, "お名前"],
      [normalized.fullNameKana, "フリガナ"],
      [normalized.phoneNumber, "電話番号"],
      [normalized.birthDate, "生年月日"],
      [normalized.prefecture, "都道府県"],
      [normalized.address, "住所"],
    ].find(([value]) => !value)?.[1];
    if (missingLabel) {
      const message = `${missingLabel}を入力してください。`;
      setOnboardingError(message);
      showNotice(message);
      return;
    }
    const phoneDigits = normalized.phoneNumber.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      const message = "電話番号を10〜11桁で入力してください。";
      setOnboardingError(message);
      showNotice(message);
      return;
    }
    if (normalized.birthDate > today()) {
      const message = "生年月日は今日以前の日付を選択してください。";
      setOnboardingError(message);
      showNotice(message);
      return;
    }

    setSaving(true);
    let userId: string | null = null;
    try {
      userId = await getUserId();
      if (!userId) throw new Error("ログイン情報を確認できませんでした。再度ログインしてください。");
      const completedAt = new Date().toISOString();
      const { error } = await supabase.from("wt_owner_profiles").upsert({ user_id: userId, full_name: normalized.fullName, full_name_kana: normalized.fullNameKana, phone_number: normalized.phoneNumber, prefecture: normalized.prefecture, address: normalized.address, owner_birth_date: normalized.birthDate, onboarding_completed_at: completedAt, updated_at: completedAt });
      if (error) throw error;
      setOwnerProfile((current) => ({ ...current, completedAt }));
      setOnboardingStep("dog");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      const message = `飼い主情報を保存できませんでした（${detail}）`;
      console.error("[Onboarding] owner profile submission failed", {
        userId,
        inputSummary: {
          fullNameLength: normalized.fullName.length,
          fullNameKanaLength: normalized.fullNameKana.length,
          phoneDigits: phoneDigits.length,
          birthDateProvided: Boolean(normalized.birthDate),
          prefectureSelected: Boolean(normalized.prefecture),
          addressLength: normalized.address.length,
        },
        error,
      });
      setOnboardingError(message);
      showNotice(message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDogOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOnboardingError("");
    const missingLabel = [
      [profile.name.trim(), "愛犬の名前"],
      [profile.breed.trim(), "犬種"],
      [profile.birthday, "誕生日"],
      [profile.isFirstTimeOwner, "飼育経験"],
      [profile.gender, "性別"],
      [profile.trainingExperience, "トレーニング経験"],
      [profile.daycareFrequency, "保育園の頻度"],
      [profile.walkFrequency, "散歩の頻度"],
      [profile.concerns.trim(), "気になっていること"],
    ].find(([value]) => !value)?.[1];
    if (missingLabel) {
      const message = `${missingLabel}を入力してください。`;
      setOnboardingError(message);
      showNotice(message);
      return;
    }
    setSaving(true);
    let userId: string | null = null;
    try {
      userId = await getUserId();
      if (!userId) throw new Error("ログイン情報を確認できませんでした。再度ログインしてください。");
      const completedAt = new Date().toISOString();
      const { data, error } = await supabase.from("wt_dogs").upsert({ owner_id: userId, name: profile.name.trim(), breed: profile.breed.trim() || null, birthday: profile.birthday || null, birth_date: profile.birthday || null, is_first_time_owner: profile.isFirstTimeOwner === "yes", gender: profile.gender, training_experience: profile.trainingExperience, daycare_frequency: profile.daycareFrequency, walk_frequency: profile.walkFrequency, concerns: profile.concerns.trim(), profile_completed_at: completedAt, updated_at: completedAt }, { onConflict: "owner_id" }).select("id").single();
      if (error) throw error;
      const next = { ...profile, id: data.id, profileCompletedAt: completedAt };
      setProfile(next);
      writeLocal(PROFILE_KEY, next);
      setOnboardingRequired(false);
      setView("home");
      router.replace("/");
      showNotice("登録が完了しました。今日から一緒に記録を始めましょう");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なエラー";
      const message = `愛犬情報を保存できませんでした（${detail}）`;
      console.error("[Onboarding] dog profile submission failed", {
        userId,
        inputSummary: {
          nameLength: profile.name.trim().length,
          breedLength: profile.breed.trim().length,
          birthdayProvided: Boolean(profile.birthday),
          daycareFrequencySelected: Boolean(profile.daycareFrequency),
          walkFrequencySelected: Boolean(profile.walkFrequency),
          concernsLength: profile.concerns.trim().length,
        },
        error,
      });
      setOnboardingError(message);
      showNotice(message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!authReady || !authenticated || anonymousUser) return;
    if (userRole === "owner" && onboardingRequired && pathname !== "/onboarding") router.replace("/onboarding");
    if ((!onboardingRequired || userRole !== "owner") && pathname === "/onboarding") router.replace("/");
  }, [authReady, authenticated, anonymousUser, onboardingRequired, pathname, router, userRole]);

  useEffect(() => {
    if (!authenticated || !currentUserId) return;
    const channel = supabase
      .channel(`owner-chat-${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wt_coach_messages", filter: `owner_id=eq.${currentUserId}` }, (payload) => {
        const message = mapCoachMessage(payload.new);
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current;
          const next = [...current, message];
          writeLocal(MESSAGES_KEY, next);
          return next;
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [authenticated, currentUserId]);

  useEffect(() => {
    if (!selectedAdminCustomer?.dogId || (userRole !== "admin" && userRole !== "coach")) return;
    const dogId = selectedAdminCustomer.dogId;
    const channel = supabase
      .channel(`staff-chat-${dogId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wt_coach_messages", filter: `dog_id=eq.${dogId}` }, (payload) => {
        const message = mapCoachMessage(payload.new);
        setAdminDetailMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedAdminCustomer?.dogId, userRole]);

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const nextRecord: DailyRecord = {
      id: editingRecordId ?? crypto.randomUUID(),
      category: recordCategory ?? "daily",
      recordedOn: recordDate,
      recordedTime: recordTime,
      durationMinutes: recordCategory === "walk" ? durationMinutes : null,
      behaviorTypes: recordCategory === "barking"
        ? [...behaviorTypes.filter((type) => type !== "other"), ...(selectedCustomBehaviors.length ? ["other" as BehaviorType] : [])]
        : [],
      behaviorCustomText: recordCategory === "barking" ? selectedCustomBehaviors[0] ?? "" : "",
      behaviorCustomTexts: recordCategory === "barking" ? selectedCustomBehaviors : [],
      behaviorIntensity: recordCategory === "barking" ? behaviorIntensity : null,
      mood,
      appetite,
      activity,
      toilet,
      sleep,
      behaviorNote,
      goodMoment,
    };
    let nextRecords = [nextRecord, ...records.filter((item) => item.id !== nextRecord.id)].sort((a, b) =>
      `${b.recordedOn}T${b.recordedTime}`.localeCompare(`${a.recordedOn}T${a.recordedTime}`),
    );
    if (nextRecord.behaviorCustomTexts.length) {
      const nextCustomBehaviors = Array.from(new Set([...nextRecord.behaviorCustomTexts, ...customBehaviorOptions])).slice(0, 12);
      setCustomBehaviorOptions(nextCustomBehaviors);
      writeLocal(CUSTOM_BEHAVIORS_KEY, nextCustomBehaviors);
    }

    try {
      if (connection === "online") {
        const userId = await getUserId();
        if (!userId) throw new Error("No session");
        const dogId = await ensureRemoteDog(userId);
        const { data, error } = await supabase
          .from("wt_daily_records")
          .upsert(
            {
              id: nextRecord.id,
              owner_id: userId,
              dog_id: dogId,
              category: recordCategory ?? "daily",
              recorded_on: recordDate,
              recorded_time: recordTime,
              duration_minutes: recordCategory === "walk" ? durationMinutes : null,
              behavior_type: recordCategory === "barking" ? nextRecord.behaviorTypes[0] ?? "other" : null,
              behavior_types: recordCategory === "barking" ? nextRecord.behaviorTypes : null,
              behavior_custom_text: recordCategory === "barking" ? nextRecord.behaviorCustomText || null : null,
              behavior_custom_texts: recordCategory === "barking" && nextRecord.behaviorCustomTexts.length ? nextRecord.behaviorCustomTexts : null,
              behavior_intensity: recordCategory === "barking" ? behaviorIntensity : null,
              mood,
              appetite,
              activity,
              toilet,
              sleep,
              behavior_note: behaviorNote || null,
              good_moment: goodMoment || null,
            },
            { onConflict: "id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        nextRecords = nextRecords.map((item) => (item.id === nextRecord.id ? { ...item, id: data.id } : item));
        showNotice(`${categoryInfo(recordCategory ?? "daily").label}の足あとを残しました`);
      } else {
        showNotice(`${categoryInfo(recordCategory ?? "daily").label}の足あとを端末に残しました`);
      }
    } catch {
      setConnection("local");
      showNotice("接続できなかったため、この端末に保存しました");
    } finally {
      setRecords(nextRecords);
      writeLocal(RECORDS_KEY, nextRecords);
      setSaving(false);
      setRecordCategory(null);
      setEditingRecordId(null);
      setView("home");
    }
  }

  function addOwnerMessage(message: SentChatMessage | CoachMessage) {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current;
      const next = [...current, message];
      writeLocal(MESSAGES_KEY, next);
      return next;
    });
  }

  function addAdminMessage(message: SentChatMessage | CoachMessage) {
    setAdminDetailMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }

  async function addCareGoal(template: Omit<CareGoal, "id" | "createdAt">) {
    if (careGoals.some((goal) => goal.title === template.title)) {
      showNotice("この習慣はすでに追加されています");
      return;
    }
    const nextGoal: CareGoal = { ...template, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const nextGoals = [...careGoals, nextGoal];
    setCareGoals(nextGoals);
    writeLocal(CARE_GOALS_KEY, nextGoals);
    showNotice(`「${nextGoal.title}」を習慣に追加しました`);
    if (connection !== "online") return;
    try {
      const userId = await getUserId();
      if (!userId) return;
      const dogId = await ensureRemoteDog(userId);
      const { error } = await supabase.from("wt_care_goals").insert({
        id: nextGoal.id,
        owner_id: userId,
        dog_id: dogId,
        title: nextGoal.title,
        goal_type: nextGoal.goalType,
        target_count: nextGoal.targetCount,
        period: nextGoal.period,
        reminder_time: nextGoal.reminderTime,
      });
      if (error) throw error;
    } catch {
      showNotice("端末に保存しました。DB設定後にオンライン同期できます");
    }
  }

  async function completeCareGoal(goal: CareGoal) {
    if (goalProgress(goal) >= goal.targetCount) {
      showNotice("今の期間の目標は達成済みです");
      return;
    }
    const completion: GoalCompletion = {
      id: crypto.randomUUID(),
      goalId: goal.id,
      completedOn: today(),
      completedAt: new Date().toISOString(),
    };
    const nextCompletions = [completion, ...goalCompletions];
    setGoalCompletions(nextCompletions);
    writeLocal(GOAL_COMPLETIONS_KEY, nextCompletions);
    const willComplete = goalProgress(goal) + 1 >= goal.targetCount;
    showNotice(willComplete ? `「${goal.title}」目標達成！` : `「${goal.title}」を1回できました`);
    if (willComplete) {
      setCelebration({
        title: `${goal.title}、達成！`,
        message: `今日のひと手間が、${dogName}とのいい毎日につながっています。`,
      });
    }
    if (connection !== "online") return;
    try {
      const userId = await getUserId();
      if (!userId) return;
      const dogId = await ensureRemoteDog(userId);
      const { error } = await supabase.from("wt_care_goal_completions").insert({
        id: completion.id,
        goal_id: goal.id,
        owner_id: userId,
        dog_id: dogId,
        completed_on: completion.completedOn,
        completed_at: completion.completedAt,
      });
      if (error) throw error;
    } catch {
      showNotice("実行記録はこの端末に保存しました");
    }
  }

  async function removeCareGoal(goal: CareGoal) {
    const nextGoals = careGoals.filter((item) => item.id !== goal.id);
    setCareGoals(nextGoals);
    writeLocal(CARE_GOALS_KEY, nextGoals);
    if (connection === "online") {
      await supabase.from("wt_care_goals").update({ active: false }).eq("id", goal.id);
    }
    showNotice(`「${goal.title}」を習慣から外しました`);
  }

  async function updateGoalReminder(goal: CareGoal, reminderTime: string | null) {
    const nextGoals = careGoals.map((item) => item.id === goal.id ? { ...item, reminderTime } : item);
    setCareGoals(nextGoals);
    writeLocal(CARE_GOALS_KEY, nextGoals);
    if (reminderTime && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (connection === "online") {
      const { error } = await supabase.from("wt_care_goals").update({ reminder_time: reminderTime }).eq("id", goal.id);
      if (error) showNotice("お知らせ時間はこの端末に保存しました");
    }
  }

  function addCustomCareGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = customGoalTitle.trim();
    if (!title) return;
    void addCareGoal({ title, goalType: "custom", targetCount: Math.max(1, Math.min(31, customGoalCount)), period: customGoalPeriod, reminderTime: null });
    setCustomGoalTitle("");
    setCustomGoalCount(1);
  }

  const homeView = (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">TODAY WITH {dogName.toUpperCase()}</p><p className="today-date">{todayLabel}</p>
          <h1>{profile.name ? `${profile.name}ちゃん、今日も一緒に。` : "今日から、少しずつ。"}</h1>
          <p className="welcome-copy">やろうと思っていたケアを、今日ひとつ。</p>
        </div>
        <button className="avatar" onClick={() => setView("profile")} aria-label="愛犬プロフィールを開く">
          {profile.name ? profile.name.slice(0, 1) : "＋"}
        </button>
      </section>

      {!profile.name && (
        <button className="profile-nudge" onClick={() => setView("profile")}>
          <span className="profile-nudge-mark">01</span>
          <span><strong>まずは、愛犬の名前を教えてください</strong><small>記録とコーチの助言が、その子の物語になります。</small></span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      <section className="care-today care-goals-card" aria-labelledby="care-today-title">
        <div className="care-today-head">
          <div><p className="card-label">TODAY’S CARE</p><h2 id="care-today-title">今日やること</h2></div>
          {careGoals.length > 0 && <span><b>{completedGoalCount}</b> / {careGoals.length} 達成</span>}
        </div>
        {careGoals.length === 0 ? (
          <button className="care-empty" onClick={() => setView("goals")}>
            <span className="care-empty-icon"><CareIcon name="paws" /></span>
            <span><strong>うちの子の習慣を決める</strong><small>歯磨き、ブラッシングなどから無理なく始められます。</small></span>
            <b aria-hidden="true">→</b>
          </button>
        ) : (
          <div className="care-today-list">
            {careGoals.slice(0, 4).map((goal) => {
              const progress = goalProgress(goal);
              const done = progress >= goal.targetCount;
              return (
                <div className={`care-today-item ${done ? "is-done" : ""}`} key={goal.id}>
                  <span className={`care-icon care-${goal.goalType}`}><CareIcon name={goal.goalType} /></span>
                  <span><strong>{goal.title}</strong><small>{goalFrequency(goal)} · {Math.min(progress, goal.targetCount)}/{goal.targetCount}</small></span>
                  <button onClick={() => void completeCareGoal(goal)} disabled={done} aria-label={`${goal.title}をできたにする`}>{done ? "✓" : "できた"}</button>
                </div>
              );
            })}
            <button className="care-manage" onClick={() => setView("goals")}>{nextCareGoals.length ? `あと${nextCareGoals.length}個の習慣を見る` : "達成状況を見る"} →</button>
          </div>
        )}
      </section>

      <section className="today-rhythm" aria-labelledby="today-rhythm-title">
        <div className="today-rhythm-heading">
          <div><p className="card-label">TODAY’S RHYTHM</p><h2 id="today-rhythm-title">今日のリズム</h2></div>
          <div className={`daily-stamp ${todaysEntries.length ? "has-records" : ""}`}><strong>{todaysEntries.length}</strong><small>PAWS</small></div>
        </div>
        <div className="today-topic-grid">
          {RECORD_CATEGORIES.map((category) => {
            const count = todaysEntries.filter((record) => record.category === category.id).length;
            return (
              <button key={category.id} className={`category-${category.id} ${count ? "is-recorded" : "is-unrecorded"}`} onClick={() => openNewRecord(category.id)} aria-label={`${category.label}を追加。今日${count}件`}>
                <span className="topic-mark"><TopicIcon name={category.icon} /></span>
                {count > 0 && <b>{count}</b>}
                <small>{category.label}</small>
                <em>{count ? `${count}回 記録済み` : "未記録"}</em>
              </button>
            );
          })}
        </div>
        <p className="today-page-message">{todayPageMessage}</p>
        <button className="primary-button today-add-button" onClick={() => openNewRecord()}>記録を追加する<NavGlyph name="record" /></button>
      </section>

      {growthMessage && (
        <section className="growth-card" aria-labelledby="growth-title">
          <div className="growth-spark" aria-hidden="true">✦</div>
          <div>
            <p className="card-label">GROWING TOGETHER</p>
            <h2 id="growth-title">できること、増えてきたね。</h2>
            <p>{growthMessage}</p>
            <button className="text-button" onClick={() => openNewRecord("win")}>もうひとつ「できた」を残す →</button>
          </div>
        </section>
      )}

      <section className="overview-stats" aria-label="記録の概要">
        <div><span>連続記録</span><strong>{streak}<small>日</small></strong></div>
        <div><span>この7日</span><strong>{recentDays.filter((day) => day.entries.length).length}<small>日</small></strong></div>
        <div><span>できた</span><strong>{recentGoodCount}<small>件</small></strong></div>
      </section>

      <section className={`condition-card condition-${recordedConditionDays.length < 3 ? "collecting" : conditionScore >= 78 ? "good" : conditionScore >= 58 ? "middle" : "watch"}`} aria-labelledby="condition-title">
        <div className="condition-ring" style={{ background: `conic-gradient(var(--green) ${conditionScore * 3.6}deg, #e4ebe7 0deg)` }}>
          <span><strong>{recordedConditionDays.length ? conditionScore : "–"}</strong><small>{recordedConditionDays.length ? "/100" : "集計中"}</small></span>
        </div>
        <div className="condition-content">
          <p className="card-label">LIFE CONDITION</p>
          <h2 id="condition-title">{dogName}の今は、<b>{conditionLevel}</b></h2>
          <p>{conditionCopy}</p>
          <div className="condition-facts">
            <span>記録日 <b>{recordedConditionDays.length}</b></span>
            <span>気になる状態 <b>{recentConcernCount}</b></span>
            <span>困りごと <b>{recentBehaviorCount}</b></span>
          </div>
          <button className="text-button" onClick={() => setView("report")}>詳しい変化を見る →</button>
          <small className="condition-note">日々の記録から見た目安で、診断ではありません。</small>
        </div>
      </section>

      <section className={`coaching-bridge ${coachingApplication ? `status-${coachingApplication.status}` : "status-new"}`}>
        <div className="coaching-bridge-mark"><NavGlyph name="coach" /></div>
        <div className="coaching-bridge-copy">
          <p className="card-label">WITH A PROFESSIONAL</p>
          <h2>{coachingApplication
            ? coachingApplication.status === "submitted" ? "コーチング相談を確認しています"
              : coachingApplication.status === "offered" ? "担当候補のコーチが確認しています"
              : coachingApplication.status === "assigned" ? "担当コーチが決まりました"
                : coachingApplication.status === "payment_pending" ? "一緒に進める準備ができました"
                  : coachingApplication.status === "active" ? "記録を、コーチと変化につなげる"
                    : "コーチと相談を続ける"
            : recentConcernCount > 0 ? `「気になる」が${recentConcernCount}件。記録を答えにつなげませんか。`
              : recentBehaviorCount > 0 ? "困りごとの記録を、次の一歩へ。"
                : "記録するだけで、終わらせない。"}</h2>
          <p>{coachingApplication
            ? coachingApplication.status === "submitted" ? "内容を確認後、あなたと愛犬に合うコーチをご案内します。"
              : coachingApplication.status === "offered" ? "相談内容と記録を確認中です。引き受けが確定すると、この画面とメールでお知らせします。"
              : "日々の記録を共有できるので、毎回ゼロから説明せずに相談できます。"
            : "記録で見えるのは「何が起きたか」。コーチと一緒なら、その理由と次に試すことまで整理できます。"}</p>
          <button onClick={() => setView("coach")}>{coachingApplication ? "コーチルームを確認する" : "コーチングについて相談する"}<span>→</span></button>
        </div>
      </section>

      <section className="rhythm-card compact-week" aria-labelledby="rhythm-title">
        <div className="calendar-head">
          <div><p className="card-label">{calendarMode === "week" ? "THIS WEEK" : "MONTHLY LOG"}</p><h2 id="rhythm-title">記録カレンダー</h2></div>
          <div className="calendar-switch" aria-label="カレンダー表示">
            <button className={calendarMode === "week" ? "is-selected" : ""} onClick={() => { setCalendarMode("week"); setSelectedCalendarDate(today()); }}>週</button>
            <button className={calendarMode === "month" ? "is-selected" : ""} onClick={() => setCalendarMode("month")}>月</button>
          </div>
        </div>
        {calendarMode === "week" ? (
          <>
            <div className="week-dots">
              {recentDays.map((day) => (
                <button key={day.value} className={`week-day ${day.entries.length ? "is-recorded" : ""} ${day.value === today() ? "is-today" : ""} ${day.value === selectedCalendarDate ? "is-selected" : ""}`} onClick={() => setSelectedCalendarDate(day.value)}>
                  <span>{day.label}</span>
                  <i aria-label={day.entries.length ? `${day.value} ${day.entries.length}件記録済み` : `${day.value} 未記録`}>{day.entries.length ? day.entries.length : "–"}</i>
                  <span className="week-category-dots">{Array.from(new Set(day.entries.map((record) => record.category))).slice(0, 3).map((category) => <b className={`category-dot category-${category}`} key={category}></b>)}</span>
                </button>
              ))}
            </div>
            <div className="weekly-insight">
              <p>{recentRecords.length === 0 ? "まずは今日だけ。1分の記録から始めましょう。" : recentConcernCount > 0 ? `気になる記録が${recentConcernCount}件あります。コーチに共有しておくと安心です。` : recentGoodCount > 0 ? `「できた」が${recentGoodCount}件たまりました。小さな変化が見えています。` : "記録が少しずつつながっています。短いメモでも十分です。"}</p>
              <button onClick={() => recentConcernCount > 0 ? setView("coach") : openNewRecord()}>{recentConcernCount > 0 ? "コーチに相談する" : "今日を記録する"} →</button>
            </div>
          </>
        ) : (
          <div className="month-view">
            <div className="month-navigation">
              <button onClick={() => moveCalendarMonth(-1)} aria-label="前の月">‹</button>
              <strong>{monthlyCalendar.label}</strong>
              <button onClick={() => moveCalendarMonth(1)} disabled={calendarMonthOffset === 0} aria-label="次の月">›</button>
            </div>
            <div className="month-weekdays">{["日","月","火","水","木","金","土"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="month-grid">
              {monthlyCalendar.cells.map((cell, index) => cell ? (
                <button key={cell.value} className={`month-cell ${cell.count ? "is-recorded" : ""} ${cell.value === today() ? "is-today" : ""} ${cell.value === selectedCalendarDate ? "is-selected" : ""}`} aria-label={`${cell.value} ${cell.count}件`} onClick={() => setSelectedCalendarDate(cell.value)}>
                  <span>{cell.day}</span>
                  <span className="month-category-dots">{cell.categories.slice(0, 3).map((category) => <i className={`category-dot category-${category}`} key={category}></i>)}</span>
                  {cell.count > 0 && <b>{cell.count}</b>}
                </button>
              ) : <span className="month-cell is-empty" key={`empty-${index}`}></span>)}
            </div>
            <p className="month-legend">色の点は記録したテーマです</p>
          </div>
        )}
        <div className="calendar-day-detail">
          <div className="calendar-detail-head"><div><span>SELECTED DAY</span><strong>{selectedCalendarLabel}</strong></div><b>{selectedCalendarEntries.length}件</b></div>
          <div className="calendar-category-status">
            {RECORD_CATEGORIES.map((category) => {
              const count = selectedCalendarEntries.filter((record) => record.category === category.id).length;
              return <button key={category.id} className={`category-${category.id} ${count ? "is-done" : "is-missing"}`} onClick={() => { openNewRecord(category.id); setRecordDate(selectedCalendarDate); }}><TopicIcon name={category.icon} /><span>{category.label}<small>{count ? `${count}回 記録済み` : "未記録"}</small></span><b>{count ? "✓" : "＋"}</b></button>;
            })}
          </div>
        </div>
      </section>

      <section className="observation-card" aria-labelledby="observation-title">
        <div className="observation-mark">↗</div>
        <div>
          <p className="card-label">A SMALL DISCOVERY</p>
          <h2 id="observation-title">気づきの種</h2>
          <p>{diaryInsight}</p>
          {walkEntries.length > 0 && (
            <div className="walk-periods" aria-label="散歩した時間帯">
              <span><b>{walkByPeriod.morning}</b>朝</span>
              <span><b>{walkByPeriod.daytime}</b>昼</span>
              <span><b>{walkByPeriod.evening}</b>夕・夜</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-section">
        <SectionTitle eyebrow="RECENT LOGS" title="最近の記録" />
        {records.length ? (
          <div className="record-list">
            {records.slice(0, 3).map((record) => (
              <button key={record.id} onClick={() => { setEditingRecordId(record.id); setRecordCategory(record.category ?? "daily"); setRecordDate(record.recordedOn); setRecordTime(record.recordedTime ?? "12:00"); setDurationMinutes(record.durationMinutes ?? 20); setBehaviorTypes(record.behaviorTypes?.filter((type) => type !== "other").length ? record.behaviorTypes.filter((type) => type !== "other") : []); setSelectedCustomBehaviors(record.behaviorCustomTexts?.length ? record.behaviorCustomTexts : record.behaviorCustomText ? [record.behaviorCustomText] : []); setBehaviorCustomText(""); setBehaviorIntensity(record.behaviorIntensity ?? 5); setMood(record.mood); setAppetite(record.appetite); setActivity(record.activity); setToilet(record.toilet); setSleep(record.sleep); setBehaviorNote(record.behaviorNote); setGoodMoment(record.goodMoment); setView("record"); }}>
                <span className="record-date"><strong>{record.recordedTime ?? "12:00"}</strong><small>{formatDate(record.recordedOn)}</small></span>
                <span className="timeline-topic-icon"><TopicIcon name={categoryInfo(record.category).icon} /></span>
                <span className="record-summary"><b>{record.category === "barking" ? [...record.behaviorTypes.filter((type) => type !== "other").map((type) => behaviorInfo(type).label), ...(record.behaviorCustomTexts?.length ? record.behaviorCustomTexts : record.behaviorCustomText ? [record.behaviorCustomText] : [])].join("・") : categoryInfo(record.category).label}</b>{record.category === "walk" && record.durationMinutes ? ` · ${record.durationMinutes}分` : ""}<small>{record.category === "barking" && record.behaviorIntensity ? `気になり度 ${record.behaviorIntensity}/10 · ` : ""}気分 {record.mood}/5</small></span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        ) : <div className="empty-card">記録はまだありません。今日の様子から始めましょう。</div>}
      </section>

      <section className="coach-preview">
        <div className="coach-avatar">C</div>
        <div>
          <p className="card-label">COACH ROOM</p>
          <h2>ひとりで抱え込まない場所</h2>
          <p>{messages.length ? "相談履歴を確認できます。" : "日々の記録をもとに、気になることをコーチへ相談できます。"}</p>
          <button className="text-button" onClick={() => setView("coach")}>コーチルームを開く →</button>
        </div>
      </section>
    </>
  );

  const focusedHomeView = (
    <>
      <section className="welcome focused-welcome">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1>{profile.name ? `${profile.name}ちゃんと、今日もひとつ。` : "今日から、ひとつずつ。"}</h1>
          <p className="welcome-copy">完璧じゃなくて大丈夫。できたことを一緒に増やそう。</p>
        </div>
        <button className="avatar" onClick={() => setView("profile")} aria-label="愛犬プロフィールを開く">{profile.name ? profile.name.slice(0, 1) : "＋"}</button>
      </section>

      {!profile.name && (
        <button className="profile-nudge" onClick={() => setView("profile")}>
          <span className="profile-nudge-mark">01</span>
          <span><strong>まず、愛犬を登録する</strong><small>その子に合う記録と目標を始められます。</small></span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      <LifeMoment scene="park" eyebrow="WALK TOGETHER" text="いつもの散歩にも、ふたりだけの発見を。" />

      <section className="today-mission" aria-labelledby="today-mission-title">
        <div className="mission-head">
          <div><p className="card-label">TODAY</p><h2 id="today-mission-title">今日のお世話</h2></div>
          <div className="mission-score"><strong>{completedGoalCount}</strong><span>/{careGoals.length || "–"}</span></div>
        </div>
        <LifeMoment scene="home" eyebrow="CARE AT HOME" text="小さなお世話が、今日の心地よさをつくります。" />
        {careGoals.length === 0 ? (
          <button className="mission-empty" onClick={() => setView("goals")}>
            <span><CareIcon name="paws" /></span>
            <b>続けたいことを、ひとつ決める</b><i>→</i>
          </button>
        ) : (
          <div className="mission-list">
            {careGoals.slice(0, 4).map((goal) => {
              const progress = goalProgress(goal);
              const done = progress >= goal.targetCount;
              return (
                <button key={goal.id} className={done ? "is-done" : ""} onClick={() => void completeCareGoal(goal)} disabled={done}>
                  <span className={`care-icon care-${goal.goalType}`}><CareIcon name={goal.goalType} /></span>
                  <span><strong>{goal.title}</strong><small>{done ? "できた！" : `${goalFrequency(goal)} · ${progress}/${goal.targetCount}`}</small></span>
                  <b aria-hidden="true">{done ? "✓" : "できた"}</b>
                </button>
              );
            })}
          </div>
        )}
        <button className="mission-manage" onClick={() => setView("goals")}>目標とお知らせを編集する →</button>
      </section>

      <section className="quick-log" aria-labelledby="quick-log-title">
        <div className="compact-section-head"><div><p className="card-label">QUICK LOG</p><h2 id="quick-log-title">何を記録する？</h2></div><span>今日 {todaysEntries.length}件</span></div>
        <div className="quick-log-grid">
          {RECORD_CATEGORIES.map((category) => {
            const count = todaysEntries.filter((record) => record.category === category.id).length;
            return (
              <button key={category.id} className={`category-${category.id}`} onClick={() => openNewRecord(category.id)}>
                <span className="topic-mark"><TopicIcon name={category.icon} /></span>
                {count > 0 && <b>{count}</b>}
                <strong>{category.label}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <LifeMoment scene="cafe" eyebrow="SLOW TIME" text="一緒にくつろぐ時間も、大切な記録のひとつ。" />

      <button className="insight-spotlight" onClick={() => setView("report")}>
        <span className="insight-spark" aria-hidden="true">✦</span>
        <span><small>{growthMessage ? "SMALL WIN" : "THIS WEEK"}</small><strong>{growthMessage || diaryInsight}</strong><em>変化を見る →</em></span>
      </button>

      <button className="coach-bridge" onClick={() => setView("coach")}>
        <span className="coach-bridge-icon"><NavGlyph name="coach" /></span>
        <span><small>COACH ROOM</small><strong>{messages.length ? "コーチとの相談を続ける" : "記録を見ながら、コーチに相談"}</strong></span>
        <b aria-hidden="true">→</b>
      </button>
    </>
  );

  const selectedCategory = recordCategory ? categoryInfo(recordCategory) : null;

  const recordView = !selectedCategory ? (
    <section className="topic-screen">
      <SectionTitle eyebrow="STEP 1 / 2" title="何を記録しますか？" />
      <p className="lead">テーマを選ぶと、必要な項目だけを表示します。</p>
      <div className="topic-grid">
        {RECORD_CATEGORIES.map((category) => (
          <button key={category.id} className={`category-${category.id}`} onClick={() => { setRecordTime(currentTime()); setRecordCategory(category.id); }}>
            <span className="topic-mark"><TopicIcon name={category.icon} /></span>
            <span><strong>{category.label}</strong><small>{category.description}</small></span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </div>
      <p className="topic-hint">同じ日に、違うテーマを何度でも記録できます。</p>
    </section>
  ) : (
    <form className="screen-form" onSubmit={saveRecord}>
      <div className="form-progress" aria-label="記録の進行状況"><span className="is-complete">1</span><i></i><span className="is-current">2</span><small>内容を入力</small></div>
      <button type="button" className="topic-back" onClick={() => setRecordCategory(null)}>← テーマを選び直す</button>
      <div className={`selected-topic category-${selectedCategory.id}`}>
        <span className="topic-mark"><TopicIcon name={selectedCategory.icon} /></span>
        <div><p>今日のテーマ</p><h2>{selectedCategory.label}</h2></div>
      </div>
      <p className="lead">うまく書こうとしなくて大丈夫。今日の{dogName}を、そのまま残してください。</p>
      <div className="date-time-row">
        <label className="field-label">日付<input type="date" value={recordDate} onChange={(event) => setRecordDate(event.target.value)} required /></label>
        <label className="field-label">時間
          <span className="time-input">
            <input type="time" value={recordTime} onChange={(event) => setRecordTime(event.target.value)} required />
            <button type="button" onClick={() => setRecordTime(currentTime())}>いま</button>
          </span>
        </label>
      </div>
      <p className="time-note">記録を始めた時刻が自動で入っています。</p>
      {recordCategory === "barking" && (
        <section className="behavior-picker">
          <div className="behavior-picker-heading"><p>どの困りごとですか？</p><span>{behaviorSelectionCount}/3</span></div>
          <div>
            {BEHAVIOR_TYPES.filter((item) => item.id !== "other").map((item) => (
              <button
                type="button"
                key={item.id}
                className={behaviorTypes.includes(item.id) ? "is-selected" : ""}
                aria-pressed={behaviorTypes.includes(item.id)}
                disabled={!behaviorTypes.includes(item.id) && behaviorSelectionCount >= 3}
                onClick={() => toggleBehaviorType(item.id)}
              >
                <strong>{item.label}</strong><small>{item.description}</small>
              </button>
            ))}
          </div>
          {customBehaviorOptions.length > 0 && (
            <div className="saved-behaviors">
              <span>以前追加した項目</span>
              <div>{customBehaviorOptions.map((label) => (
                <button type="button" key={label} className={selectedCustomBehaviors.includes(label) ? "is-selected" : ""} onClick={() => selectCustomBehavior(label)}>{label}</button>
              ))}</div>
            </div>
          )}
          <label className="custom-behavior">その他の困りごと
            <span className="custom-behavior-entry">
              <input value={behaviorCustomText} onChange={(event) => setBehaviorCustomText(event.target.value)} placeholder="例：拾い食い、家具をかじる" maxLength={60} />
              <button type="button" onClick={addCustomBehavior} disabled={!behaviorCustomText.trim()}>追加</button>
            </span>
            <small>追加すると今回の記録に選ばれ、次回から選択項目として残ります。</small>
          </label>
          <fieldset className="intensity-field">
            <legend>どのくらい気になった？</legend>
            <div className="intensity-value"><output>{behaviorIntensity}</output><span>{behaviorIntensity <= 3 ? "少し気になった" : behaviorIntensity <= 7 ? "気になった" : "とても気になった"}</span></div>
            <input aria-label="気になり度" type="range" min="1" max="10" step="1" value={behaviorIntensity} onChange={(event) => setBehaviorIntensity(Number(event.target.value))} />
            <div className="intensity-labels"><span>1 ほとんど気にならない</span><span>10 とても気になる</span></div>
          </fieldset>
        </section>
      )}
      <fieldset className="mood-field">
        <legend>{dogName}の今日の様子</legend>
        <div>
          {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setMood(value)} className={mood === value ? "is-selected" : ""} aria-label={`気分 ${value}`} aria-pressed={mood === value}>{["しょんぼり", "いまいち", "ふつう", "ごきげん", "最高"][value - 1]}</button>)}
        </div>
      </fieldset>
      <div className="status-grid topic-status">
        {recordCategory === "meal" && <StatusSelector label="食欲" value={appetite} onChange={setAppetite} />}
        {recordCategory === "walk" && (
          <div className="walk-duration">
            <span>お散歩の時間</span>
            <div>
              {[10, 20, 30, 45].map((minutes) => (
                <button type="button" key={minutes} className={durationMinutes === minutes ? "is-selected" : ""} onClick={() => setDurationMinutes(minutes)}>{minutes}分</button>
              ))}
            </div>
            <label>その他<input type="number" min="1" max="600" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />分</label>
          </div>
        )}
        {recordCategory === "walk" && <StatusSelector label="散歩後の元気" value={activity} onChange={setActivity} />}
        {recordCategory === "toilet" && <StatusSelector label="トイレの様子" value={toilet} onChange={setToilet} />}
        {recordCategory === "sleep" && <StatusSelector label="眠りの様子" value={sleep} onChange={setSleep} />}
      </div>
      {recordCategory !== "win" && (
        <label className="field-label">{selectedCategory.noteLabel}<textarea value={behaviorNote} onChange={(event) => setBehaviorNote(event.target.value)} placeholder={selectedCategory.placeholder} rows={3} /></label>
      )}
      <label className="field-label good-field">{recordCategory === "win" ? "今日できたこと" : "小さな「できた」（任意）"}<textarea value={goodMoment} onChange={(event) => setGoodMoment(event.target.value)} placeholder={recordCategory === "win" ? selectedCategory.placeholder : "少し落ち着けた、昨日より食べられた など"} rows={3} required={recordCategory === "win"} /></label>
      <button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中…" : `「${selectedCategory.label}」を記録する`}<span>→</span></button>
    </form>
  );

  const goalsView = (
    <section className="goals-screen care-goals-card">
      <SectionTitle eyebrow="CARE ROUTINE" title="うちの子の習慣" />
      <p className="lead">やった方がいいを、できたに変える。犬ごとの暮らしに合わせて、無理のない目標を決めましょう。</p>

      <section className="goal-overview">
        <div><strong>{careGoals.length}</strong><span>取り組み中</span></div>
        <div><strong>{completedGoalCount}</strong><span>今の期間に達成</span></div>
        <p>{careGoals.length === 0 ? "まずは1つだけ選ぶのがおすすめです。" : completedGoalCount === careGoals.length ? "今の目標をすべて達成しました。よく続けられています！" : "全部できなくても大丈夫。できた日を積み重ねましょう。"}</p>
      </section>

      {careGoals.length > 0 && (
        <section className="active-goals">
          <div className="goal-section-head"><div><p className="card-label">MY ROUTINE</p><h2>決めた習慣</h2></div></div>
          <div className="active-goal-list">
            {careGoals.map((goal) => {
              const progress = goalProgress(goal);
              const done = progress >= goal.targetCount;
              const percent = Math.min(100, (progress / goal.targetCount) * 100);
              return (
                <article className={`active-goal ${done ? "is-done" : ""}`} key={goal.id}>
                  <div className="active-goal-main">
                    <span className={`care-icon care-${goal.goalType}`}><CareIcon name={goal.goalType} /></span>
                    <div><h3>{goal.title}</h3><p>{goalFrequency(goal)}の目標</p></div>
                    <strong>{Math.min(progress, goal.targetCount)}<small>/{goal.targetCount}</small></strong>
                  </div>
                  <div className="goal-progress"><i style={{ width: `${percent}%` }}></i></div>
                  <label className="goal-reminder">
                    <span>お知らせ時間</span>
                    <input type="time" value={goal.reminderTime ?? ""} onChange={(event) => void updateGoalReminder(goal, event.target.value || null)} />
                    {goal.reminderTime && <button type="button" onClick={() => void updateGoalReminder(goal, null)}>解除</button>}
                  </label>
                  <div className="goal-actions">
                    <button className="goal-remove" onClick={() => void removeCareGoal(goal)}>習慣から外す</button>
                    <button className="goal-done" onClick={() => void completeCareGoal(goal)} disabled={done}>{done ? "目標達成 ✓" : "できたを追加"}</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="goal-suggestions">
        <div className="goal-section-head"><div><p className="card-label">SUGGESTIONS</p><h2>おすすめから選ぶ</h2></div><span>まずは1〜3個</span></div>
        <div className="goal-template-grid">
          {CARE_GOAL_TEMPLATES.map((template) => {
            const added = careGoals.some((goal) => goal.title === template.title);
            return (
              <button key={template.title} className={added ? "is-added" : ""} onClick={() => void addCareGoal(template)} disabled={added}>
                <span className={`care-icon care-${template.goalType}`}><CareIcon name={template.goalType} /></span>
                <span><strong>{template.title}</strong><small>{goalFrequency(template)}</small></span>
                <b>{added ? "✓" : "＋"}</b>
              </button>
            );
          })}
        </div>
        <p className="goal-guidance">ケアの頻度は、犬種・被毛・皮膚・年齢・生活環境で変わります。ここで示す頻度は開始例です。必要に応じて獣医師やトリマーと相談してください。</p>
      </section>

      <form className="custom-goal-form" onSubmit={addCustomCareGoal}>
        <div className="goal-section-head"><div><p className="card-label">CREATE YOUR OWN</p><h2>自分で目標を作る</h2></div></div>
        <label className="field-label">やること<input value={customGoalTitle} onChange={(event) => setCustomGoalTitle(event.target.value)} placeholder="例：散歩後に足を拭く" maxLength={40} required /></label>
        <div className="goal-frequency-input">
          <label>頻度<select value={customGoalPeriod} onChange={(event) => setCustomGoalPeriod(event.target.value as GoalPeriod)}><option value="day">毎日</option><option value="week">毎週</option><option value="month">毎月</option></select></label>
          <label>目標回数<input type="number" min="1" max="31" value={customGoalCount} onChange={(event) => setCustomGoalCount(Number(event.target.value))} /><span>回</span></label>
        </div>
        <button className="primary-button" type="submit">この目標を追加する<span>→</span></button>
      </form>
    </section>
  );

  const reportView = (
    <section className="report-screen">
      <SectionTitle eyebrow="PROGRESS" title={`${dogName}の変化`} />
      <p className="lead">記録がつながると、調子・暮らし・困りごとの変化が見えてきます。</p>

      <section className={`report-condition condition-${recordedConditionDays.length < 3 ? "collecting" : conditionScore >= 78 ? "good" : conditionScore >= 58 ? "middle" : "watch"}`}>
        <div className="condition-ring" style={{ background: `conic-gradient(var(--green) ${conditionScore * 3.6}deg, #e4ebe7 0deg)` }}>
          <span><strong>{recordedConditionDays.length ? conditionScore : "–"}</strong><small>{recordedConditionDays.length ? "/100" : "集計中"}</small></span>
        </div>
        <div><p className="card-label">LIFE CONDITION</p><h2>{conditionLevel}</h2><p>{conditionCopy}</p><small>診断ではなく、記録から見た目安です。</small></div>
      </section>

      <section className="report-calendar">
        <div className="calendar-head">
          <div><p className="card-label">LOG CALENDAR</p><h2>記録カレンダー</h2></div>
          <div className="calendar-switch"><button className={calendarMode === "week" ? "is-selected" : ""} onClick={() => setCalendarMode("week")}>週</button><button className={calendarMode === "month" ? "is-selected" : ""} onClick={() => setCalendarMode("month")}>月</button></div>
        </div>
        {calendarMode === "week" ? (
          <div className="week-dots">
            {recentDays.map((day) => <button key={day.value} className={`week-day ${day.entries.length ? "is-recorded" : ""} ${day.value === today() ? "is-today" : ""}`} onClick={() => setSelectedCalendarDate(day.value)}><span>{day.label}</span><i>{day.entries.length || "–"}</i></button>)}
          </div>
        ) : (
          <div className="month-view">
            <div className="month-navigation"><button onClick={() => moveCalendarMonth(-1)}>‹</button><strong>{monthlyCalendar.label}</strong><button onClick={() => moveCalendarMonth(1)} disabled={calendarMonthOffset === 0}>›</button></div>
            <div className="month-weekdays">{["日","月","火","水","木","金","土"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="month-grid">{monthlyCalendar.cells.map((cell, index) => cell ? <button key={cell.value} className={`${cell.count ? "is-recorded" : ""} ${cell.value === today() ? "is-today" : ""}`} onClick={() => setSelectedCalendarDate(cell.value)}><span>{cell.day}</span>{cell.count > 0 && <b>{cell.count}</b>}</button> : <span key={`blank-${index}`}></span>)}</div>
          </div>
        )}
        <p className="calendar-takeaway">{diaryInsight}</p>
      </section>

      <div className="report-section-heading"><p className="card-label">BEHAVIOR TREND</p><h2>困りごとの変化</h2></div>
      <div className="report-filter" aria-label="困りごとの種類">
        {BEHAVIOR_TYPES.map((item) => (
          <button key={item.id} className={reportBehaviorType === item.id ? "is-selected" : ""} onClick={() => setReportBehaviorType(item.id)}>{item.label}</button>
        ))}
      </div>

      <section className="trend-card">
        <div className="trend-summary">
          <div><p>直近7日間</p><strong>{currentBehaviorTotal}<span>件</span></strong></div>
          <div className={currentBehaviorTotal < previousBehaviorTotal ? "is-improving" : currentBehaviorTotal > previousBehaviorTotal ? "is-watching" : ""}>
            <small>その前の7日間 {previousBehaviorTotal}件</small>
            <b>{behaviorTrend}</b>
          </div>
        </div>
        <div className="behavior-chart" role="img" aria-label={`${behaviorInfo(reportBehaviorType).label}の直近7日間の記録回数`}>
          {behaviorSeries.map((day) => (
            <div key={day.value}>
              <span><i style={{ height: `${day.count ? Math.max(16, (day.count / maxBehaviorCount) * 100) : 3}%` }}><b>{day.count || ""}</b></i></span>
              <small>{day.label}</small>
            </div>
          ))}
        </div>
      </section>

      {currentBehaviorTotal > 0 ? (
        <section className="report-detail">
          <div>
            <p className="card-label">WHEN IT HAPPENS</p>
            <h2>起きやすい時間帯</h2>
            <div className="behavior-periods">
              <span><b>{behaviorPeriods.morning}</b>朝</span>
              <span><b>{behaviorPeriods.daytime}</b>昼</span>
              <span><b>{behaviorPeriods.evening}</b>夕・夜</span>
            </div>
          </div>
          <p className="report-observation">
            {Math.max(behaviorPeriods.morning, behaviorPeriods.daytime, behaviorPeriods.evening) === behaviorPeriods.evening
              ? "夕方以降の記録が多めです。散歩や来客など、直前の出来事も一緒に残すと理由を探しやすくなります。"
              : Math.max(behaviorPeriods.morning, behaviorPeriods.daytime, behaviorPeriods.evening) === behaviorPeriods.morning
                ? "朝の記録が多めです。起床後や食事前後の様子も一緒に見てみましょう。"
                : "日中の記録が多めです。留守番や周囲の音など、そのときの環境も手がかりになります。"}
          </p>
        </section>
      ) : (
        <div className="report-empty"><strong>{behaviorInfo(reportBehaviorType).label}の記録はまだありません</strong><p>起きたときに、時刻と程度を残してみましょう。</p></div>
      )}

      <section className="report-coaching-cta">
        <div><p className="card-label">FROM DATA TO ACTION</p><h2>この変化、どう見ればいい？</h2><p>回数だけでは分からない背景もあります。記録をコーチと一緒に読み、次に試すことを整理できます。</p></div>
        <button onClick={() => setView("coach")}>{coachingApplication ? "担当状況を確認する" : "コーチングについて相談する"}<span>→</span></button>
      </section>

      <button className="primary-button report-add" onClick={() => { openNewRecord("barking"); if (reportBehaviorType === "other") setBehaviorTypes([]); else setBehaviorTypes([reportBehaviorType]); }}>{behaviorInfo(reportBehaviorType).label}を記録する<span>→</span></button>
      <p className="report-note">表示しているのは記録回数の変化です。記録漏れや生活リズムも影響するため、実際の発生回数や因果関係を断定するものではありません。</p>
    </section>
  );

  const coachingChatOpen = Boolean(coachingApplication?.ownerConfirmedAt) && Boolean(coachingApplication && ["assigned", "consulting", "payment_pending", "active"].includes(coachingApplication.status));
  const ownerBookedSessions = onlineSessions.filter((session) => session.status === "booked").sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const ownerCompletedSessions = onlineSessions.filter((session) => session.status === "completed").sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const chronologicalMessages = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const mediaMessages = chronologicalMessages.filter((message) => message.mediaUrl && message.mediaType);
  const selectedMedia = mediaMessages.find((message) => message.id === selectedMediaId) ?? mediaMessages[mediaMessages.length - 1];
  const openMediaGallery = (message: CoachMessage) => {
    setSelectedMediaId(message.id);
    setMediaGalleryOpen(true);
  };
  const ownerHasInitialSession = onlineSessions.some((session) => session.sessionType === "initial" && session.status !== "cancelled");
  const assignedCoachCard = coachingApplication ? (
    <section className="coach-assigned-card">
      <div className={`coach-avatar coach-profile-avatar preset-${assignedCoachProfile?.avatarPreset ?? "paw-green"}`}>{assignedCoachProfile?.avatarUrl ? <img src={assignedCoachProfile.avatarUrl} alt="" /> : <CareIcon name="paws" />}</div>
      <div className="coach-identity"><p className="coach-role-label"><span></span>あなたの担当コーチ</p><h2>{assignedCoachProfile?.displayName || "担当コーチ"}</h2><strong>{assignedCoachProfile?.headline || "愛犬との暮らしを一緒に整えます"}</strong><p>{assignedCoachProfile?.bio || "記録を見ながら、まずは今いちばん気になることから話しましょう。"}</p>{assignedCoachProfile?.credentials && <small>{assignedCoachProfile.credentials}</small>}</div>
      <b>{coachingApplication.ownerConfirmedAt ? "担当確定" : "確認待ち"}</b>
    </section>
  ) : null;
  const coachView = (
    <section className="coach-screen">
      <SectionTitle eyebrow="COACHING" title={coachingChatOpen ? "担当コーチに相談" : "記録を、変化につなげる"} />
      {!coachingApplication || coachingApplication.status === "closed" ? (
        <>
          <section className="coaching-intro">
            <div className="coaching-intro-icon"><NavGlyph name="coach" /></div>
            <p className="card-label">WAN TONE COACHING</p>
            <h2>ひとりで悩む時間を、<br />一緒に考える時間へ。</h2>
            <p>これまでの記録をコーチと共有できます。「いつ・どんなときに」をもとに、その子に合う次の一歩を整理します。</p>
            <div className="coaching-value-grid">
              <span><b>01</b><strong>説明が楽</strong><small>記録をそのまま共有</small></span>
              <span><b>02</b><strong>変化が見える</strong><small>試した前後を確認</small></span>
              <span><b>03</b><strong>迷いを減らす</strong><small>次にやることを相談</small></span>
            </div>
          </section>
          <form className="coaching-application-form" onSubmit={submitCoachingApplication}>
            <div><p className="card-label">FIRST STEP</p><h2>コーチングについて相談する</h2><p>申込み後、担当候補のコーチとチャットで初回相談を行います。相談後に内容と料金をご案内します。</p></div>
            <fieldset>
              <legend>相談したいこと <small>3つまで</small></legend>
              <div className="coaching-concerns">{COACHING_CONCERNS.map((concern) => <button type="button" key={concern.id} className={coachingConcerns.includes(concern.id) ? "is-selected" : ""} onClick={() => toggleCoachingConcern(concern.id)}>{concern.label}{coachingConcerns.includes(concern.id) && <span>✓</span>}</button>)}</div>
            </fieldset>
            <label>どうなれたら嬉しいですか？<textarea rows={3} value={coachingOutcome} onChange={(event) => setCoachingOutcome(event.target.value)} placeholder="例：来客時に落ち着いて過ごせるようになりたい" maxLength={300} required /></label>
            <label>補足・気になっていること <small>任意</small><textarea rows={3} value={coachingNote} onChange={(event) => setCoachingNote(event.target.value)} placeholder="試したこと、生活環境など" maxLength={500} /></label>
            <button className="primary-button" disabled={saving || !coachingConcerns.length || !coachingOutcome.trim()}>{saving ? "送信中…" : "相談を申し込む"}<span>→</span></button>
            <p className="coaching-form-note">この時点では料金は発生しません。初回相談後にご判断いただけます。</p>
          </form>
        </>
      ) : coachingApplication.status === "submitted" || coachingApplication.status === "offered" ? (
        <section className="coaching-pending">
          <span className="coaching-pending-paw"><CareIcon name="paws" /></span>
          <p className="card-label">{coachingApplication.status === "offered" ? "COACH REVIEW" : "APPLICATION RECEIVED"}</p>
          <h2>{coachingApplication.status === "offered" ? "担当候補のコーチが確認しています" : "相談を受け付けました"}</h2>
          <p>{coachingApplication.status === "offered" ? "相談内容とこれまでの記録を確認中です。引き受けが確定すると、この画面とメールでお知らせします。" : "内容とこれまでの記録を確認し、合いそうなコーチをご案内します。"}</p>
          <div className="coaching-steps"><span className={coachingApplication.status === "submitted" ? "is-current" : "is-complete"}><b>✓</b>申込み</span><span className={coachingApplication.status === "offered" ? "is-current" : ""}><b>2</b>コーチ確認</span><span><b>3</b>担当決定</span></div>
          <div className="application-summary"><small>相談テーマ</small><p>{coachingApplication.concernCategories.map(coachingConcernLabel).join("・")}</p><small>目指したい状態</small><p>{coachingApplication.desiredOutcome}</p></div>
        </section>
      ) : (
        <>
          {!coachingApplication.ownerConfirmedAt && assignedCoachCard}
          {!coachingApplication.ownerConfirmedAt ? (
            <section className="coach-confirm-card">
              <p className="card-label">FINAL CONFIRMATION</p>
              <h2>この担当者で決定しますか？</h2>
              <p>確定すると、オンライン診断の予約と担当コーチとのチャットが使えるようになります。</p>
              <button className="primary-button" onClick={() => void confirmAssignedCoach()} disabled={saving}>{saving ? "確定中…" : "このコーチに決定する"}<span>→</span></button>
            </section>
          ) : (
            <>
              <div className="owner-coach-tabs" role="tablist" aria-label="コーチメニュー">
                <button type="button" role="tab" aria-selected={ownerCoachTab === "chat"} className={ownerCoachTab === "chat" ? "is-active" : ""} onClick={() => setOwnerCoachTab("chat")}><span className="owner-tab-icon"><NavGlyph name="coach" /></span><span><strong>チャット</strong><small>{messages.length ? `${messages.length}件のやりとり` : "コーチに相談"}</small></span></button>
                <button type="button" role="tab" aria-selected={ownerCoachTab === "sessions"} className={ownerCoachTab === "sessions" ? "is-active" : ""} onClick={() => setOwnerCoachTab("sessions")}><span className="owner-tab-icon"><NavGlyph name="goals" /></span><span><strong>オンライン診断</strong><small>{ownerBookedSessions.length ? `予約 ${ownerBookedSessions.length}件` : "予約・履歴"}</small></span></button>
              </div>

              {ownerCoachTab === "sessions" ? (
                <div className="owner-coach-panel" role="tabpanel" aria-label="オンライン診断">
                  <header className="owner-panel-heading"><div><p className="card-label">ONLINE SESSION</p><h2>オンライン診断</h2></div><span className="meet-mini-mark">Meet</span></header>

                  {ownerBookedSessions.length ? (
                    <section className="owner-next-sessions" aria-label="予約済みのオンライン診断">
                      {ownerBookedSessions.map((session, index) => (
                        <details className={`owner-session-disclosure ${index === 0 ? "is-next" : ""}`} key={session.id}>
                          <summary>
                            <span className="session-when"><small>{index === 0 ? "次回" : "予約済み"}</small><time>{formatOnlineDate(session.startsAt)}</time></span>
                            {session.meetUrl ? <a href={session.meetUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Meetを開く</a> : <span className="meet-preparing">URL準備中</span>}
                            <i aria-hidden="true">⌄</i>
                          </summary>
                          <div className="session-expanded-detail">
                            <dl>
                              <div><dt>内容</dt><dd>{session.sessionType === "initial" ? "初回オンライン診断" : "継続オンライン診断"}</dd></div>
                              <div><dt>所要時間</dt><dd>{Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)}分</dd></div>
                              <div><dt>担当</dt><dd>{session.coachName || assignedCoachProfile?.displayName || "担当コーチ"}</dd></div>
                            </dl>
                            <p>Google Meetで実施します。開始時刻になったら上のボタンからご参加ください。</p>
                          </div>
                        </details>
                      ))}
                    </section>
                  ) : (
                    <section className="owner-next-empty"><span><NavGlyph name="goals" /></span><div><strong>予約中のオンライン診断はありません</strong><p>下の「新しく予約する」から空き日時を選べます。</p></div></section>
                  )}

                  <details className="owner-panel-disclosure">
                    <summary><span><strong>{ownerHasInitialSession ? "新しく予約する" : "初回診断を予約する"}</strong><small>担当コーチの空き日時から選択</small></span><b>{availableSlots.length}枠</b><i aria-hidden="true">⌄</i></summary>
                    <div className="owner-disclosure-body">
                      <div className="owner-slot-list">{availableSlots.length ? availableSlots.slice(0, 12).map((slot) => <button key={slot.id} onClick={() => void bookOnlineSession(slot)} disabled={saving}><span><strong>{formatOnlineDate(slot.startsAt)}</strong><small>{Math.round((new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60000)}分</small></span><b>選ぶ →</b></button>) : <p>現在予約できる日時はありません。担当コーチが枠を追加すると、ここへ自動で反映されます。</p>}</div>
                    </div>
                  </details>

                  <details className="owner-panel-disclosure owner-history-disclosure">
                    <summary><span><strong>オンライン診断の履歴</strong><small>過去の診断を確認</small></span><b>{ownerCompletedSessions.length}回</b><i aria-hidden="true">⌄</i></summary>
                    <div className="owner-disclosure-body">
                      {ownerCompletedSessions.length ? ownerCompletedSessions.map((session) => (
                        <details className="owner-history-row" key={session.id}>
                          <summary><time>{formatOnlineDate(session.startsAt)}</time><span>実施済み</span><i aria-hidden="true">⌄</i></summary>
                          <dl>
                            <div><dt>内容</dt><dd>{session.sessionType === "initial" ? "初回オンライン診断" : "継続オンライン診断"}</dd></div>
                            <div><dt>所要時間</dt><dd>{Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)}分</dd></div>
                            <div><dt>担当</dt><dd>{session.coachName || "担当コーチ"}</dd></div>
                          </dl>
                        </details>
                      )) : <p className="owner-history-empty">実施済みのオンライン診断はまだありません。</p>}
                    </div>
                  </details>
                </div>
              ) : (
                <div className="owner-coach-panel owner-chat-panel" role="tabpanel" aria-label="チャット">
                  {subscriptionStatus !== "checking" && subscriptionStatus !== "unsupported" && (
                    <section className={`chat-push-card ${isSubscribed ? "is-enabled" : ""}`} aria-live="polite">
                      <div><strong>{isSubscribed ? "通知は有効です" : "新着メッセージを見逃さないために"}</strong><p>{isSubscribed ? "この端末で新着メッセージを受け取れます。" : "担当コーチからメッセージが届いたら、この端末へお知らせします。"}</p></div>
                      {!isSubscribed && <button type="button" disabled={pushBusy} onClick={() => void enablePushNotifications()}>{pushBusy ? "設定中…" : "新着メッセージの通知をONにする"}</button>}
                      {isSubscribed && <span><i aria-hidden="true">✓</i> ON</span>}
                    </section>
                  )}
                  <div className="message-list" aria-live="polite" ref={ownerMessageListRef}>
                    {chronologicalMessages.length ? chronologicalMessages.map((message) => (
                      <div key={message.id} className={`message ${message.sender}`}>
                        <MessageMedia message={message} onOpen={openMediaGallery} />
                        {message.body && <MessageBody body={message.body} />}
                        <time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</time>
                      </div>
                    )) : <div className="coach-empty"><div className="coach-avatar"><NavGlyph name="coach" /></div><h3>担当コーチへ、最初のメッセージを。</h3><p>例：いちばん困っているのは散歩中の引っ張りです。記録のどこを見ればよいですか？</p></div>}
                  </div>
                  {connection === "online" && currentUserId && profile.id
                    ? <ChatInput ownerId={currentUserId} dogId={profile.id} sender="owner" placeholder="困っている場面や、写真・動画を共有してください" onSent={addOwnerMessage} />
                    : <p className="media-chat-unavailable">オンライン接続後にメッセージや画像・動画を送信できます。</p>}
                </div>
              )}
              {assignedCoachCard}
            </>
          )}
          {mediaGalleryOpen && selectedMedia && (
            <div className="media-gallery-backdrop" role="dialog" aria-modal="true" aria-label="共有メディアギャラリー" onClick={() => setMediaGalleryOpen(false)}>
              <section className="media-gallery" onClick={(event) => event.stopPropagation()}>
                <header><div><small>SHARED MEDIA</small><h2>画像・動画</h2><p>{mediaMessages.length}件</p></div><button type="button" onClick={() => setMediaGalleryOpen(false)} aria-label="ギャラリーを閉じる">×</button></header>
                <div className="media-gallery-stage">
                  {selectedMedia.mediaType === "image"
                    ? <img src={selectedMedia.mediaUrl} alt={selectedMedia.mediaName || "共有された画像"} />
                    : <video src={selectedMedia.mediaUrl} controls autoPlay playsInline preload="metadata">動画を再生できません。</video>}
                </div>
                <div className="media-gallery-meta"><strong>{selectedMedia.mediaName || (selectedMedia.mediaType === "image" ? "共有された画像" : "共有された動画")}</strong><time>{new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(selectedMedia.createdAt))}</time></div>
                <div className="media-gallery-grid" aria-label="共有メディア一覧">
                  {mediaMessages.map((message) => (
                    <button type="button" key={message.id} className={message.id === selectedMedia.id ? "is-selected" : ""} onClick={() => setSelectedMediaId(message.id)} aria-label={`${message.mediaName || (message.mediaType === "image" ? "画像" : "動画")}を表示`}>
                      {message.mediaType === "image" ? <img src={message.mediaUrl} alt="" loading="lazy" /> : <><video src={message.mediaUrl} muted playsInline preload="metadata" /><span aria-hidden="true">▶</span></>}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );

  const profileView = (
    <form className="screen-form" onSubmit={saveProfile}>
      <SectionTitle eyebrow="PROFILE" title="飼い主・愛犬プロフィール" />
      <p className="lead">担当コーチが、ご家族とその子に合った提案をするための情報です。</p>
      <section className="profile-form-section"><div className="profile-section-heading"><span>01</span><div><h2>飼い主さまについて</h2><p>連絡とサポートに必要な情報</p></div></div>
        <label className="field-label">お名前（氏名）<input autoComplete="name" value={ownerProfile.fullName} onChange={(event) => setOwnerProfile({ ...ownerProfile, fullName: event.target.value })} placeholder="例：三宅 太郎" required /></label>
        <label className="field-label">フリガナ<input value={ownerProfile.fullNameKana} onChange={(event) => setOwnerProfile({ ...ownerProfile, fullNameKana: event.target.value })} placeholder="例：ミヤケ タロウ" maxLength={150} required /></label>
        <label className="field-label">電話番号<input type="tel" inputMode="tel" autoComplete="tel" value={ownerProfile.phoneNumber} onChange={(event) => setOwnerProfile({ ...ownerProfile, phoneNumber: event.target.value })} placeholder="例：09012345678" required /></label>
        <label className="field-label">生年月日<input type="date" autoComplete="bday" max={today()} value={ownerProfile.birthDate} onChange={(event) => setOwnerProfile({ ...ownerProfile, birthDate: event.target.value })} required /></label>
        <label className="field-label">都道府県<select value={ownerProfile.prefecture} onChange={(event) => setOwnerProfile({ ...ownerProfile, prefecture: event.target.value })} required><option value="">選択してください</option>{PREFECTURES.map((prefecture) => <option key={prefecture} value={prefecture}>{prefecture}</option>)}</select></label>
        <label className="field-label">市区町村・番地・建物名<textarea rows={3} autoComplete="street-address" value={ownerProfile.address} onChange={(event) => setOwnerProfile({ ...ownerProfile, address: event.target.value })} placeholder="例：目黒区〇〇1-2-3 Wan Toneマンション101" required /></label>
      </section>
      <section className="profile-form-section"><div className="profile-section-heading"><span>02</span><div><h2>愛犬について</h2><p>生活リズムと気になること</p></div></div>
        <div className="profile-symbol">{profile.name ? profile.name.slice(0, 1) : "犬"}</div>
        <label className="field-label">名前<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="例：むぎ" required /></label>
        <label className="field-label">犬種<input value={profile.breed} onChange={(event) => setProfile({ ...profile, breed: event.target.value })} placeholder="例：トイプードル" required /></label>
        <label className="field-label">誕生日<input type="date" max={today()} value={profile.birthday} onChange={(event) => setProfile({ ...profile, birthday: event.target.value })} required />{ageLabel(profile.birthday) && <small className="age-preview">{ageLabel(profile.birthday)}</small>}</label>
        <label className="field-label">犬を飼うのは初めてですか？<select value={profile.isFirstTimeOwner} onChange={(event) => setProfile({ ...profile, isFirstTimeOwner: event.target.value as DogProfile["isFirstTimeOwner"] })} required><option value="">選択してください</option><option value="yes">はい、初めてです</option><option value="no">いいえ、飼った経験があります</option></select></label>
        <label className="field-label">性別<select value={profile.gender} onChange={(event) => setProfile({ ...profile, gender: event.target.value as DogProfile["gender"] })} required><option value="">選択してください</option><option value="male">男の子</option><option value="female">女の子</option><option value="unknown">不明・回答しない</option></select></label>
        <label className="field-label">しつけトレーニングの経験回数<select value={profile.trainingExperience} onChange={(event) => setProfile({ ...profile, trainingExperience: event.target.value as DogProfile["trainingExperience"] })} required><option value="">選択してください</option><option value="first_time">初めて</option><option value="once">1回</option><option value="twice">2回</option><option value="three_or_more">3回以上</option></select></label>
        <label className="field-label">保育園への頻度<select value={profile.daycareFrequency} onChange={(event) => setProfile({ ...profile, daycareFrequency: event.target.value })} required><option value="">選択してください</option><option>通っていない</option><option>月に数回</option><option>週1回</option><option>週2〜3回</option><option>週4回以上</option></select></label>
        <label className="field-label">散歩の頻度<select value={profile.walkFrequency} onChange={(event) => setProfile({ ...profile, walkFrequency: event.target.value })} required><option value="">選択してください</option><option>ほとんど行かない</option><option>週に数回</option><option>毎日1回</option><option>毎日2回</option><option>毎日3回以上</option></select></label>
        <label className="field-label">主な悩み・気になっていること<textarea rows={5} value={profile.concerns} onChange={(event) => setProfile({ ...profile, concerns: event.target.value })} placeholder="例：散歩中に犬を見ると吠える。来客時に落ち着けない。" required /></label>
      </section>
      <div className="privacy-card"><strong>記録について</strong><p>登録した情報は、あなたと担当コーチのサポートのために使用します。共有範囲は今後プロフィールから管理できるようにします。</p></div>
      <button className="primary-button" disabled={saving}>{saving ? "保存中…" : "プロフィールを保存"}<span>→</span></button>
      <div className="account-card"><span><small>ログイン中</small><strong>{userEmail}</strong></span><button type="button" onClick={() => void signOut()}>ログアウト</button></div>
    </form>
  );

  const onboardingView = (
    <div className="onboarding-stage">
      <header><strong>Wan Tone</strong><span>初期設定</span></header>
      <main className="onboarding-card">
        <div className="onboarding-progress"><span className={onboardingStep === "owner" ? "is-current" : "is-done"}>1<b>飼い主情報</b></span><i></i><span className={onboardingStep === "dog" ? "is-current" : ""}>2<b>愛犬情報</b></span></div>
        {onboardingStep === "owner" ? <form noValidate onSubmit={saveOwnerOnboarding} onInput={() => { if (onboardingError) setOnboardingError(""); }}><p className="card-label">WELCOME TO WAN TONE</p><h1>まず、飼い主さまのことを<br />教えてください。</h1><p className="onboarding-lead">担当コーチが安心してご連絡し、ご家族に合ったサポートを始めるための情報です。</p>
          <label className="field-label">お名前（氏名）<input autoFocus autoComplete="name" value={ownerProfile.fullName} onChange={(event) => setOwnerProfile({ ...ownerProfile, fullName: event.target.value })} placeholder="例：三宅 太郎" required /></label>
          <label className="field-label">フリガナ<input value={ownerProfile.fullNameKana} onChange={(event) => setOwnerProfile({ ...ownerProfile, fullNameKana: event.target.value })} placeholder="例：ミヤケ タロウ" maxLength={150} required /></label>
          <label className="field-label">電話番号<input type="tel" inputMode="tel" autoComplete="tel" value={ownerProfile.phoneNumber} onChange={(event) => setOwnerProfile({ ...ownerProfile, phoneNumber: event.target.value })} placeholder="例：09012345678" required /></label>
          <label className="field-label">生年月日<input type="date" autoComplete="bday" max={today()} value={ownerProfile.birthDate} onChange={(event) => setOwnerProfile({ ...ownerProfile, birthDate: event.target.value })} required /></label>
          <label className="field-label">都道府県<select value={ownerProfile.prefecture} onChange={(event) => setOwnerProfile({ ...ownerProfile, prefecture: event.target.value })} required><option value="">選択してください</option>{PREFECTURES.map((prefecture) => <option key={prefecture} value={prefecture}>{prefecture}</option>)}</select></label>
        <label className="field-label">市区町村・番地・建物名<textarea rows={3} autoComplete="street-address" value={ownerProfile.address} onChange={(event) => setOwnerProfile({ ...ownerProfile, address: event.target.value })} placeholder="例：目黒区〇〇1-2-3 Wan Toneマンション101" required /></label>
          {onboardingError && <p className="onboarding-error" role="alert">{onboardingError}</p>}
          <button type="submit" className="onboarding-next" disabled={saving}>{saving ? "保存中…" : "愛犬情報へ進む"}<span>→</span></button>
        </form> : <form noValidate onSubmit={saveDogOnboarding} onInput={() => { if (onboardingError) setOnboardingError(""); }}><p className="card-label">ABOUT YOUR DOG</p><h1>次に、愛犬の毎日を<br />教えてください。</h1><p className="onboarding-lead">暮らし方まで分かると、コーチが記録の変化を正しく読み取りやすくなります。</p>
          <div className="onboarding-grid"><label className="field-label">愛犬の名前<input autoFocus value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="例：むぎ" required /></label><label className="field-label">犬種<input value={profile.breed} onChange={(event) => setProfile({ ...profile, breed: event.target.value })} placeholder="例：トイプードル" required /></label></div>
          <label className="field-label">誕生日<input type="date" max={today()} value={profile.birthday} onChange={(event) => setProfile({ ...profile, birthday: event.target.value })} required />{ageLabel(profile.birthday) && <small className="age-preview">{ageLabel(profile.birthday)}</small>}</label>
          <div className="onboarding-grid"><label className="field-label">犬を飼うのは初めて？<select value={profile.isFirstTimeOwner} onChange={(event) => setProfile({ ...profile, isFirstTimeOwner: event.target.value as DogProfile["isFirstTimeOwner"] })} required><option value="">選択してください</option><option value="yes">はい</option><option value="no">いいえ</option></select></label><label className="field-label">性別<select value={profile.gender} onChange={(event) => setProfile({ ...profile, gender: event.target.value as DogProfile["gender"] })} required><option value="">選択してください</option><option value="male">男の子</option><option value="female">女の子</option><option value="unknown">不明・回答しない</option></select></label></div>
          <label className="field-label">しつけトレーニングの経験回数<select value={profile.trainingExperience} onChange={(event) => setProfile({ ...profile, trainingExperience: event.target.value as DogProfile["trainingExperience"] })} required><option value="">選択してください</option><option value="first_time">初めて</option><option value="once">1回</option><option value="twice">2回</option><option value="three_or_more">3回以上</option></select></label>
          <div className="onboarding-grid"><label className="field-label">保育園への頻度<select value={profile.daycareFrequency} onChange={(event) => setProfile({ ...profile, daycareFrequency: event.target.value })} required><option value="">選択してください</option><option>通っていない</option><option>月に数回</option><option>週1回</option><option>週2〜3回</option><option>週4回以上</option></select></label><label className="field-label">散歩の頻度<select value={profile.walkFrequency} onChange={(event) => setProfile({ ...profile, walkFrequency: event.target.value })} required><option value="">選択してください</option><option>ほとんど行かない</option><option>週に数回</option><option>毎日1回</option><option>毎日2回</option><option>毎日3回以上</option></select></label></div>
          <label className="field-label">主な悩み・気になっていること<textarea rows={5} value={profile.concerns} onChange={(event) => setProfile({ ...profile, concerns: event.target.value })} placeholder="吠える場面、散歩で困ること、日々気になる様子など" required /></label>
          {onboardingError && <p className="onboarding-error" role="alert">{onboardingError}</p>}
          <div className="onboarding-actions"><button type="button" onClick={() => { setOnboardingError(""); setOnboardingStep("owner"); }}>← 戻る</button><button type="submit" className="onboarding-next" disabled={saving}>{saving ? "登録中…" : "登録して始める"}<span>→</span></button></div>
        </form>}
        <p className="onboarding-privacy">入力情報は担当コーチと管理者だけがサポート目的で確認できます。</p>
      </main>
    </div>
  );

  const authView = (
    <div className="auth-stage">
      <section className="auth-brand">
        <p>WAN TONE</p>
        <h1>愛犬との毎日を、<br />ちゃんと覚えておく。</h1>
        <span>記録が変化につながり、コーチとの会話につながる。</span>
        <div className="auth-paw"><CareIcon name="paws" /></div>
      </section>
      <section className="auth-panel">
        <div className="auth-heading">
          <p className="card-label">WELCOME</p>
          <h2>{anonymousUser ? "今の記録を引き継ぐ" : authMode === "login" ? "おかえりなさい" : "はじめまして"}</h2>
          <p>{anonymousUser ? "メールアカウントへ変更すると、別の端末でも今の愛犬と記録を使えます。" : authMode === "login" ? "一度ログインすれば、次回からそのまま続けられます。" : "無料アカウントを作って、うちの子の記録を始めましょう。"}</p>
        </div>
        {!anonymousUser && (
          <div className="auth-switch">
            <button className={authMode === "login" ? "is-selected" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>ログイン</button>
            <button className={authMode === "signup" ? "is-selected" : ""} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>新規登録</button>
          </div>
        )}
        <form className="auth-form" onSubmit={submitAuth}>
          <label>メールアドレス<input type="email" inputMode="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <label>パスワード<input type="password" autoComplete={authMode === "login" && !anonymousUser ? "current-password" : "new-password"} minLength={8} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="8文字以上" required /></label>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          <button className="auth-submit" disabled={saving}>{saving ? "確認中…" : anonymousUser ? "今のデータを引き継ぐ" : authMode === "login" ? "ログインする" : "アカウントを作る"}<span>→</span></button>
        </form>
        {!anonymousUser && authMode === "login" && <button className="forgot-password" onClick={() => void resetPassword()}>パスワードを忘れた方</button>}
        {anonymousUser && <p className="migration-note">この操作では愛犬・記録・相談履歴の所有者IDは変わりません。</p>}
      </section>
      <div className={`toast ${notice ? "show" : ""}`} role="status">{notice}</div>
    </div>
  );

  const adminSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today()}T00:00:00+09:00`);
    date.setDate(date.getDate() - (6 - index));
    const key = date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const dayRecords = adminDetailRecords.filter((record) => record.recordedOn === key);
    return {
      key,
      label: new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(date),
      total: dayRecords.length,
      concerns: dayRecords.filter((record) => record.behaviorIntensity && record.behaviorIntensity >= 7).length,
    };
  });
  const adminCategoryCounts = RECORD_CATEGORIES.map((category) => ({
    ...category,
    count: adminDetailRecords.filter((record) => record.category === category.id).length,
  })).filter((category) => category.count > 0);
  const adminBehaviorRecords = adminDetailRecords.filter((record) => record.category === "barking");
  const adminAverageIntensity = adminBehaviorRecords.length
    ? Math.round(adminBehaviorRecords.reduce((sum, record) => sum + (record.behaviorIntensity ?? 0), 0) / adminBehaviorRecords.length * 10) / 10
    : null;
  const adminGoodMoments = adminDetailRecords.filter((record) => record.goodMoment.trim()).slice(0, 3);
  const pendingApplicationCount = adminApplications.filter((application) => application.status === "submitted").length;
  const coachOffers = adminApplications.filter((application) => application.status === "offered");
  const accountRoleCounts = {
    owner: adminAccounts.filter((account) => account.role === "owner").length,
    coach: adminAccounts.filter((account) => account.role === "coach").length,
    admin: adminAccounts.filter((account) => account.role === "admin").length,
  };
  const filteredAdminAccounts = adminAccountFilter === "all"
    ? adminAccounts
    : adminAccounts.filter((account) => account.role === adminAccountFilter);
  const scheduleCoaches = Array.from(new Map(onlineSessions.filter((session) => session.coachId).map((session) => [session.coachId, session.coachName])).entries());
  const scheduleOwners = Array.from(new Map(onlineSessions.filter((session) => session.ownerId).map((session) => [session.ownerId, session.ownerName])).entries());
  const slotCoachOptions = adminAccounts.filter((account) => account.role === "coach");
  const visibleManagedSlots = userRole === "admin" && slotCoachId
    ? availableSlots.filter((slot) => slot.coachId === slotCoachId)
    : availableSlots;
  const timelineStart = (() => {
    const anchor = dateKeyValue(timelineWeekAnchor);
    return addToDateKey(timelineWeekAnchor, -((anchor.getUTCDay() + 6) % 7));
  })();
  const timelineDays = Array.from({ length: 7 }, (_, index) => addToDateKey(timelineStart, index));
  const timelineHours = Array.from({ length: 24 }, (_, hour) => hour);
  const scheduleRange = (() => {
    const anchor = dateKeyValue(scheduleAnchor);
    let startKey = scheduleAnchor;
    let endKey = addToDateKey(scheduleAnchor, 1);
    if (scheduleMode === "week") {
      const offset = (anchor.getUTCDay() + 6) % 7;
      startKey = addToDateKey(scheduleAnchor, -offset);
      endKey = addToDateKey(startKey, 7);
    } else if (scheduleMode === "month") {
      startKey = `${scheduleAnchor.slice(0, 7)}-01`;
      const nextMonth = dateKeyValue(startKey);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      endKey = dateKeyFromValue(nextMonth);
    }
    return { startKey, endKey, start: new Date(`${startKey}T00:00:00+09:00`), end: new Date(`${endKey}T00:00:00+09:00`) };
  })();
  const filteredScheduleSessions = onlineSessions.filter((session) => {
    const starts = new Date(session.startsAt);
    return starts >= scheduleRange.start && starts < scheduleRange.end
      && (scheduleCoachFilter === "all" || session.coachId === scheduleCoachFilter)
      && (scheduleOwnerFilter === "all" || session.ownerId === scheduleOwnerFilter);
  });
  const scheduleDays = Array.from({ length: Math.ceil((scheduleRange.end.getTime() - scheduleRange.start.getTime()) / 86_400_000) }, (_, index) => {
    const key = addToDateKey(scheduleRange.startKey, index);
    const date = dateKeyValue(key);
    return { key, date, sessions: filteredScheduleSessions.filter((session) => new Date(session.startsAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === key) };
  });
  const adminPageMeta: Record<AdminTab, { title: string; description: string; count: number }> = {
    applications: { title: "コーチング申込み", description: "相談内容を確認し、合いそうなコーチへつなぐ。", count: adminApplications.length },
    customers: { title: userRole === "admin" ? "すべての担当顧客" : "担当のお客様", description: "記録の変化を見て、必要なタイミングで声をかける。", count: adminCustomers.length },
    schedule: { title: "オンライン対応日時", description: "空き枠と予約状況を、ひとつの場所で確認する。", count: onlineSessions.filter((session) => session.status === "booked").length },
    coachProfile: { title: "コーチプロフィール", description: "オーナーへ表示する経歴とオンライン面談情報を整える。", count: availableSlots.length },
    accounts: { title: "ユーザー管理", description: "権限と担当コーチを、この画面で設定できます。", count: adminAccounts.length },
  };

  const adminView = (
    <div className="admin-stage">
      <header className="admin-header">
        <div><p>WAN TONE</p><strong>{userRole === "admin" ? "Admin Console" : "Coach Console"}</strong></div>
        <div className="admin-header-actions">
          {(userRole === "admin" || userRole === "coach") && <button className="mode-switch" onClick={() => { setStaffMode("owner"); setView("home"); }}>飼い主画面へ</button>}
          <button onClick={() => void signOut()}>ログアウト</button>
        </div>
      </header>
      <main className="admin-main">
        {selectedAdminCustomer ? (
          <div className="admin-detail">
            <button className="admin-back" onClick={() => setSelectedAdminCustomer(null)}>← 担当顧客へ戻る</button>
            <section className="admin-detail-hero">
              <div className="admin-dog-avatar">{selectedAdminCustomer.dogName.slice(0, 1)}</div>
              <div><p className="card-label">CUSTOMER DETAIL</p><h1>{selectedAdminCustomer.dogName}</h1><span>{selectedAdminCustomer.breed || "犬種未登録"} · 直近30日</span></div>
              <b className={selectedAdminCustomer.concerns7d > 0 ? "needs-care" : "stable"}>{selectedAdminCustomer.concerns7d > 0 ? "要確認" : "安定"}</b>
            </section>
            {(adminDetailOwnerProfile || adminDetailDogProfile) && <section className="customer-context-card">
              <div><p className="card-label">FAMILY PROFILE</p><h2>ご家族と愛犬の基本情報</h2></div>
              <div className="customer-context-grid">
                <article><h3>飼い主さま</h3><dl>
                  <div><dt>お名前</dt><dd>{adminDetailOwnerProfile?.fullName || "未登録"}</dd></div>
                  <div><dt>フリガナ</dt><dd>{adminDetailOwnerProfile?.fullNameKana || "未登録"}</dd></div>
                  <div><dt>電話番号</dt><dd>{adminDetailOwnerProfile?.phoneNumber || "未登録"}</dd></div>
                  <div><dt>都道府県</dt><dd>{adminDetailOwnerProfile?.prefecture || "未登録"}</dd></div>
                  <div><dt>住所</dt><dd>{adminDetailOwnerProfile?.address || "未登録"}</dd></div>
                  <div><dt>生年月日</dt><dd>{adminDetailOwnerProfile?.birthDate || "未登録"}</dd></div>
                </dl></article>
                <article><h3>{adminDetailDogProfile?.name || selectedAdminCustomer.dogName}</h3><dl>
                  <div><dt>年齢</dt><dd>{ageLabel(adminDetailDogProfile?.birthday ?? "") || "未登録"}</dd></div>
                  <div><dt>性別</dt><dd>{dogGenderLabel(adminDetailDogProfile?.gender ?? "")}</dd></div>
                  <div><dt>飼育経験</dt><dd>{adminDetailDogProfile?.isFirstTimeOwner === "yes" ? "初めて" : adminDetailDogProfile?.isFirstTimeOwner === "no" ? "経験あり" : "未登録"}</dd></div>
                  <div><dt>トレーニング経験</dt><dd>{trainingExperienceLabel(adminDetailDogProfile?.trainingExperience ?? "")}</dd></div>
                  <div><dt>保育園</dt><dd>{adminDetailDogProfile?.daycareFrequency || "未登録"}</dd></div>
                  <div><dt>散歩</dt><dd>{adminDetailDogProfile?.walkFrequency || "未登録"}</dd></div>
                </dl></article>
              </div>
              {adminDetailDogProfile?.concerns && <div className="customer-concerns"><small>主な悩み・気になっていること</small><p>{adminDetailDogProfile.concerns}</p></div>}
            </section>}
            {adminDetailLoading ? <section className="admin-empty"><h2>記録を読み込んでいます</h2><p>少しだけお待ちください。</p></section> : (
              <>
                <section className="admin-insight-grid">
                  <article><small>7日間の記録</small><strong>{adminSevenDays.reduce((sum, day) => sum + day.total, 0)}<em>件</em></strong><p>{adminSevenDays.filter((day) => day.total > 0).length}日で記録</p></article>
                  <article><small>困りごとの平均</small><strong>{adminAverageIntensity ?? "—"}<em>{adminAverageIntensity ? "/10" : ""}</em></strong><p>{adminBehaviorRecords.length ? `${adminBehaviorRecords.length}件から算出` : "記録なし"}</p></article>
                  <article><small>ケア目標</small><strong>{adminDetailGoals.reduce((sum, goal) => sum + goal.completedCount, 0)}<em>回</em></strong><p>直近30日の達成</p></article>
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-heading"><div><p className="card-label">ACTIVITY</p><h2>記録のリズム</h2></div><span>直近7日</span></div>
                  <div className="admin-bars">{adminSevenDays.map((day) => <div key={day.key}><span><i style={{ height: `${Math.max(8, Math.min(100, day.total * 22))}%` }} className={day.concerns ? "has-concern" : ""}></i></span><small>{day.label}</small><b>{day.total}</b></div>)}</div>
                  <div className="admin-category-summary">{adminCategoryCounts.length ? adminCategoryCounts.map((category) => <span key={category.id}><TopicIcon name={category.icon} /><small>{category.label}</small><b>{category.count}</b></span>) : <p>まだ記録がありません。</p>}</div>
                </section>
                <div className="admin-detail-columns">
                  <section className="admin-panel">
                    <div className="admin-panel-heading"><div><p className="card-label">RECENT RECORDS</p><h2>最近の記録</h2></div></div>
                    <div className="admin-record-list">{adminDetailRecords.slice(0, 8).map((record) => <article key={record.id}><TopicIcon name={categoryInfo(record.category).icon} /><div><strong>{record.category === "barking" ? [...record.behaviorTypes.filter((type) => type !== "other").map((type) => behaviorInfo(type).label), ...record.behaviorCustomTexts].join("・") || "困りごと" : categoryInfo(record.category).label}</strong><p>{record.behaviorNote || record.goodMoment || "メモなし"}</p></div><time>{formatDate(record.recordedOn)}<br />{record.recordedTime}</time></article>)}{!adminDetailRecords.length && <p className="admin-muted">記録はまだありません。</p>}</div>
                  </section>
                  <section className="admin-panel">
                    <div className="admin-panel-heading"><div><p className="card-label">CARE GOALS</p><h2>ケア目標</h2></div><span>30日</span></div>
                    <div className="admin-goal-list">{adminDetailGoals.map((goal) => <article key={goal.id}><CareIcon name={goal.goalType} /><div><strong>{goal.title}</strong><p>{goal.period === "day" ? "毎日" : goal.period === "week" ? `週${goal.targetCount}回` : `月${goal.targetCount}回`}</p></div><b>{goal.completedCount}<small>回</small></b></article>)}{!adminDetailGoals.length && <p className="admin-muted">設定された目標はありません。</p>}</div>
                    {adminGoodMoments.length > 0 && <div className="admin-wins"><small>最近の「できた」</small>{adminGoodMoments.map((record) => <p key={record.id}>“{record.goodMoment}”</p>)}</div>}
                  </section>
                </div>
                <section className="admin-panel admin-chat-panel">
                  <div className="admin-panel-heading"><div><p className="card-label">CHAT</p><h2>飼い主との会話</h2></div><span>{adminDetailMessages.length}件</span></div>
                  <div className="admin-chat-history">{adminDetailMessages.map((message) => <article className={message.sender} key={message.id}><MessageMedia message={message} />{message.body && <MessageBody body={message.body} />}<time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</time></article>)}{!adminDetailMessages.length && <p className="admin-muted">まだ相談はありません。コーチから声をかけることもできます。</p>}</div>
                  <ChatInput ownerId={selectedAdminCustomer.ownerId} dogId={selectedAdminCustomer.dogId} sender="coach" placeholder={`${selectedAdminCustomer.dogName}の飼い主へメッセージ`} onSent={addAdminMessage} />
                </section>
              </>
            )}
          </div>
        ) : <>
        <section className="admin-welcome"><div><p className="card-label">{userRole === "admin" ? "ADMIN CONSOLE" : "COACH CONSOLE"}</p><h1>{adminPageMeta[adminTab].title}</h1><span>{userRole === "coach" && coachOffers.length && adminTab === "customers" ? "新しい担当依頼を確認して、引き受けるか選んでください。" : adminPageMeta[adminTab].description}</span></div><b>{userRole === "coach" && coachOffers.length && adminTab === "customers" ? coachOffers.length : adminPageMeta[adminTab].count}<small>{userRole === "coach" && coachOffers.length && adminTab === "customers" ? "件の依頼" : adminTab === "schedule" ? "件の予約" : adminTab === "coachProfile" ? "件の空き枠" : "件"}</small></b></section>
        {userRole === "coach" && coachOffers.length > 0 && (
          <section className="coach-offers" aria-labelledby="coach-offers-title">
            <div className="coach-offers-heading"><div><p className="card-label">NEW ASSIGNMENT</p><h2 id="coach-offers-title">担当のご相談</h2></div><span>{coachOffers.length}件</span></div>
            <div className="coach-offer-list">{coachOffers.map((application) => (
              <article className="coach-offer-card" key={application.id}>
                <div className="application-card-head"><span>{application.dogName.slice(0, 1)}</span><div><h2>{application.dogName}</h2><p>{application.ownerEmail}</p></div><b className="status-offered">確認待ち</b></div>
                <div className="application-topics">{application.concernCategories.map((concern) => <span key={concern}>{coachingConcernLabel(concern)}</span>)}</div>
                <div className="application-goal"><small>目指したい状態</small><p>{application.desiredOutcome}</p>{application.note && <><small>補足</small><p>{application.note}</p></>}</div>
                <p className="coach-offer-note">担当を引き受けるとownerへ確定通知が届き、チャットが開きます。</p>
                <div className="coach-offer-actions"><button className="secondary" onClick={() => void declineCoachingOffer(application)} disabled={saving}>今回は辞退</button><button onClick={() => void acceptCoachingOffer(application)} disabled={saving}>{saving ? "処理中…" : "担当を引き受ける"}<span>→</span></button></div>
              </article>
            ))}</div>
          </section>
        )}
        {userRole === "admin" ? <nav className="admin-tabs has-four" aria-label="管理メニュー"><button className={adminTab === "applications" ? "is-selected" : ""} onClick={() => setAdminTab("applications")}>申込み{pendingApplicationCount > 0 && <b>{pendingApplicationCount}</b>}</button><button className={adminTab === "customers" ? "is-selected" : ""} onClick={() => setAdminTab("customers")}>担当顧客</button><button className={adminTab === "schedule" ? "is-selected" : ""} onClick={() => setAdminTab("schedule")}>予約</button><button className={adminTab === "accounts" ? "is-selected" : ""} onClick={() => setAdminTab("accounts")}>ユーザー</button></nav> : <nav className="admin-tabs has-three" aria-label="コーチメニュー"><button className={adminTab === "customers" ? "is-selected" : ""} onClick={() => setAdminTab("customers")}>担当顧客</button><button className={adminTab === "schedule" ? "is-selected" : ""} onClick={() => setAdminTab("schedule")}>予約・空き枠</button><button className={adminTab === "coachProfile" ? "is-selected" : ""} onClick={() => setAdminTab("coachProfile")}>プロフィール</button></nav>}
        {adminTab === "applications" && <div className="admin-inbox-status"><span><i className={pendingApplicationCount ? "has-new" : ""}></i>{adminApplicationsError ? "申込みを取得できませんでした" : pendingApplicationCount ? `未対応の申込みが${pendingApplicationCount}件あります` : "未対応の申込みはありません"}<small>{adminApplicationsError ? adminApplicationsError : lastAdminRefresh ? `${lastAdminRefresh.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}更新 · 30秒ごとに自動確認` : "確認中"}</small></span><button onClick={() => void loadAdminWorkspace()}>今すぐ更新</button></div>}
        {adminTab === "applications" && (adminApplications.length ? (
          <div className="application-list">
            {adminApplications.map((application) => {
              const coaches = adminAccounts.filter((account) => account.role === "coach");
              return (
                <article className="application-card" key={application.id}>
                  <div className="application-card-head">
                    <span>{application.dogName.slice(0, 1)}</span>
                    <div><h2>{application.dogName}</h2><p>{application.ownerEmail}</p></div>
                    <b className={`status-${application.status}`}>{coachingStatusLabel(application.status)}</b>
                  </div>
                  <div className="application-topics">{application.concernCategories.map((concern) => <span key={concern}>{coachingConcernLabel(concern)}</span>)}</div>
                  <div className="application-goal"><small>目指したい状態</small><p>{application.desiredOutcome}</p>{application.note && <><small>補足</small><p>{application.note}</p></>}</div>
                  <div className="application-actions">
                    <label>担当コーチ<select value={application.assignedCoachId ?? ""} onChange={(event) => void assignCoachingApplication(application, event.target.value)} disabled={saving}><option value="">選択してください</option>{coaches.map((coach) => <option value={coach.userId} key={coach.userId}>{coach.displayName ? `${coach.displayName}（${coach.email}）` : `名前未設定（${coach.email}）`}</option>)}</select></label>
                    <label>進行状況<select value={application.status} onChange={(event) => void updateCoachingStatus(application, event.target.value as CoachingStatus)} disabled={saving}><option value="submitted">受付中</option><option value="offered" disabled>コーチ確認中</option><option value="assigned" disabled>担当決定</option><option value="consulting" disabled={!application.assignedCoachId}>初回相談中</option><option value="payment_pending" disabled={!application.assignedCoachId}>お支払い待ち</option><option value="active" disabled={!application.assignedCoachId}>利用中</option><option value="closed">終了</option></select></label>
                  </div>
                  {assignmentErrors[application.id] && <p className="application-error">担当設定エラー：{assignmentErrors[application.id]}</p>}
                  <time>{new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(application.submittedAt))} 申込み</time>
                </article>
              );
            })}
          </div>
        ) : <section className="admin-empty"><span><NavGlyph name="coach" /></span><h2>新しい申込みはありません</h2><p>ownerがコーチング相談を送信すると、ここに表示されます。</p></section>)}
        {adminTab === "customers" && (adminCustomers.length ? (
          <div className="customer-list">
            {adminCustomers.map((customer) => (
              <article className="customer-card" key={customer.assignmentId}>
                <div className="customer-profile"><span>{customer.dogName.slice(0, 1)}</span><div><h2>{customer.dogName}</h2><p>{customer.breed}</p></div><b>{customer.concerns7d > 0 ? "要確認" : "安定"}</b></div>
                <div className="customer-owner-summary"><small>飼い主さま</small><strong>{customer.ownerName || "お名前未登録"}</strong><span>{customer.ownerPrefecture || "都道府県未登録"}</span></div>
                <div className="customer-stats"><span><b>{customer.records7d}</b>7日間の記録</span><span><b>{customer.concerns7d}</b>気になる記録</span></div>
                <div className="customer-message"><small>最新の相談</small><p>{customer.latestMessage || "相談はまだありません"}</p></div>
                <button onClick={() => void openAdminCustomer(customer)}>詳細とチャットを見る →</button>
              </article>
            ))}
          </div>
        ) : (
          <section className="admin-empty"><span><NavGlyph name="coach" /></span><h2>担当のお客様はまだいません</h2><p>「ユーザー管理」から、愛犬を自分の担当へ追加できます。</p></section>
        ))}
        {adminTab === "schedule" && (
          <div className="staff-booking-workspace">
            {(userRole === "coach" || userRole === "admin") && (
              <section className="staff-schedule-panel">
                <div className="admin-panel-heading"><div><p className="card-label">AVAILABILITY</p><h2>{editingSlotId ? "オンライン対応枠を編集" : "オンライン対応枠を登録"}</h2></div><span>日本時間</span></div>
                <p className="staff-panel-lead">30分／60分単位で登録できます。予約済みの枠は、お客様との約束を守るため直接変更・削除できません。</p>
                <form className={`slot-create-form ${editingSlotId ? "is-editing" : ""}`} onSubmit={saveAvailabilitySlot}>
                  {userRole === "admin" && <label className="slot-coach-select">担当コーチ<select value={slotCoachId} onChange={(event) => { setSlotCoachId(event.target.value); setEditingSlotId(null); }} required><option value="">選択してください</option>{slotCoachOptions.map((coach) => <option key={coach.userId} value={coach.userId}>{coach.displayName ? `${coach.displayName}（${coach.email}）` : `名前未設定（${coach.email}）`}</option>)}</select></label>}
                  <label>日付<input type="date" value={slotDate} min={today()} onChange={(event) => setSlotDate(event.target.value)} required /></label>
                  <label>開始時間<input type="time" step="1800" value={slotTime} onChange={(event) => setSlotTime(event.target.value)} required /></label>
                  <fieldset className="slot-duration-picker"><legend>診断時間</legend><div>{[30, 60].map((minutes) => <button type="button" key={minutes} className={slotDuration === minutes ? "is-selected" : ""} onClick={() => setSlotDuration(minutes)}>{minutes}分</button>)}</div></fieldset>
                  <div className="slot-time-presets" aria-label="開始時間の候補">{["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"].map((time) => <button type="button" key={time} className={slotTime === time ? "is-selected" : ""} onClick={() => setSlotTime(time)}>{time}</button>)}</div>
                  <div className="slot-form-actions"><button disabled={saving}>{saving ? "保存中…" : editingSlotId ? "変更を保存" : "空き枠を追加"}</button>{editingSlotId && <><button type="button" className="secondary" onClick={resetAvailabilityEditor}>編集をやめる</button><button type="button" className="delete-slot" onClick={() => { const slot = availableSlots.find((item) => item.id === editingSlotId); if (slot) void removeAvailabilitySlot(slot); }}>この枠を削除</button></>}</div>
                </form>
                <section className="availability-timeline"><div className="timeline-toolbar"><div><strong>週間タイムライン</strong><small>空白をタップして30分単位で追加</small></div><div><button onClick={() => setTimelineWeekAnchor(addToDateKey(timelineWeekAnchor, -7))}>←</button><button onClick={() => setTimelineWeekAnchor(today())}>今週</button><button onClick={() => setTimelineWeekAnchor(addToDateKey(timelineWeekAnchor, 7))}>→</button></div></div>
                  <div className="timeline-scroll"><div className="timeline-grid"><aside><header></header>{timelineHours.map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</aside>{timelineDays.map((day) => <section key={day} className={day === today() ? "is-today" : ""}><header><small>{new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(dateKeyValue(day))}</small><strong>{Number(day.slice(-2))}</strong></header><div className="timeline-day-body" onClick={(event) => chooseTimelineTime(day, event)}>{timelineHours.map((hour) => <i key={hour}></i>)}{visibleManagedSlots.filter((slot) => new Date(slot.startsAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) === day).map((slot) => { const start = timeMinutesJst(slot.startsAt); const duration = Math.max(30, (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60_000); return <button type="button" key={slot.id} className={`timeline-slot ${availabilitySlotIsLocked(slot) ? "is-booked" : ""}`} style={{ top: `${start / 1440 * 100}%`, height: `${duration / 1440 * 100}%` }} onClick={(event) => { event.stopPropagation(); if (availabilitySlotIsLocked(slot)) { setScheduleAnchor(day); setScheduleMode("day"); } else editAvailabilitySlot(slot); }}><b>{new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(slot.startsAt))}</b><span>{availabilitySlotIsLocked(slot) ? "予約済" : "空き枠"}</span></button>; })}</div></section>)}</div></div>
                </section>
                <div className="staff-slot-list">{visibleManagedSlots.length ? visibleManagedSlots.map((slot) => <article key={slot.id} className={availabilitySlotIsLocked(slot) ? "is-booked" : "is-open"}><div className="slot-date"><span className="slot-status">{slot.sessionStatus === "completed" ? "完了済み" : slot.sessionStatus === "booked" ? "予約済み" : slot.sessionStatus === "cancelled" ? "予約取消済み" : "予約可能"}</span><strong>{formatOnlineDate(slot.startsAt)}</strong><small>{Math.round((new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60000)}分{userRole === "admin" ? ` · ${slot.coachName}` : ""}</small>{slot.ownerName && <em>{slot.ownerName}様</em>}</div><div className="slot-actions">{availabilitySlotIsLocked(slot) ? <button className="view-booking" onClick={() => { setScheduleAnchor(new Date(slot.startsAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })); setScheduleMode("day"); }}>予約を確認</button> : <><button className="edit-slot" onClick={() => editAvailabilitySlot(slot)}>編集</button><button className="delete-slot" onClick={() => void removeAvailabilitySlot(slot)}>削除</button></>}</div></article>) : <p>これから予約できる空き枠はありません。</p>}</div>
              </section>
            )}
            <section className="staff-schedule-panel">
              <div className="admin-panel-heading"><div><p className="card-label">BOOKINGS</p><h2>オンライン診断カレンダー</h2></div><button className="inline-refresh" onClick={() => void loadStaffBookingWorkspace()}>更新</button></div>
              <div className="schedule-toolbar">
                <div className="schedule-mode">{(["day", "week", "month"] as const).map((mode) => <button key={mode} className={scheduleMode === mode ? "is-selected" : ""} onClick={() => setScheduleMode(mode)}>{mode === "day" ? "日" : mode === "week" ? "週" : "月"}</button>)}</div>
                <div className="schedule-navigation"><button onClick={() => moveSchedule(-1)}>←</button><input type="date" value={scheduleAnchor} onChange={(event) => setScheduleAnchor(event.target.value)} /><button onClick={() => moveSchedule(1)}>→</button><button onClick={() => setScheduleAnchor(today())}>今日</button></div>
                <div className="schedule-filters">
                  {userRole === "admin" && <select value={scheduleCoachFilter} onChange={(event) => setScheduleCoachFilter(event.target.value)}><option value="all">すべてのコーチ</option>{scheduleCoaches.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>}
                  <select value={scheduleOwnerFilter} onChange={(event) => setScheduleOwnerFilter(event.target.value)}><option value="all">すべてのオーナー</option>{scheduleOwners.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>
                </div>
              </div>
              <div className={`schedule-calendar mode-${scheduleMode}`}>{scheduleDays.map((day) => <section key={day.key} className={day.key === today() ? "is-today" : ""}><header><strong>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(day.date)}</strong><small>{new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(day.date)}</small><b>{day.sessions.length}</b></header><div>{day.sessions.map((session) => <article key={session.id} className={`session-${session.status}`}><time>{new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(session.startsAt))}–{new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(session.endsAt))}</time><strong>{session.ownerName || session.ownerEmail}</strong><p>{session.dogName}</p><div className="calendar-coach-card"><span>{session.coachAvatarUrl ? <img src={session.coachAvatarUrl} alt="" /> : session.coachName.slice(0, 1)}</span><div><small>担当コーチ</small><b>{session.coachName}</b>{session.coachHeadline && <em>{session.coachHeadline}</em>}</div></div><small>{session.sessionType === "initial" ? "初回" : "継続"} · {session.status === "booked" ? "確定" : session.status === "completed" ? "完了" : "取消"}</small><div className="calendar-event-actions">{session.meetUrl && session.status === "booked" && <a href={session.meetUrl} target="_blank" rel="noreferrer">Meet</a>}{session.status === "booked" && <><button onClick={() => void updateOnlineSessionStatus(session.id, "completed")}>完了</button><button className="is-danger" onClick={() => void updateOnlineSessionStatus(session.id, "cancelled")}>取消</button></>}</div>{session.calendarSyncStatus !== "synced" && <em className={`sync-${session.calendarSyncStatus}`}>{session.calendarSyncStatus === "error" ? "Google同期エラー" : session.calendarSyncStatus === "not_connected" ? "Google未連携" : "Google同期中"}</em>}</article>)}</div></section>)}</div>
              {!filteredScheduleSessions.length && <section className="admin-empty compact"><h2>この期間の予約はありません</h2><p>表示期間または絞り込み条件を変更してください。</p></section>}
            </section>
          </div>
        )}
        {adminTab === "coachProfile" && userRole === "coach" && (
          <form className="staff-profile-form" onSubmit={saveCoachProfile}>
            <div className="staff-profile-preview"><div className={`coach-avatar coach-profile-avatar preset-${coachProfile.avatarPreset}`}>{coachProfile.avatarUrl ? <img src={coachProfile.avatarUrl} alt="" /> : <CareIcon name="paws" />}</div><div><p className="card-label">PROFILE PREVIEW</p><h2>{coachProfile.displayName || "コーチ名"}</h2><strong>{coachProfile.headline || "専門分野や大切にしていること"}</strong></div></div>
            <fieldset className="avatar-settings"><legend>プロフィールアイコン</legend><div className="avatar-presets">{["paw-green", "paw-blue", "paw-coral"].map((preset) => <button type="button" key={preset} className={`preset-${preset} ${!coachProfile.avatarUrl && coachProfile.avatarPreset === preset ? "is-selected" : ""}`} onClick={() => setCoachProfile({ ...coachProfile, avatarUrl: "", avatarPreset: preset })}><CareIcon name="paws" /></button>)}<label className="avatar-upload">画像を選ぶ<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCoachAvatar(file); }} /></label></div><p>JPEG・PNG・WebPに対応。中央を正方形に切り抜き、512pxへ自動調整します。</p></fieldset>
            <div className="staff-profile-fields">
              <label>表示名<input value={coachProfile.displayName} onChange={(event) => setCoachProfile({ ...coachProfile, displayName: event.target.value })} placeholder="例：三宅コーチ" required /></label>
              <label>肩書き・ひとこと<input value={coachProfile.headline} onChange={(event) => setCoachProfile({ ...coachProfile, headline: event.target.value })} placeholder="例：行動の理由を一緒に考えます" /></label>
              <label>経歴・資格<textarea rows={3} value={coachProfile.credentials} onChange={(event) => setCoachProfile({ ...coachProfile, credentials: event.target.value })} placeholder="保有資格、経験など" /></label>
              <label>自己紹介<textarea rows={5} value={coachProfile.bio} onChange={(event) => setCoachProfile({ ...coachProfile, bio: event.target.value })} placeholder="オーナーへ伝えたいサポート方針など" /></label>
              <label>予備のGoogle Meet URL<input type="url" value={coachProfile.meetUrl} onChange={(event) => setCoachProfile({ ...coachProfile, meetUrl: event.target.value })} placeholder="https://meet.google.com/xxx-xxxx-xxx" /><small>Calendar未連携時に使用する予備URLです。</small></label>
            </div>
            <section className={`google-calendar-card ${googleCalendar.connected ? "is-connected" : ""} ${!googleCalendar.configured ? "has-error" : ""}`}><div className="google-calendar-mark">G</div><div><p className="card-label">GOOGLE CALENDAR</p><h3>{googleCalendar.connected ? "カレンダー連携済み" : !googleCalendar.configured ? "連携設定を確認してください" : "Google Calendarを連携"}</h3><p>{googleCalendar.connected ? `${googleCalendar.email} · 予約時にMeet予定を自動作成します。` : "予定あり時間を予約枠から除外し、予約確定時にGoogle Meet付き予定を作成します。"}</p>{googleCalendar.configurationError && <small>設定確認：{googleCalendar.configurationError}</small>}{googleCalendar.error && <small>同期エラー：{googleCalendar.error}</small>}</div>{googleCalendar.connected ? <button type="button" className="secondary" onClick={() => void disconnectGoogleCalendar()}>連携解除</button> : <button type="button" onClick={() => void connectGoogleCalendar()} disabled={saving || !googleCalendar.configured}>Googleと連携</button>}</section>
            <button className="staff-save-button" disabled={saving}>{saving ? "保存中…" : "プロフィールを保存"}</button>
          </form>
        )}
        {adminTab === "accounts" && (
          <div className="account-directory">
            <section className="account-overview">
              <div><small>登録ユーザー</small><strong>{adminAccounts.length}<span>人</span></strong><p>OWNER {accountRoleCounts.owner} · COACH {accountRoleCounts.coach} · ADMIN {accountRoleCounts.admin}</p></div>
              <span>一覧更新<br /><b>{lastAdminRefresh ? lastAdminRefresh.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "確認中"}</b></span>
            </section>
            <nav className="account-filters" aria-label="権限で絞り込み">
              {(["all", "owner", "coach", "admin"] as const).map((role) => <button key={role} className={adminAccountFilter === role ? "is-selected" : ""} onClick={() => setAdminAccountFilter(role)}>{role === "all" ? "全員" : role.toUpperCase()}<b>{role === "all" ? adminAccounts.length : accountRoleCounts[role]}</b></button>)}
            </nav>
            <div className="account-list">
            {filteredAdminAccounts.map((account) => {
              const isMe = account.userId === currentUserId;
              const coachAccounts = adminAccounts.filter((item) => item.role === "coach");
              return (
                <article className="admin-account" key={account.userId}>
                  <div className="admin-account-main">
                    <span>{account.role === "owner" ? <NavGlyph name="profile" /> : <NavGlyph name="coach" />}</span>
                    <div><strong>{account.displayName || account.email}</strong><small>{account.email} · 最終ログイン {account.lastSignInAt ? new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(account.lastSignInAt)) : "未確認"}</small></div>
                    <b className={account.role}>{account.role.toUpperCase()}</b>
                  </div>
                  <div className="admin-account-actions">
                    <label className="account-name-field">ユーザー名<span><input value={adminNameDrafts[account.userId] ?? ""} onChange={(event) => setAdminNameDrafts((current) => ({ ...current, [account.userId]: event.target.value }))} placeholder="管理用の名前" maxLength={60} /><button onClick={() => void saveAccountDisplayName(account)} disabled={saving || !(adminNameDrafts[account.userId] ?? "").trim()}>保存</button></span></label>
                    {account.role === "owner" && <label>担当コーチ<select value={account.assignedCoachId ?? ""} onChange={(event) => void assignCustomerToCoach(account, event.target.value)} disabled={saving || !account.dogId}><option value="">{account.dogId ? "未割り当て" : "愛犬未登録"}</option>{coachAccounts.map((coach) => <option key={coach.userId} value={coach.userId}>{coach.email}</option>)}</select></label>}
                    <label>権限<select value={account.role} onChange={(event) => void changeAccountRole(account, event.target.value as UserRole)} disabled={saving || isMe}><option value="owner">飼い主</option><option value="coach">コーチ</option><option value="admin">管理者</option></select></label>
                  </div>
                </article>
              );
            })}
            {!adminAccounts.length && <section className="admin-empty"><h2>{adminAccountsError ? "ユーザー情報を取得できません" : "登録ユーザーはまだいません"}</h2><p>{adminAccountsError || "新規登録されたユーザーがここに表示されます。"}</p></section>}
            {!!adminAccounts.length && !filteredAdminAccounts.length && <section className="admin-empty"><h2>該当するユーザーはいません</h2><p>別の権限フィルターを選択してください。</p></section>}
            </div>
          </div>
        )}
        </>}
      </main>
      <div className={`toast ${notice ? "show" : ""}`} role="status">{notice}</div>
    </div>
  );

  if (!authReady) return <div className="auth-loading"><span className="loading-paw"><CareIcon name="paws" /></span><p>うちの子の記録を開いています…</p></div>;
  if (!authenticated || anonymousUser) return authView;
  if (userRole === "owner" && onboardingRequired) return onboardingView;
  if ((userRole === "coach" || userRole === "admin") && staffMode === "staff") return adminView;

  return (
    <div className="app-stage">
      <div className="app-shell">
        <header className="app-header">
          <button className="wordmark" onClick={() => setView("home")} aria-label="Wan Tone ホームへ">
            <strong>Wan Tone</strong><span>by BarKnow</span>
          </button>
          <div className="app-header-actions">
            {(userRole === "admin" || userRole === "coach") && <button className="owner-admin-switch" onClick={() => setStaffMode("staff")}><NavGlyph name="coach" /><span>{userRole === "admin" ? "管理画面" : "コーチ画面"}</span></button>}
          </div>
        </header>
        <main className={`app-main ${view === "home" ? "home-flat" : ""}`}>
          {view === "home" && focusedHomeView}
          {view === "goals" && goalsView}
          {view === "record" && recordView}
          {view === "report" && reportView}
          {view === "coach" && coachView}
          {view === "profile" && profileView}
        </main>
        <nav className="bottom-nav" aria-label="メインメニュー">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Icon><NavGlyph name="home" /></Icon><span>ホーム</span></button>
          <button className={view === "report" ? "active" : ""} onClick={() => setView("report")}><Icon><NavGlyph name="report" /></Icon><span>変化</span></button>
          <button className={view === "record" ? "active" : ""} onClick={() => openNewRecord()}><Icon><NavGlyph name="record" /></Icon><span>記録</span></button>
          <button className={view === "coach" ? "active" : ""} onClick={() => setView("coach")}><Icon><NavGlyph name="coach" /></Icon><span>コーチ</span></button>
          <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><Icon><NavGlyph name="profile" /></Icon><span>設定</span></button>
        </nav>
        {celebration && (
          <div className="celebration-backdrop" role="dialog" aria-modal="true" aria-labelledby="celebration-title" onClick={() => setCelebration(null)}>
            <div className="celebration-card" onClick={(event) => event.stopPropagation()}>
              <div className="celebration-rays" aria-hidden="true">✦</div>
              <span className="celebration-paw"><CareIcon name="paws" /></span>
              <p>SMALL WIN</p>
              <h2 id="celebration-title">{celebration.title}</h2>
              <span>{celebration.message}</span>
              <button onClick={() => setCelebration(null)}>今日のできたを喜ぶ</button>
            </div>
          </div>
        )}
        <div className={`toast ${notice ? "show" : ""}`} role="status">{notice}</div>
      </div>
    </div>
  );
}
