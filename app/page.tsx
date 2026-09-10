"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type View = "home" | "record" | "report" | "coach" | "profile";
type Connection = "checking" | "online" | "local";
type Status = "良い" | "ふつう" | "気になる";
type RecordCategory = "daily" | "meal" | "barking" | "toilet" | "walk" | "sleep" | "win";
type BehaviorType = "barking" | "nipping" | "toilet_accident" | "jumping" | "pulling" | "other";

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

const PROFILE_KEY = "wan-tone-profile-v1";
const RECORDS_KEY = "wan-tone-records-v1";
const MESSAGES_KEY = "wan-tone-messages-v1";
const CUSTOM_BEHAVIORS_KEY = "wan-tone-custom-behaviors-v1";

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
  { id: "sleep", label: "睡眠", icon: "sleep", description: "眠り・休息", noteLabel: "睡眠で気づいたこと", placeholder: "寝つき、夜中の様子、昼寝の長さなど" },
  { id: "win", label: "できた", icon: "win", description: "小さな成長", noteLabel: "今日できたこと", placeholder: "待てができた、落ち着いて挨拶できたなど" },
] as const satisfies readonly CategoryInfo[];

const BEHAVIOR_TYPES = [
  { id: "barking", label: "吠え", description: "来客・物音・要求など" },
  { id: "nipping", label: "甘噛み・噛む", description: "遊び中・興奮時など" },
  { id: "toilet_accident", label: "トイレ失敗", description: "場所・タイミングなど" },
  { id: "jumping", label: "飛びつき", description: "人・犬への反応など" },
  { id: "pulling", label: "引っ張り", description: "散歩中の場面など" },
  { id: "other", label: "その他", description: "気になる行動" },
] as const;

function behaviorInfo(type: BehaviorType | null | undefined) {
  return BEHAVIOR_TYPES.find((item) => item.id === type) ?? BEHAVIOR_TYPES[0];
}

