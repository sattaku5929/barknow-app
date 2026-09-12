"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
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
type CoachingStatus = "submitted" | "assigned" | "consulting" | "payment_pending" | "active" | "closed";

type DogProfile = {
  id?: string;
  name: string;
  breed: string;
  birthday: string;
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
  createdAt: string;
};

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
  role: UserRole;
  dogId: string | null;
  dogName: string;
  assignedCoachId: string | null;
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
  submittedAt: string;
};

type AdminCoachingApplication = CoachingApplication & {
  ownerId: string;
  dogId: string;
  dogName: string;
  ownerEmail: string;
  coachEmail: string | null;
};

const PROFILE_KEY = "wan-tone-profile-v1";
const RECORDS_KEY = "wan-tone-records-v1";
const MESSAGES_KEY = "wan-tone-messages-v1";
const CUSTOM_BEHAVIORS_KEY = "wan-tone-custom-behaviors-v1";
const CARE_GOALS_KEY = "wan-tone-care-goals-v1";
const GOAL_COMPLETIONS_KEY = "wan-tone-goal-completions-v1";
const REMINDER_SENT_KEY = "wan-tone-reminder-sent-v1";

const initialProfile: DogProfile = { name: "", breed: "", birthday: "" };

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
    home: <><path d="m4 11 8-7 8 7" /><path d="M6.5 10v9h11v-9M10 19v-5h4v5" /></>,
    goals: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 10 2 2 4-4M8 16h8" /></>,
    report: <><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></>,
    record: <><path d="M12 5v14M5 12h14" /></>,
    coach: <><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M8 10h8M8 13h5" /></>,
    profile: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6" /></>,
  };
  return <svg viewBox="0 0 24 24">{paths[name]}</svg>;
}

