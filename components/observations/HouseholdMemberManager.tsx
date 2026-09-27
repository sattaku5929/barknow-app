"use client";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";
import { HouseholdMember, loadHouseholdMembers } from "@/lib/observations/observationEvent";

const relations = [
  ["self", "本人"], ["father", "父"], ["mother", "母"], ["partner", "パートナー"],
  ["child", "子ども"], ["grandparent", "祖父母"], ["other", "その他"],
] as const;
export default function HouseholdMemberManager({ online }: { online: boolean }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<string>("self");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (!online) return;
    let active = true;
    void loadHouseholdMembers().then((rows) => { if (active) { setMembers(rows); setLoading(false); } })
      .catch(() => { if (active) { setLoadError(true); setError("家族の情報を読み込めませんでした。画面を開き直してください。"); setLoading(false); } });
    return () => { active = false; };
  }, [online]);
  function reset() { setEditing(null); setName(""); setRelation("self"); }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || !online || loadError || !name.trim()) return;
    setBusy(true); setError("");
    try {
      if (editing) {
        const { data, error: dbError } = await supabase.from("wt_household_members")
          .update({ display_name: name.trim(), relation_key: relation }).eq("id", editing).is("deleted_at", null)
          .select("id,display_name,relation_key,sort_order").single();
        if (dbError || !data) throw dbError;
        setMembers((rows) => rows.map((row) => row.id === editing ? data : row));
      } else {
        const { data, error: dbError } = await supabase.from("wt_household_members")
          .insert({ display_name: name.trim(), relation_key: relation, sort_order: members.length })
          .select("id,display_name,relation_key,sort_order").single();
        if (dbError || !data) throw dbError;
        setMembers((rows) => [...rows, data]);
      }
      reset();
    } catch { setError("保存できませんでした。もう一度お試しください。"); }
    finally { setBusy(false); }
  }
  async function remove(member: HouseholdMember) {
    if (busy || !online || !window.confirm(`${member.display_name}を一覧から削除しますか？`)) return;
    setBusy(true); setError("");
    try {
      const { data, error: dbError } = await supabase.from("wt_household_members")
        .update({ deleted_at: new Date().toISOString() }).eq("id", member.id).is("deleted_at", null)
        .select("id").single();
      if (dbError || !data) throw dbError;
      setMembers((rows) => rows.filter((row) => row.id !== member.id));
      if (editing === member.id) reset();
    } catch { setError("削除できませんでした。もう一度お試しください。"); }
    finally { setBusy(false); }
  }
  return <section className="household-manager">
    <p>愛犬のお世話をする人を登録すると、できごとの記録で選べます。</p>
    {loading && online ? <p role="status">読み込んでいます…</p> : <ul>{members.map((member) => <li key={member.id}>
      <span><strong>{member.display_name}</strong><small>{relations.find(([key]) => key === member.relation_key)?.[1] ?? "その他"}</small></span>
      <button type="button" disabled={busy} onClick={() => { setEditing(member.id); setName(member.display_name); setRelation(member.relation_key); }}>編集</button>
      <button type="button" disabled={busy} onClick={() => void remove(member)}>削除</button>
    </li>)}</ul>}
    <form onSubmit={(e) => void save(e)}>
      <label className="field-label">呼び名<input value={name} maxLength={60} placeholder="例：パパ、長女、私" onChange={(e) => setName(e.target.value)} required /></label>
      <label className="field-label">関係<select value={relation} onChange={(e) => setRelation(e.target.value)}>{relations.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button type="submit" disabled={busy || !online || loading || loadError}>{busy ? "保存中…" : editing ? "変更を保存" : "追加する"}</button>
      {editing && <button type="button" onClick={reset}>キャンセル</button>}
    </form>
    {error && <p className="observation-error" role="alert">{error}</p>}
    {!online && <p>接続を確認してください。</p>}
  </section>;
}