function categoryInfo(category: RecordCategory | undefined): CategoryInfo {
  if (!category || category === "daily") {
    return { id: "daily", label: "まとめ", icon: "daily", description: "一日の記録", noteLabel: "気づいたこと", placeholder: "今日の様子" };
  }
  return RECORD_CATEGORIES.find((item) => item.id === category) ?? RECORD_CATEGORIES[0];
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

function NavGlyph({ name }: { name: "home" | "report" | "record" | "coach" | "profile" }) {
  const paths: Record<typeof name, ReactNode> = {
    home: <><path d="m4 11 8-7 8 7" /><path d="M6.5 10v9h11v-9M10 19v-5h4v5" /></>,
    report: <><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></>,
    record: <><path d="M12 5v14M5 12h14" /></>,
    coach: <><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /><path d="M8 10h8M8 13h5" /></>,
    profile: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6" /></>,
  };
  return <svg viewBox="0 0 24 24">{paths[name]}</svg>;
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
  const [calendarMode, setCalendarMode] = useState<"week" | "month">("week");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);

  const streak = useMemo(() => calculateStreak(records), [records]);
  const todaysRecord = records.find((record) => record.recordedOn === today());
  const dogName = profile.name || "愛犬";
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
        return { day, value, count: entries.length };
      }),
    };
  }, [calendarMonthOffset, records]);
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
    const savedCustomBehaviors = readLocal<string[]>(CUSTOM_BEHAVIORS_KEY, []);
    const localCustomBehaviors = localRecords
      .flatMap((record) => record.behaviorCustomTexts ?? [])
      .map((label) => label.trim())
      .filter(Boolean);
    const initialCustomBehaviors = Array.from(new Set([...savedCustomBehaviors, ...localCustomBehaviors])).slice(0, 12);
    setProfile(localProfile);
    setRecords(localRecords);
    setMessages(localMessages);
    setCustomBehaviorOptions(initialCustomBehaviors);
    writeLocal(CUSTOM_BEHAVIORS_KEY, initialCustomBehaviors);

    async function connect() {
      try {
        let { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          const result = await supabase.auth.signInAnonymously();
          if (result.error) throw result.error;
          sessionData = { session: result.data.session };
        }
        const userId = sessionData.session?.user.id;
        if (!userId) throw new Error("No active session");

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
        setConnection("online");
      } catch {
        setConnection("local");
      }
    }

    void connect();
  }, []);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
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

  const homeView = (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">TODAY WITH {dogName.toUpperCase()}</p><p className="today-date">{todayLabel}</p>
          <h1>{profile.name ? `${profile.name}ちゃん、今日も一緒に。` : "今日から、少しずつ。"}</h1>
          <p className="welcome-copy">今日の様子を、迷わず、すぐに。</p>
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

      <section className="today-rhythm" aria-labelledby="today-rhythm-title">
        <div className="today-rhythm-heading">
          <div><p className="card-label">TODAY'S RHYTHM</p><h2 id="today-rhythm-title">今日のリズム</h2></div>
          <div className={`daily-stamp ${todaysEntries.length ? "has-records" : ""}`}><strong>{todaysEntries.length}</strong><small>PAWS</small></div>
        </div>
        <div className="today-topic-grid">
          {RECORD_CATEGORIES.map((category) => {
            const count = todaysEntries.filter((record) => record.category === category.id).length;
            return (
              <button key={category.id} onClick={() => openNewRecord(category.id)} aria-label={`${category.label}を追加。今日${count}件`}>
                <span className="topic-mark"><TopicIcon name={category.icon} /></span>
                {count > 0 && <b>{count}</b>}
                <small>{category.label}</small>
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

      <section className="rhythm-card compact-week" aria-labelledby="rhythm-title">
        <div className="calendar-head">
          <div><p className="card-label">{calendarMode === "week" ? "THIS WEEK" : "MONTHLY LOG"}</p><h2 id="rhythm-title">記録カレンダー</h2></div>
          <div className="calendar-switch" aria-label="カレンダー表示">
            <button className={calendarMode === "week" ? "is-selected" : ""} onClick={() => setCalendarMode("week")}>週</button>
            <button className={calendarMode === "month" ? "is-selected" : ""} onClick={() => setCalendarMode("month")}>月</button>
          </div>
        </div>
        {calendarMode === "week" ? (
          <>
            <div className="week-dots">
              {recentDays.map((day) => (
                <div key={day.value} className={`week-day ${day.entries.length ? "is-recorded" : ""} ${day.value === today() ? "is-today" : ""}`}>
                  <span>{day.label}</span>
                  <i aria-label={day.entries.length ? `${day.value} ${day.entries.length}件記録済み` : `${day.value} 未記録`}>{day.entries.length ? (day.entries.length > 1 ? day.entries.length : "✓") : ""}</i>
                </div>
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
              <button onClick={() => setCalendarMonthOffset((value) => value - 1)} aria-label="前の月">‹</button>
              <strong>{monthlyCalendar.label}</strong>
              <button onClick={() => setCalendarMonthOffset((value) => Math.min(0, value + 1))} disabled={calendarMonthOffset === 0} aria-label="次の月">›</button>
            </div>
            <div className="month-weekdays">{["日","月","火","水","木","金","土"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="month-grid">
              {monthlyCalendar.cells.map((cell, index) => cell ? (
                <div key={cell.value} className={`month-cell ${cell.count ? "is-recorded" : ""} ${cell.count >= 3 ? "is-full" : ""} ${cell.value === today() ? "is-today" : ""}`} aria-label={`${cell.value} ${cell.count}件`}>
                  <span>{cell.day}</span>{cell.count > 0 && <b>{cell.count}</b>}
                </div>
              ) : <span className="month-cell is-empty" key={`empty-${index}`}></span>)}
            </div>
            <p className="month-legend"><span></span>記録あり　<strong></strong>3件以上</p>
          </div>
        )}
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

  const selectedCategory = recordCategory ? categoryInfo(recordCategory) : null;

  const recordView = !selectedCategory ? (
    <section className="topic-screen">
      <SectionTitle eyebrow="STEP 1 / 2" title="何を記録しますか？" />
      <p className="lead">テーマを選ぶと、必要な項目だけを表示します。</p>
      <div className="topic-grid">
        {RECORD_CATEGORIES.map((category) => (
          <button key={category.id} onClick={() => { setRecordTime(currentTime()); setRecordCategory(category.id); }}>
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
      <div className="selected-topic">
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

  const reportView = (
    <section className="report-screen">
      <SectionTitle eyebrow="PROGRESS REPORT" title="変化レポート" />
      <p className="lead">記録された回数から、困りごとの変化を振り返ります。</p>
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

      <button className="primary-button report-add" onClick={() => { openNewRecord("barking"); reportBehaviorType === "other" ? setBehaviorTypes([]) : setBehaviorTypes([reportBehaviorType]); }}>{behaviorInfo(reportBehaviorType).label}を記録する<span>→</span></button>
      <p className="report-note">表示しているのは記録回数の変化です。記録漏れや生活リズムも影響するため、実際の発生回数や因果関係を断定するものではありません。</p>
    </section>
  );

  const coachView = (
    <section className="coach-screen">
      <SectionTitle eyebrow="COACH ROOM" title="コーチに相談" />
      <p className="lead">記録だけでは伝わらないことも、ここで相談できます。</p>
      <div className="connection-note"><span className={connection}></span>{connection === "online" ? "コーチルームに接続中" : connection === "checking" ? "接続を確認しています" : "端末保存モード"}</div>
      <div className="message-list" aria-live="polite">
        {messages.length ? messages.map((message) => (
          <div key={message.id} className={`message ${message.sender}`}>
            <span>{message.sender === "coach" ? "COACH" : "YOU"}</span>
            <p>{message.body}</p>
            <time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(message.createdAt))}</time>
          </div>
        )) : <div className="coach-empty"><div className="coach-avatar">C</div><h3>気になることを、そのまま送ってください。</h3><p>例：散歩中の引っ張りが強いです。どんな場面を記録すると相談しやすいですか？</p></div>}
      </div>
      <form className="message-form" onSubmit={sendMessage}>
        <label htmlFor="coach-message">相談内容</label>
        <textarea id="coach-message" rows={4} value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} placeholder="困っている場面や、試したことを書いてください" required />
        <button className="primary-button" disabled={saving}>{saving ? "送信中…" : connection === "online" ? "コーチに送る" : "相談メモを保存"}<span>→</span></button>
      </form>
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
    </form>
  );

  return (
    <div className="app-stage">
      <div className="app-shell">
        <header className="app-header">
          <button className="wordmark" onClick={() => setView("home")} aria-label="Wan Tone ホームへ">
            <strong>Wan Tone</strong><span>by BarKnow</span>
          </button>
          <div className="header-status"><span className={connection}></span>{connection === "online" ? "同期中" : connection === "checking" ? "確認中" : "端末保存"}</div>
        </header>
        <main className="app-main">
          {view === "home" && homeView}
          {view === "record" && recordView}
          {view === "report" && reportView}
          {view === "coach" && coachView}
          {view === "profile" && profileView}
        </main>
        <nav className="bottom-nav" aria-label="メインメニュー">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Icon><NavGlyph name="home" /></Icon><span>ホーム</span></button>
          <button className={view === "report" ? "active" : ""} onClick={() => setView("report")}><Icon><NavGlyph name="report" /></Icon><span>レポート</span></button>
          <button className={view === "record" ? "active" : ""} onClick={() => openNewRecord()}><Icon><NavGlyph name="record" /></Icon><span>記録</span></button>
          <button className={view === "coach" ? "active" : ""} onClick={() => setView("coach")}><Icon><NavGlyph name="coach" /></Icon><span>コーチ</span></button>
          <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><Icon><NavGlyph name="profile" /></Icon><span>設定</span></button>
        </nav>
        <div className={`toast ${notice ? "show" : ""}`} role="status">{notice}</div>
      </div>
    </div>
  );
}
