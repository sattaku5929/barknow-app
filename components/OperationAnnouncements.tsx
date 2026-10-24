"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/supabase";

type Role = "owner" | "coach" | "admin";
type Audience = "all" | "owner" | "coach";
type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  is_published: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};
type Receipt = { announcement_id: string };
const formatDate = (value: string) => new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
function toLocalInput(date: string | null) {
  if (!date) return "";
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function isLive(a: Announcement) {
  const now = Date.now();
  return a.is_published && new Date(a.starts_at).getTime() <= now && (!a.ends_at || new Date(a.ends_at).getTime() > now);
}
export default function OperationAnnouncements({ role, userId, management = false }: { role: Role; userId: string; management?: boolean }) {
  const canManage = management && role === "admin";
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Announcement[]>([]);
  const [reads, setReads] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const reload = useCallback(async () => {
    if (!userId) return;
    const [{ data, error }, { data: receipts, error: receiptError }] = await Promise.all([
      supabase.from("wt_announcements").select("id,title,body,audience,is_published,starts_at,ends_at,created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("wt_announcement_reads").select("announcement_id").eq("user_id", userId),
    ]);
    if (error || receiptError) setMessage("お知らせを取得できません。お知らせ用DBテーブルの適用状況とアクセス権限を確認してください。");
    else setMessage("");
    setRows((data ?? []) as Announcement[]);
    setReads((receipts ?? []).map((r: Receipt) => r.announcement_id));
    setLoading(false);
  }, [userId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!userId) return;
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [reload, userId]);
  const visible = canManage ? rows : rows.filter(isLive);
  const unread = visible.filter((item) => !reads.includes(item.id)).length;
  const startCreate = () => {
    setEditingId(null); setTitle(""); setBody(""); setAudience("all"); setStarts(toLocalInput(new Date().toISOString())); setEnds(""); setPublished(false); setOpen(true); setMessage("");
  };
  const startEdit = (item: Announcement) => {
    setEditingId(item.id); setTitle(item.title); setBody(item.body); setAudience(item.audience); setStarts(toLocalInput(item.starts_at)); setEnds(toLocalInput(item.ends_at)); setPublished(item.is_published); setOpen(true); setMessage("");
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || saving) return;
    if (!title.trim() || !body.trim() || !starts) { setMessage("タイトル・本文・開始日時を入力してください。"); return; }
    const startDate = new Date(starts);
    const endDate = ends ? new Date(ends) : null;
    if (Number.isNaN(startDate.getTime()) || (endDate && (Number.isNaN(endDate.getTime()) || endDate <= startDate))) {
      setMessage("公開終了日時は開始日時より後にしてください。"); return;
    }
    setSaving(true); setMessage("");
    const payload = { title: title.trim(), body: body.trim(), audience, starts_at: startDate.toISOString(), ends_at: endDate?.toISOString() ?? null, is_published: published, updated_at: new Date().toISOString() };
    const { error } = editingId
      ? await supabase.from("wt_announcements").update(payload).eq("id", editingId)
      : await supabase.from("wt_announcements").insert({ ...payload, created_by: userId });
    setSaving(false);
    if (error) { setMessage(error.code === "42P01" || error.code === "PGRST205" ? "お知らせ用DBがまだ準備されていません。管理者にお問い合わせください。" : "保存できませんでした。権限と入力内容を確認してください。"); return; }
    setOpen(false); await reload();
  };
  const markRead = async (id: string) => {
    if (reads.includes(id)) return;
    const { error } = await supabase.from("wt_announcement_reads").insert({ announcement_id: id, user_id: userId });
    if (error && error.code !== "23505") { setMessage("既読状態を保存できませんでした。"); return; }
    setReads((items) => items.includes(id) ? items : [...items, id]);
  };
  const togglePublish = async (item: Announcement) => {
    if (!canManage || saving) return;
    setSaving(true);
    const { error } = await supabase.from("wt_announcements").update({ is_published: !item.is_published, updated_at: new Date().toISOString() }).eq("id", item.id);
    setSaving(false);
    if (error) setMessage("公開状態を変更できませんでした。");
    else await reload();
  };

  return (
    <section className={management ? "operation-announcements is-management" : "operation-announcements"} aria-label="運営からのお知らせ">
      <div className="operation-announcements-head">
        {management ? <div><small>ADMIN · INFORMATION</small><h2>運営からのお知らせ</h2></div> : <button type="button" className="operation-announcements-bell" aria-label={`運営からのお知らせ、未読${unread}件`} aria-expanded={open} onClick={() => setOpen((value) => !value)}><span aria-hidden="true">🔔</span>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</button>}
        {canManage && <button type="button" className="operation-announcements-primary" onClick={startCreate}>＋ お知らせを作成</button>}
      </div>
      {(open || canManage) && <div className="operation-announcements-list">
        {loading && <p className="operation-announcements-muted">読み込み中…</p>}
        {message && <p role="alert" className="operation-announcements-error">{message}</p>}
        {!loading && !visible.length && <p className="operation-announcements-muted">{canManage ? "お知らせはまだありません。" : "現在のお知らせはありません。"}</p>}
        {!loading && visible.map((item) => (
          <article className="operation-announcements-item" key={item.id}>
            <div className="operation-announcements-meta">
              <time>{formatDate(item.starts_at)}</time>
              {canManage && <span>{item.audience === "all" ? "全員" : item.audience === "owner" ? "Owner" : "Coach"} · {item.is_published ? (isLive(item) ? "公開中" : "公開予約・期間外") : "下書き"}</span>}
              {!canManage && !reads.includes(item.id) && <span className="operation-announcements-new">未読</span>}
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            {canManage ? <div className="operation-announcements-actions"><button type="button" onClick={() => startEdit(item)}>編集</button><button type="button" disabled={saving} onClick={() => void togglePublish(item)}>{item.is_published ? "公開停止" : "公開する"}</button></div> : !reads.includes(item.id) && <button type="button" className="operation-announcements-read" onClick={() => void markRead(item.id)}>確認しました</button>}
          </article>
        ))}
        {!canManage && <button type="button" className="operation-announcements-close" onClick={() => setOpen(false)}>閉じる</button>}
      </div>}
      {canManage && open && <form className="operation-announcements-form" onSubmit={(event) => void save(event)}>
        {message && <p role="alert" className="operation-announcements-error">{message}</p>}
        <h3>{editingId ? "お知らせを編集" : "新しいお知らせ"}</h3>
        <label>タイトル<input maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>本文<textarea maxLength={4000} rows={5} required value={body} onChange={(event) => setBody(event.target.value)} /></label>
        <label>配信対象<select value={audience} onChange={(event) => setAudience(event.target.value as Audience)}><option value="all">全員（Owner・Coach）</option><option value="owner">Ownerのみ</option><option value="coach">Coachのみ</option></select></label>
        <label>公開開始<input type="datetime-local" required value={starts} onChange={(event) => setStarts(event.target.value)} /></label>
        <label>公開終了（任意）<input type="datetime-local" value={ends} onChange={(event) => setEnds(event.target.value)} /></label>
        <label className="operation-announcements-publish"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> 公開する（未チェックは下書き）</label>
        <div className="operation-announcements-actions"><button type="button" onClick={() => setOpen(false)}>キャンセル</button><button type="submit" disabled={saving}>{saving ? "保存中…" : "保存する"}</button></div>
      </form>}
    </section>
  );
}
