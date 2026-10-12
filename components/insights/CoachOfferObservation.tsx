"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/supabase";
import CoachObservationSummary from "./CoachObservationSummary";

type OfferDog = {
  name: string; breed: string | null; birth_date: string | null; birthday: string | null;
  gender: string | null; is_first_time_owner: boolean | null; training_experience: string | null;
  daycare_frequency: string | null; walk_frequency: string | null; concerns: string | null;
};

export default function CoachOfferObservation({ dogId, ownerId, dogName }: {
  dogId: string; ownerId: string; dogName: string;
}) {
  const [profile, setProfile] = useState<OfferDog | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    // Use the signed-in coach's existing assignment-scoped RLS; never a privileged client.
    void supabase.from("wt_dogs")
      .select("name,breed,birth_date,birthday,gender,is_first_time_owner,training_experience,daycare_frequency,walk_frequency,concerns")
      .eq("id", dogId).eq("owner_id", ownerId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setProfile(error ? null : data);
        setStatus(error || !data ? "error" : "ready");
      }, () => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [dogId, ownerId]);

  const gender = profile?.gender === "male" ? "男の子" : profile?.gender === "female" ? "女の子" : profile?.gender === "unknown" ? "不明・未回答" : "未登録";
  const training = ({ first_time: "なし", once: "1回", twice: "2回", three_or_more: "3回以上" } as Record<string, string>)[profile?.training_experience ?? ""] ?? "未登録";

  return <div className="coach-offer-observation">
    <section className="customer-context-card" aria-label={`${dogName}のプロフィール`}>
      <h3>愛犬のプロフィール</h3>
      {status === "loading" ? <p role="status">プロフィールを読み込んでいます…</p>
        : status === "error" ? <p role="alert">プロフィールを読み込めませんでした。担当関係と接続を確認し、閉じてからもう一度開いてください。</p>
        : profile && <div className="customer-context-grid"><article><h3>{profile.name}</h3><dl>
          <div><dt>犬種</dt><dd>{profile.breed || "未登録"}</dd></div>
          <div><dt>生年月日</dt><dd>{profile.birth_date || profile.birthday || "未登録"}</dd></div>
          <div><dt>性別</dt><dd>{gender}</dd></div>
          <div><dt>飼育経験</dt><dd>{profile.is_first_time_owner === true ? "初めて" : profile.is_first_time_owner === false ? "経験あり" : "未登録"}</dd></div>
          <div><dt>トレーニング経験</dt><dd>{training}</dd></div>
          <div><dt>保育園</dt><dd>{profile.daycare_frequency || "未登録"}</dd></div>
          <div><dt>散歩</dt><dd>{profile.walk_frequency || "未登録"}</dd></div>
        </dl>{profile.concerns && <div className="customer-concerns"><small>主な悩み・気になっていること</small><p>{profile.concerns}</p></div>}</article></div>}
    </section>
    <CoachObservationSummary dogId={dogId} ownerId={ownerId} dogName={dogName} />
  </div>;
}
