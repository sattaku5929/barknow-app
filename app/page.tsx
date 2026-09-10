"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type View = "home" | "record" | "coach" | "profile";
type Connection = "checking" | "online" | "local";
type Status = "良い" | "ふつう" | "気になる";
type RecordCategory = "daily" | "meal" | "barking" | "toilet" | "walk" | "sleep" | "win";

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
  { id: "barking", label: "吠え", icon: "barking", description: "場面・きっかけ", noteLabel: "吠えた場面と、その前後", placeholder: "誰に、何に、いつ、どのくらい吠えたかなど" },
  { id: "toilet", label: "トイレ", icon: "toilet", description: "回数・状態", noteLabel: "トイレで気づいたこと", placeholder: "回数、場所、便の状態、失敗した場面など" },
  { id: "walk", label: "お散歩", icon: "walk", description: "歩き方・反応", noteLabel: "散歩中の様子", placeholder: "引っ張り、立ち止まり、犬や人への反応など" },
  { id: "sleep", label: "睡眠", icon: "sleep", description: "眠り・休息", noteLabel: "睡眠で気づいたこと", placeholder: "寝つき、夜中の様子、昼寝の長さなど" },
  { id: "win", label: "できた", icon: "win", description: "小さな成長", noteLabel: "今日できたこと", placeholder: "待てができた、落ち着いて挨拶できたなど" },
] as const satisfies readonly CategoryInfo[];

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