function CareIcon({ name }: { name: CareGoalType }) {
  const paths: Record<CareGoalType, ReactNode> = {
    brush: <><path d="M5 4h10v5H5zM7 9v11M10 9v11M13 9v11" /><path d="M15 5h4v3h-4" /></>,
    teeth: <path d="M8 3c-3 0-4 2.5-3 5 1 2.5 1 4.5 1.5 8 .4 2.7 2.7 5 3.5 1l.5-3c.2-1 2.8-1 3 0l.5 3c.8 4 3.1 1.7 3.5-1 .5-3.5.5-5.5 1.5-8 1-2.5 0-5-3-5-1.5 0-2.5 1-4 1s-2.5-1-4-1Z" />,
    paws: <><ellipse cx="12" cy="15.5" rx="4.7" ry="4" /><ellipse cx="6.8" cy="10" rx="2" ry="2.6" transform="rotate(-25 6.8 10)" /><ellipse cx="11" cy="7.5" rx="2" ry="2.6" /><ellipse cx="16" cy="9" rx="2" ry="2.6" transform="rotate(25 16 9)" /></>,
    bath: <><path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-3Z" /><path d="M7 11V7a3 3 0 0 1 6 0M3 11h18M7 20v1M17 20v1" /></>,
    nails: <><path d="M8 4c2 2 3 4 2 7l-2 7M16 4c-2 2-3 4-2 7l2 7" /><path d="M6 18h4M14 18h4" /></>,
    ears: <><path d="M12 5c-5-4-8 0-6 5 1 3 3 5 6 7 3-2 5-4 6-7 2-5-1-9-6-5Z" /><path d="M9 8c2 1 4 1 6 0" /></>,
    training: <><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    custom: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M8 12h8" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function TopicIcon({ name }: { name: RecordCategory }) {
  const paths: Record<RecordCategory, ReactNode> = {
    daily: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6" /></>,
    meal: <><path d="M4 11h16c-.6 5.2-3.2 8-8 8s-7.4-2.8-8-8Z" /><path d="M7 8c1.2-1.3 2.9-2 5-2s3.8.7 5 2M9 4c.8-.7 1.8-1 3-1s2.2.3 3 1" /></>,
    barking: <><path d="m5 9-2-3v7c0 4 3 7 7 7s7-3 7-7V6l-2 3" /><circle cx="8" cy="12" r=".7" fill="currentColor" stroke="none" /><circle cx="13" cy="12" r=".7" fill="currentColor" stroke="none" /><path d="M8 16c1.3 1 2.7 1 4 0M20 9c1 1 1 3 0 4" /></>,
    toilet: <><path d="M12 3c-2.8 4-5 6.8-5 10a5 5 0 0 0 10 0c0-3.2-2.2-6-5-10Z" /><path d="M10 15c.7.7 1.3 1 2 1s1.3-.3 2-1" /></>,
    walk: <><ellipse cx="12" cy="15.5" rx="4.7" ry="4" /><ellipse cx="6.8" cy="10" rx="2" ry="2.6" transform="rotate(-25 6.8 10)" /><ellipse cx="11" cy="7.5" rx="2" ry="2.6" /><ellipse cx="16" cy="9" rx="2" ry="2.6" transform="rotate(25 16 9)" /></>,
    sleep: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    win: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
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
  const [adminApplications, setAdminApplications] = useState<AdminCoachingApplication[]>([]);
  const [adminTab, setAdminTab] = useState<"applications" | "customers" | "accounts">("applications");
  const [lastAdminRefresh, setLastAdminRefresh] = useState<Date | null>(null);
  const [selectedAdminCustomer, setSelectedAdminCustomer] = useState<AdminCustomer | null>(null);
  const [adminDetailRecords, setAdminDetailRecords] = useState<DailyRecord[]>([]);
  const [adminDetailMessages, setAdminDetailMessages] = useState<CoachMessage[]>([]);
  const [adminDetailGoals, setAdminDetailGoals] = useState<AdminGoalProgress[]>([]);
  const [adminDetailLoading, setAdminDetailLoading] = useState(false);
  const [adminReply, setAdminReply] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [view, setView] = useState<View>("home");
  const [connection, setConnection] = useState<Connection>("checking");
  const [profile, setProfile] = useState<DogProfile>(initialProfile);
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
  const [draftMessage, setDraftMessage] = useState("");
  const [coachingApplication, setCoachingApplication] = useState<CoachingApplication | null>(null);
  const [coachingConcerns, setCoachingConcerns] = useState<string[]>([]);
  const [coachingOutcome, setCoachingOutcome] = useState("");
  const [coachingNote, setCoachingNote] = useState("");
  const [calendarMode, setCalendarMode] = useState<"week" | "month">("week");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(today());
  const [careGoals, setCareGoals] = useState<CareGoal[]>([]);
  const [goalCompletions, setGoalCompletions] = useState<GoalCompletion[]>([]);
  const [customGoalTitle, setCustomGoalTitle] = useState("");
  const [customGoalCount, setCustomGoalCount] = useState(1);
  const [customGoalPeriod, setCustomGoalPeriod] = useState<GoalPeriod>("week");
  const [celebration, setCelebration] = useState<{ title: string; message: string } | null>(null);

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
        dogId: String(item.dog_id),
        dogName: String(item.dog_name ?? "名前未登録"),
        breed: String(item.breed ?? "犬種未登録"),
        records7d: Number(item.records_7d ?? 0),
        concerns7d: Number(item.concerns_7d ?? 0),
        latestMessage: String(item.latest_message ?? ""),
        latestMessageAt: item.latest_message_at ? String(item.latest_message_at) : null,
      })));
    }
    if (!accountResult.error && accountResult.data) {
      setAdminAccounts(accountResult.data.map((item: Record<string, unknown>) => ({
        userId: String(item.user_id),
        email: String(item.email ?? "メール未確認"),
        role: item.role === "admin" ? "admin" : item.role === "coach" ? "coach" : "owner",
        dogId: item.dog_id ? String(item.dog_id) : null,
        dogName: String(item.dog_name ?? "愛犬未登録"),
        assignedCoachId: item.assigned_coach_id ? String(item.assigned_coach_id) : null,
      })));
    }
    if (!applicationResult.error && applicationResult.data) {
      setAdminApplications(applicationResult.data.map((item: Record<string, unknown>) => ({
        id: String(item.application_id),
        ownerId: String(item.owner_id),
        dogId: String(item.dog_id),
        dogName: String(item.dog_name ?? "名前未登録"),
        ownerEmail: String(item.owner_email ?? "メール未確認"),
        status: String(item.status) as CoachingStatus,
        concernCategories: Array.isArray(item.concern_categories) ? item.concern_categories.map(String) : [],
        desiredOutcome: String(item.desired_outcome ?? ""),
        note: String(item.note ?? ""),
        assignedCoachId: item.assigned_coach_id ? String(item.assigned_coach_id) : null,
        coachEmail: item.coach_email ? String(item.coach_email) : null,
        submittedAt: String(item.submitted_at),
      })));
    }
    setLastAdminRefresh(new Date());
  }

  useEffect(() => {
    const localProfile = readLocal(PROFILE_KEY, initialProfile);
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
    const localMessages = readLocal<CoachMessage[]>(MESSAGES_KEY, []);
    const localCareGoals = readLocal<CareGoal[]>(CARE_GOALS_KEY, []).map((goal) => ({ ...goal, reminderTime: goal.reminderTime ?? null }));
    const localGoalCompletions = readLocal<GoalCompletion[]>(GOAL_COMPLETIONS_KEY, []);
    const savedCustomBehaviors = readLocal<string[]>(CUSTOM_BEHAVIORS_KEY, []);
    const localCustomBehaviors = localRecords
      .flatMap((record) => record.behaviorCustomTexts ?? [])
      .map((label) => label.trim())
      .filter(Boolean);
    const initialCustomBehaviors = Array.from(new Set([...savedCustomBehaviors, ...localCustomBehaviors])).slice(0, 12);
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
          if (role === "coach") {
            setConnection("online");
            return;
          }
        }

        const [dogResult, recordResult, messageResult] = await Promise.all([
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
            .select("id,sender,body,created_at")
            .eq("owner_id", userId)
            .order("created_at", { ascending: true })
            .limit(50),
        ]);

        if (dogResult.error || recordResult.error || messageResult.error) throw new Error("Schema unavailable");
        if (dogResult.data) {
          const remoteProfile = {
            id: dogResult.data.id,
            name: dogResult.data.name,
            breed: dogResult.data.breed ?? "",
            birthday: dogResult.data.birthday ?? "",
          };
          setProfile(remoteProfile);
          writeLocal(PROFILE_KEY, remoteProfile);
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
          const remoteMessages = messageResult.data.map((item) => ({
            id: item.id,
            sender: item.sender as "owner" | "coach",
            body: item.body,
            createdAt: item.created_at,
          }));
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
            .select("id,status,concern_categories,desired_outcome,note,assigned_coach_id,submitted_at")
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

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
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
    setAdminReply("");
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 29).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const [recordResult, messageResult, goalResult, completionResult] = await Promise.all([
      supabase
        .from("wt_daily_records")
        .select("id,category,recorded_on,recorded_time,duration_minutes,behavior_type,behavior_types,behavior_custom_text,behavior_custom_texts,behavior_intensity,mood,appetite,activity,toilet,sleep,behavior_note,good_moment")
        .eq("dog_id", customer.dogId)
        .order("recorded_on", { ascending: false })
        .order("recorded_time", { ascending: false })
        .limit(100),
      supabase
        .from("wt_coach_messages")
        .select("id,sender,body,created_at")
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
    ]);

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
    const detailMessages: CoachMessage[] = (messageResult.data ?? []).map((item) => ({
      id: item.id,
      sender: item.sender as "owner" | "coach",
      body: item.body,
      createdAt: item.created_at,
    }));
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

  async function sendAdminReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAdminCustomer || !adminReply.trim()) return;
    setSaving(true);
    const body = adminReply.trim();
    const { data, error } = await supabase
      .from("wt_coach_messages")
      .insert({
        owner_id: selectedAdminCustomer.ownerId,
        dog_id: selectedAdminCustomer.dogId,
        sender: "coach",
        body,
      })
      .select("id,sender,body,created_at")
      .single();
    if (error) showNotice(`返信できませんでした（${error.message}）`);
    else if (data) {
      setAdminDetailMessages((current) => [...current, { id: data.id, sender: "coach", body: data.body, createdAt: data.created_at }]);
      setAdminReply("");
      showNotice("メッセージを送りました");
      await loadAdminWorkspace();
    }
    setSaving(false);
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
        .select("id,status,concern_categories,desired_outcome,note,assigned_coach_id,submitted_at")
        .single();
      if (error) throw error;
      setCoachingApplication({
        id: data.id,
        status: data.status as CoachingStatus,
        concernCategories: data.concern_categories ?? [],
        desiredOutcome: data.desired_outcome,
        note: data.note ?? "",
        assignedCoachId: data.assigned_coach_id ?? null,
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
    if (error) showNotice(`担当を設定できませんでした（${error.message}）`);
    else {
      showNotice(`${application.dogName}の担当コーチを設定しました`);
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
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
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
        const { data, error } = await supabase
          .from("wt_dogs")
          .upsert(
            {
              owner_id: userId,
              name: profile.name,
              breed: profile.breed || null,
              birthday: profile.birthday || null,
            },
            { onConflict: "owner_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draftMessage.trim();
    if (!body) return;
    setSaving(true);
    let nextMessage: CoachMessage = {
      id: crypto.randomUUID(),
      sender: "owner",
      body,
      createdAt: new Date().toISOString(),
    };
    try {
      if (connection === "online") {
        const userId = await getUserId();
        if (!userId) throw new Error("No session");
        const dogId = await ensureRemoteDog(userId);
        const { data, error } = await supabase
          .from("wt_coach_messages")
          .insert({ owner_id: userId, dog_id: dogId, sender: "owner", body })
          .select("id,created_at")
          .single();
        if (error) throw error;
        nextMessage = { ...nextMessage, id: data.id, createdAt: data.created_at };
        showNotice("コーチに相談を送信しました");
      } else {
        showNotice("相談メモを保存しました。接続後に送信できます");
      }
    } catch {
      setConnection("local");
      showNotice("相談メモを端末に保存しました");
    } finally {
      const nextMessages = [...messages, nextMessage];
      setMessages(nextMessages);
      writeLocal(MESSAGES_KEY, nextMessages);
      setDraftMessage("");
      setSaving(false);
    }
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
          <div><p className="card-label">TODAY'S CARE</p><h2 id="care-today-title">今日やること</h2></div>
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
          <div><p className="card-label">TODAY'S RHYTHM</p><h2 id="today-rhythm-title">今日のリズム</h2></div>
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
              : coachingApplication.status === "assigned" ? "担当コーチが決まりました"
                : coachingApplication.status === "payment_pending" ? "一緒に進める準備ができました"
                  : coachingApplication.status === "active" ? "記録を、コーチと変化につなげる"
                    : "コーチと相談を続ける"
            : recentConcernCount > 0 ? `「気になる」が${recentConcernCount}件。記録を答えにつなげませんか。`
              : recentBehaviorCount > 0 ? "困りごとの記録を、次の一歩へ。"
                : "記録するだけで、終わらせない。"}</h2>
          <p>{coachingApplication
            ? coachingApplication.status === "submitted" ? "内容を確認後、あなたと愛犬に合うコーチをご案内します。"
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

      <section className="today-mission" aria-labelledby="today-mission-title">
        <div className="mission-head">
          <div><p className="card-label">TODAY</p><h2 id="today-mission-title">今日のお世話</h2></div>
          <div className="mission-score"><strong>{completedGoalCount}</strong><span>/{careGoals.length || "–"}</span></div>
        </div>
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

      <button className="primary-button report-add" onClick={() => { openNewRecord("barking"); reportBehaviorType === "other" ? setBehaviorTypes([]) : setBehaviorTypes([reportBehaviorType]); }}>{behaviorInfo(reportBehaviorType).label}を記録する<span>→</span></button>
      <p className="report-note">表示しているのは記録回数の変化です。記録漏れや生活リズムも影響するため、実際の発生回数や因果関係を断定するものではありません。</p>
    </section>
  );

  const coachingChatOpen = coachingApplication && ["assigned", "consulting", "payment_pending", "active"].includes(coachingApplication.status);
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
      ) : coachingApplication.status === "submitted" ? (
        <section className="coaching-pending">
          <span className="coaching-pending-paw"><CareIcon name="paws" /></span>
          <p className="card-label">APPLICATION RECEIVED</p>
          <h2>相談を受け付けました</h2>
          <p>内容とこれまでの記録を確認し、合いそうなコーチをご案内します。</p>
          <div className="coaching-steps"><span className="is-current"><b>✓</b>申込み</span><span><b>2</b>担当決定</span><span><b>3</b>初回相談</span></div>
          <div className="application-summary"><small>相談テーマ</small><p>{coachingApplication.concernCategories.map(coachingConcernLabel).join("・")}</p><small>目指したい状態</small><p>{coachingApplication.desiredOutcome}</p></div>
        </section>
      ) : (
        <>
          <section className="coach-assigned-card">
            <div className="coach-avatar"><NavGlyph name="coach" /></div>
            <div><p className="card-label">YOUR COACH</p><h2>担当コーチとつながりました</h2><p>記録を見ながら、まずは今いちばん気になることから話しましょう。</p></div>
            <b>{coachingStatusLabel(coachingApplication.status)}</b>
          </section>
          <div className="connection-note"><span className={connection}></span>{connection === "online" ? "コーチルームに接続中" : connection === "checking" ? "接続を確認しています" : "端末保存モード"}</div>
          <div className="message-list" aria-live="polite">
            {messages.length ? messages.map((message) => (
              <div key={message.id} className={`message ${message.sender}`}>
                <span>{message.sender === "coach" ? "COACH" : "YOU"}</span>
                <p>{message.body}</p>
                <time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</time>
              </div>
            )) : <div className="coach-empty"><div className="coach-avatar"><NavGlyph name="coach" /></div><h3>担当コーチへ、最初のメッセージを。</h3><p>例：いちばん困っているのは散歩中の引っ張りです。記録のどこを見ればよいですか？</p></div>}
          </div>
          <form className="message-form" onSubmit={sendMessage}>
            <label htmlFor="coach-message">相談内容</label>
            <textarea id="coach-message" rows={4} value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} placeholder="困っている場面や、試したことを書いてください" required />
            <button className="primary-button" disabled={saving}>{saving ? "送信中…" : connection === "online" ? "コーチに送る" : "相談メモを保存"}<span>→</span></button>
          </form>
        </>
      )}
    </section>
  );

  const profileView = (
    <form className="screen-form" onSubmit={saveProfile}>
      <SectionTitle eyebrow="PROFILE" title="愛犬プロフィール" />
      <p className="lead">コーチがその子らしさを理解するための、基本情報です。</p>
      <div className="profile-symbol">{profile.name ? profile.name.slice(0, 1) : "犬"}</div>
      <label className="field-label">名前<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="例：むぎ" required /></label>
      <label className="field-label">犬種<input value={profile.breed} onChange={(event) => setProfile({ ...profile, breed: event.target.value })} placeholder="例：トイプードル" /></label>
      <label className="field-label">誕生日<input type="date" value={profile.birthday} onChange={(event) => setProfile({ ...profile, birthday: event.target.value })} /></label>
      <div className="privacy-card"><strong>記録について</strong><p>登録した情報は、あなたと担当コーチのサポートのために使用します。共有範囲は今後プロフィールから管理できるようにします。</p></div>
      <button className="primary-button" disabled={saving}>{saving ? "保存中…" : "プロフィールを保存"}<span>→</span></button>
      <div className="account-card"><span><small>ログイン中</small><strong>{userEmail}</strong></span><button type="button" onClick={() => void signOut()}>ログアウト</button></div>
    </form>
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

  const adminView = (
    <div className="admin-stage">
      <header className="admin-header">
        <div><p>WAN TONE</p><strong>{userRole === "admin" ? "Admin Console" : "Coach Console"}</strong></div>
        <div className="admin-header-actions">
          {userRole === "admin" && <button className="mode-switch" onClick={() => { setStaffMode("owner"); setView("home"); }}>飼い主画面へ</button>}
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
                  <div className="admin-chat-history">{adminDetailMessages.map((message) => <article className={message.sender} key={message.id}><small>{message.sender === "coach" ? "コーチ" : "飼い主"}</small><p>{message.body}</p><time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</time></article>)}{!adminDetailMessages.length && <p className="admin-muted">まだ相談はありません。コーチから声をかけることもできます。</p>}</div>
                  <form className="admin-reply" onSubmit={sendAdminReply}><textarea value={adminReply} onChange={(event) => setAdminReply(event.target.value)} placeholder={`${selectedAdminCustomer.dogName}の飼い主へメッセージ`} rows={3} /><button disabled={saving || !adminReply.trim()}>{saving ? "送信中…" : "送信する"}</button></form>
                </section>
              </>
            )}
          </div>
        ) : <>
        <section className="admin-welcome"><div><p className="card-label">{userRole === "admin" ? "ADMIN CONSOLE" : "COACH CONSOLE"}</p><h1>{adminTab === "applications" ? "コーチング申込み" : adminTab === "customers" ? (userRole === "admin" ? "すべての担当顧客" : "担当のお客様") : "ユーザー管理"}</h1><span>{adminTab === "applications" ? "相談内容を確認し、合いそうなコーチへつなぐ。" : adminTab === "customers" ? "記録の変化を見て、必要なタイミングで声をかける。" : "権限と担当コーチを、この画面で設定できます。"}</span></div><b>{adminTab === "applications" ? adminApplications.length : adminTab === "customers" ? adminCustomers.length : adminAccounts.length}<small>件</small></b></section>
        {userRole === "admin" && <nav className="admin-tabs has-three" aria-label="管理メニュー"><button className={adminTab === "applications" ? "is-selected" : ""} onClick={() => setAdminTab("applications")}>申込み{pendingApplicationCount > 0 && <b>{pendingApplicationCount}</b>}</button><button className={adminTab === "customers" ? "is-selected" : ""} onClick={() => setAdminTab("customers")}>担当顧客</button><button className={adminTab === "accounts" ? "is-selected" : ""} onClick={() => setAdminTab("accounts")}>ユーザー</button></nav>}
        {adminTab === "applications" && <div className="admin-inbox-status"><span><i className={pendingApplicationCount ? "has-new" : ""}></i>{pendingApplicationCount ? `未対応の申込みが${pendingApplicationCount}件あります` : "未対応の申込みはありません"}<small>{lastAdminRefresh ? `${lastAdminRefresh.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}更新 · 30秒ごとに自動確認` : "確認中"}</small></span><button onClick={() => void loadAdminWorkspace()}>今すぐ更新</button></div>}
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
                    <label>担当コーチ<select value={application.assignedCoachId ?? ""} onChange={(event) => void assignCoachingApplication(application, event.target.value)} disabled={saving}><option value="">選択してください</option>{coaches.map((coach) => <option value={coach.userId} key={coach.userId}>{coach.email}</option>)}</select></label>
                    <label>進行状況<select value={application.status} onChange={(event) => void updateCoachingStatus(application, event.target.value as CoachingStatus)} disabled={saving}><option value="submitted">受付中</option><option value="assigned" disabled={!application.assignedCoachId}>担当決定</option><option value="consulting" disabled={!application.assignedCoachId}>初回相談中</option><option value="payment_pending" disabled={!application.assignedCoachId}>お支払い待ち</option><option value="active" disabled={!application.assignedCoachId}>利用中</option><option value="closed">終了</option></select></label>
                  </div>
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
                <div className="customer-stats"><span><b>{customer.records7d}</b>7日間の記録</span><span><b>{customer.concerns7d}</b>気になる記録</span></div>
                <div className="customer-message"><small>最新の相談</small><p>{customer.latestMessage || "相談はまだありません"}</p></div>
                <button onClick={() => void openAdminCustomer(customer)}>詳細とチャットを見る →</button>
              </article>
            ))}
          </div>
        ) : (
          <section className="admin-empty"><span><NavGlyph name="coach" /></span><h2>担当のお客様はまだいません</h2><p>「ユーザー管理」から、愛犬を自分の担当へ追加できます。</p></section>
        ))}
        {adminTab === "accounts" && (
          <div className="account-list">
            {adminAccounts.map((account) => {
              const isMe = account.userId === currentUserId;
              const coachAccounts = adminAccounts.filter((item) => item.role === "coach");
              return (
                <article className="admin-account" key={account.userId}>
                  <div className="admin-account-main">
                    <span>{account.role === "owner" ? <NavGlyph name="profile" /> : <NavGlyph name="coach" />}</span>
                    <div><strong>{account.email}</strong><small>{account.role === "admin" ? `管理者${isMe ? "（自分）" : ""}` : account.role === "coach" ? "コーチ" : account.dogName}</small></div>
                    <b className={account.role}>{account.role.toUpperCase()}</b>
                  </div>
                  <div className="admin-account-actions">
                    {account.role === "owner" && <label>担当コーチ<select value={account.assignedCoachId ?? ""} onChange={(event) => void assignCustomerToCoach(account, event.target.value)} disabled={saving || !account.dogId}><option value="">{account.dogId ? "未割り当て" : "愛犬未登録"}</option>{coachAccounts.map((coach) => <option key={coach.userId} value={coach.userId}>{coach.email}</option>)}</select></label>}
                    <label>権限<select value={account.role} onChange={(event) => void changeAccountRole(account, event.target.value as UserRole)} disabled={saving || isMe}><option value="owner">飼い主</option><option value="coach">コーチ</option><option value="admin">管理者</option></select></label>
                  </div>
                </article>
              );
            })}
            {!adminAccounts.length && <section className="admin-empty"><h2>ユーザー情報を取得できません</h2><p>migration 009を実行すると、この画面から管理できます。</p></section>}
          </div>
        )}
        </>}
      </main>
      <div className={`toast ${notice ? "show" : ""}`} role="status">{notice}</div>
    </div>
  );

  if (!authReady) return <div className="auth-loading"><span className="loading-paw"><CareIcon name="paws" /></span><p>うちの子の記録を開いています…</p></div>;
  if (!authenticated || anonymousUser) return authView;
  if (userRole === "coach" || (userRole === "admin" && staffMode === "staff")) return adminView;

  return (
    <div className="app-stage">
      <div className="app-shell">
        <header className="app-header">
          <button className="wordmark" onClick={() => setView("home")} aria-label="Wan Tone ホームへ">
            <strong>Wan Tone</strong><span>by BarKnow</span>
          </button>
          <div className="app-header-actions">
            {userRole === "admin" && <button className="owner-admin-switch" onClick={() => setStaffMode("staff")}><NavGlyph name="coach" /><span>管理画面</span></button>}
            <div className="header-status"><span className={connection}></span>{connection === "online" ? "同期中" : connection === "checking" ? "確認中" : "端末保存"}</div>
          </div>
        </header>
        <main className="app-main">
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
