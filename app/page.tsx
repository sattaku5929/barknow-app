"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type View = "home" | "record" | "coach" | "profile";
type Connection = "checking" | "online" | "local";
type Status = "良い" | "ふつう" | "気になる";

type DogProfile = {
  id?: string;
  name: string;
  breed: string;
  birthday: string;
};

type DailyRecord = {
  id: string;
  recordedOn: string;
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
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

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

  useEffect(() => {
    const localProfile = readLocal(PROFILE_KEY, initialProfile);
    const localRecords = readLocal<DailyRecord[]>(RECORDS_KEY, []);
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
            .select("id,recorded_on,mood,appetite,activity,toilet,sleep,behavior_note,good_moment")
            .eq("owner_id", userId)
            .order("recorded_on", { ascending: false })
            .limit(30),
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
            recordedOn: item.recorded_on,
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
      id: crypto.randomUUID(),
      recordedOn: recordDate,
      mood,
      appetite,
      activity,
      toilet,
      sleep,
      behaviorNote,
      goodMoment,
    };
    let nextRecords = [nextRecord, ...records.filter((item) => item.recordedOn !== recordDate)];

    try {
      if (connection === "online") {
        const userId = await getUserId();
        if (!userId) throw new Error("No session");
        const dogId = await ensureRemoteDog(userId);
        const { data, error } = await supabase
          .from("wt_daily_records")
          .upsert(
            {
              owner_id: userId,
              dog_id: dogId,
              recorded_on: recordDate,
              mood,
              appetite,
              activity,
              toilet,
              sleep,
              behavior_note: behaviorNote || null,
              good_moment: goodMoment || null,
            },
            { onConflict: "dog_id,recorded_on" },
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
          <p className="welcome-copy">小さな変化と、できたこと。毎日の記録がコーチとの会話につながります。</p>
        </div>
        <button className="avatar" onClick={() => setView("profile")} aria-label="愛犬プロフィールを開く">
          {profile.name ? profile.name.slice(0, 1) : "＋"}
        </button>
      </section>

      <section className="checkin-card">
        <div className="checkin-top">
          <div>
            <p className="card-label">今日のチェックイン</p>
            <h2>{todaysRecord ? "今日の記録ができました" : "1分で、今日を残そう"}</h2>
          </div>
          <div className={`record-mark ${todaysRecord ? "is-done" : ""}`}>{todaysRecord ? "✓" : "01"}</div>
        </div>
        <p>{todaysRecord ? "あとから何度でも書き直せます。" : "食欲・元気・様子を選ぶだけ。短いメモでも大丈夫です。"}</p>
        <button className="primary-button" onClick={() => setView("record")}>
          {todaysRecord ? "今日の記録を見直す" : "今日の記録をつける"}<span>→</span>
        </button>
      </section>

      <section className="streak-strip" aria-label="継続状況">
        <div><strong>{streak}</strong><span>日</span></div>
        <p>{streak > 0 ? "記録が続いています。完璧より、続けることを大切に。" : "最初の記録を残すと、ここに継続日数が表示されます。"}</p>
      </section>

      <section className="content-section">
        <SectionTitle eyebrow="RECENT" title="最近の記録" />
        {records.length ? (
          <div className="record-list">
            {records.slice(0, 3).map((record) => (
              <button key={record.id} onClick={() => { setRecordDate(record.recordedOn); setMood(record.mood); setAppetite(record.appetite); setActivity(record.activity); setToilet(record.toilet); setSleep(record.sleep); setBehaviorNote(record.behaviorNote); setGoodMoment(record.goodMoment); setView("record"); }}>
                <span className="record-date">{formatDate(record.recordedOn)}</span>
                <span className="record-summary">気分 {record.mood}/5 · 食欲 {record.appetite}</span>
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

  const recordView = (
    <form className="screen-form" onSubmit={saveRecord}>
      <SectionTitle eyebrow="DAILY NOTE" title="今日の記録" />
      <p className="lead">うまく書こうとしなくて大丈夫。今日の{dogName}を、そのまま残してください。</p>
      <label className="field-label">記録日<input type="date" value={recordDate} onChange={(event) => setRecordDate(event.target.value)} required /></label>
      <fieldset className="mood-field">
        <legend>今日の気分</legend>
        <div>
          {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setMood(value)} className={mood === value ? "is-selected" : ""} aria-label={`気分 ${value}`} aria-pressed={mood === value}>{["しょんぼり", "いまいち", "ふつう", "ごきげん", "最高"][value - 1]}</button>)}
        </div>
      </fieldset>
      <div className="status-grid">
        <StatusSelector label="食欲" value={appetite} onChange={setAppetite} />
        <StatusSelector label="元気" value={activity} onChange={setActivity} />
        <StatusSelector label="トイレ" value={toilet} onChange={setToilet} />
        <StatusSelector label="睡眠" value={sleep} onChange={setSleep} />
      </div>
      <label className="field-label">気になった様子<textarea value={behaviorNote} onChange={(event) => setBehaviorNote(event.target.value)} placeholder="吠えた場面、落ち着かなかった時間など" rows={3} /></label>
      <label className="field-label good-field">今日の「できた」<textarea value={goodMoment} onChange={(event) => setGoodMoment(event.target.value)} placeholder="待てができた、一緒にゆっくり歩けた など" rows={3} /></label>
      <button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中…" : "この記録を保存する"}<span>→</span></button>
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
          <button className={view === "record" ? "active" : ""} onClick={() => { setRecordDate(today()); setView("record"); }}><Icon>＋</Icon><span>記録</span></button>
          <button className={view === "coach" ? "active" : ""} onClick={() => setView("coach")}><Icon>◌</Icon><span>コーチ</span></button>
          <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><Icon>○</Icon><span>プロフィール</span></button>
        </nav>
        <div className={`toast ${notice ? "show" : ""}`} role="status">{notice}</div>
      </div>
    </div>
  );
}