function Icon({ children }: { children: ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
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
  const [mood, setMood] = useState(3);
  const [appetite, setAppetite] = useState<Status>("ふつう");
  const [activity, setActivity] = useState<Status>("ふつう");
  const [toilet, setToilet] = useState<Status>("ふつう");
  const [sleep, setSleep] = useState<Status>("ふつう");
  const [behaviorNote, setBehaviorNote] = useState("");
  const [goodMoment, setGoodMoment] = useState("");
  const [draftMessage, setDraftMessage] = useState("");

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

  useEffect(() => {
    const localProfile = readLocal(PROFILE_KEY, initialProfile);
    const localRecords = readLocal<DailyRecord[]>(RECORDS_KEY, []).map((record) => ({
      ...record,
      category: record.category ?? "daily",
      recordedTime: record.recordedTime ?? "12:00",
      durationMinutes: record.durationMinutes ?? null,
    }));
    const localMessages = readLocal<CoachMessage[]>(MESSAGES_KEY, []);
    setProfile(localProfile);
    setRecords(localRecords);
    setMessages(localMessages);

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
            .select("id,category,recorded_on,recorded_time,duration_minutes,mood,appetite,activity,toilet,sleep,behavior_note,good_moment")
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
          const remoteRecords = recordResult.data.map((item) => ({
            id: item.id,
            category: (item.category as RecordCategory) ?? "daily",
            recordedOn: item.recorded_on,
            recordedTime: item.recorded_time?.slice(0, 5) ?? "12:00",
            durationMinutes: item.duration_minutes ?? null,
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
    setMood(3);
    setAppetite("ふつう");
    setActivity("ふつう");
    setToilet("ふつう");
    setSleep("ふつう");
    setBehaviorNote("");
    setGoodMoment("");
    setView("record");
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
        showNotice("今日の記録を保存しました");
      } else {
        showNotice("今日の記録をこの端末に保存しました");
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
          <p className="eyebrow">TODAY WITH {dogName.toUpperCase()}</p>
          <h1>{profile.name ? `${profile.name}ちゃん、今日も一緒に。` : "今日から、少しずつ。"}</h1>
          <p className="welcome-copy">小さな変化と、今日もかわいかった瞬間。毎日の記録がコーチとの会話につながります。</p>
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

      <section className="checkin-card">
        <div className="checkin-top">
          <div>
            <p className="card-label">今日のチェックイン</p>
            <h2>{todaysRecord ? "今日の記録ができました" : "今日のかわいいを、ひとつ。"}</h2>
          </div>
          <div className={`record-mark ${todaysRecord ? "is-done" : ""}`}>{todaysRecord ? "✓" : <span className="paw-mark" aria-hidden="true"><i></i><i></i><i></i><b></b></span>}</div>
        </div>
        <p>{todaysRecord ? "あとから何度でも書き直せます。" : "気になったことも、できたことも。1分で残せます。"}</p>
        <button className="primary-button" onClick={() => openNewRecord()}>
          {todaysRecord ? "今日の記録を見直す" : "今日の記録をつける"}<span>→</span>
        </button>
      </section>

      <section className="today-rhythm" aria-labelledby="today-rhythm-title">
        <div className="today-rhythm-heading">
          <div><p className="card-label">TODAY'S RHYTHM</p><h2 id="today-rhythm-title">今日のリズム</h2></div>
          <span>{todaysEntries.length}件</span>
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
      </section>

      <section className="streak-strip" aria-label="継続状況">
        <div><strong>{streak}</strong><span>日</span></div>
        <p>{streak > 0 ? "記録が続いています。空いた日があっても、今日からまた続きです。" : "最初の記録を残すと、ここに継続日数が表示されます。"}</p>
      </section>

      <section className="rhythm-card" aria-labelledby="rhythm-title">
        <div className="rhythm-heading">
          <div>
            <p className="card-label">7 DAYS WITH {dogName.toUpperCase()}</p>
            <h2 id="rhythm-title">この7日間</h2>
          </div>
          <strong>{recentDays.filter((day) => day.entries.length).length}<span>/ 7日</span></strong>
        </div>
        <div className="week-dots">
          {recentDays.map((day) => (
            <div key={day.value} className={`week-day ${day.entries.length ? "is-recorded" : ""} ${day.value === today() ? "is-today" : ""}`}>
              <span>{day.label}</span>
              <i aria-label={day.entries.length ? `${day.value} ${day.entries.length}件記録済み` : `${day.value} 未記録`}>{day.entries.length ? (day.entries.length > 1 ? day.entries.length : "✓") : ""}</i>
            </div>
          ))}
        </div>
        <div className="weekly-insight">
          <p>
            {recentRecords.length === 0
              ? "まずは今日だけ。1分の記録から始めましょう。"
              : recentConcernCount > 0
                ? `気になる記録が${recentConcernCount}件あります。コーチに共有しておくと安心です。`
                : recentGoodCount > 0
                  ? `「できた」が${recentGoodCount}日分たまりました。小さな変化が見えています。`
                  : "記録が少しずつつながっています。短いメモでも十分です。"}
          </p>
          <button onClick={() => recentConcernCount > 0 ? setView("coach") : openNewRecord()}>
            {recentConcernCount > 0 ? "コーチに相談する" : todaysRecord ? "記録を見直す" : "今日を記録する"} →
          </button>
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
        <SectionTitle eyebrow="TIMELINE" title="愛犬の一日" />
        {records.length ? (
          <div className="record-list">
            {records.slice(0, 5).map((record) => (
              <button key={record.id} onClick={() => { setEditingRecordId(record.id); setRecordCategory(record.category ?? "daily"); setRecordDate(record.recordedOn); setRecordTime(record.recordedTime ?? "12:00"); setDurationMinutes(record.durationMinutes ?? 20); setMood(record.mood); setAppetite(record.appetite); setActivity(record.activity); setToilet(record.toilet); setSleep(record.sleep); setBehaviorNote(record.behaviorNote); setGoodMoment(record.goodMoment); setView("record"); }}>
                <span className="record-date"><strong>{record.recordedTime ?? "12:00"}</strong><small>{formatDate(record.recordedOn)}</small></span>
                <span className="record-summary"><b>{categoryInfo(record.category).label}</b>{record.category === "walk" && record.durationMinutes ? ` · ${record.durationMinutes}分` : ""} · 気分 {record.mood}/5</span>
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
      <SectionTitle eyebrow="DAILY NOTE" title="何を残しますか？" />
      <p className="lead">今日の「気になる」も「かわいい」も。残したいことをひとつ選んでください。</p>
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
          {view === "coach" && coachView}
          {view === "profile" && profileView}
        </main>
        <nav className="bottom-nav" aria-label="メインメニュー">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Icon>⌂</Icon><span>ホーム</span></button>
          <button className={view === "record" ? "active" : ""} onClick={() => openNewRecord()}><Icon>＋</Icon><span>記録</span></button>
          <button className={view === "coach" ? "active" : ""} onClick={() => setView("coach")}><Icon>◌</Icon><span>コーチ</span></button>
          <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><Icon>○</Icon><span>プロフィール</span></button>
        </nav>
        <div className={`toast ${notice ? "show" : ""}`} role="status">{notice}</div>
      </div>
    </div>
  );
}
