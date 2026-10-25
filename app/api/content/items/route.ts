import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedStaffRole, authenticatedSupabase, authenticatedUser, serviceSupabase } from "@/lib/server/supabase";
import { r2BucketName, r2Client } from "@/lib/r2";

export const runtime = "nodejs";
const noCache = { "Cache-Control": "private, no-store" };
type Asset = { id: string; author_id: string; author_label: string; origin: string; format: string; sharing: string; title: string; description: string; category: string; tags: string[]; article_body: string; object_key: string | null; mime_type: string | null; byte_size: number; duration_seconds: number | null; archived_at: string | null; blocked_at: string | null; created_at: string };
const publicFields = (item: Asset) => ({
  id: item.id, authorId: item.author_id, authorLabel: item.author_label, origin: item.origin, format: item.format,
  sharing: item.sharing, title: item.title, description: item.description,
  category: item.category, tags: item.tags, body: item.article_body,
  size: item.byte_size, duration: item.duration_seconds,
  archived: !!item.archived_at, blocked: !!item.blocked_at, createdAt: item.created_at,
});
const message = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noCache });
const formats = ["video", "image", "article"];
const categories = ["吠え","噛み癖","トイレ","お散歩","お留守番","基本のしつけ","社会化・慣れ","トレーニング","その他"];
function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function tagsOf(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === "string").map(x=>x.trim().slice(0,30)).filter(Boolean))].slice(0,8) : []; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return message("Unauthorized", 401);
    const messageId = request.nextUrl.searchParams.get("messageId");
    const admin = serviceSupabase();
    if (messageId) {
      if (!uuid.test(messageId)) return message("Invalid message", 400);
      const token = request.headers.get("authorization")!.slice(7);
      const { data: chat } = await authenticatedSupabase(token).from("wt_coach_messages")
        .select("content_id").eq("id", messageId).maybeSingle();
      if (!chat?.content_id) return message("Content not found", 404);
      const { data } = await admin.from("wt_content_items").select("*").eq("id", chat.content_id).maybeSingle();
      if (!data || data.blocked_at) return message("Content is unavailable", 404);
      return NextResponse.json({ item: publicFields(data as Asset) }, { headers: noCache });
    }
    const staff = await authenticatedStaffRole(request);
    if (!staff) return message("Forbidden", 403);
    const { data, error } = await admin.from("wt_content_items").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    const items = ((data ?? []) as Asset[]).filter(item =>
      !(item.archived_at && item.archived_at === item.blocked_at) && (staff.role === "admin" ||
      item.author_id === user.id ||
      (!item.archived_at && !item.blocked_at && (item.sharing === "coaches" || item.sharing === "team")))
    ).map(publicFields);
    let authors: Record<string,string> = {};
    const authorIds = [...new Set(items.map(item => item.authorId).filter(Boolean))];
    if (authorIds.length) {
      const { data: coaches } = await admin.from("wt_coach_profiles").select("coach_id,display_name").in("coach_id", authorIds);
      authors = Object.fromEntries((coaches ?? []).map(c=>[c.coach_id, c.display_name]));
    }
    return NextResponse.json({ items, authors }, { headers: noCache });
  } catch (err) {
    console.error("[content] read failed", err);
    return message("コンテンツを読み込めませんでした", 503);
  }
}

export async function POST(request: NextRequest) {
  const staff = await authenticatedStaffRole(request);
  if (!staff) return message("Coach/Admin only", 403);
  const p = await request.json().catch(() => null);
  const format = p?.format;
  const title = clean(p?.title, 120);
  const category = categories.includes(p?.category) ? p.category : "その他";
  const description = clean(p?.description, 2000);
  const articleBody = clean(p?.body, 12000);
  const tags = tagsOf(p?.tags);
  if (!formats.includes(format) || !title || (format === "article" && !articleBody)) return message("タイトルと内容を確認してください", 400);
  const sharing = staff.role === "admin" ? "team" : (p?.sharing === "coaches" ? "coaches" : "private");
  let objectKey: string | null = null;
  let mimeType: string | null = null;
  let bytes = 0;
  let duration: number | null = null;
  if (format !== "article") {
    objectKey = clean(p?.key, 220);
    const prefix = `content/${staff.user.id}/`;
    if (!objectKey.startsWith(prefix) || !/^content\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|jpg|png|webp)$/.test(objectKey)) return message("アップロード情報が不正です", 400);
    try {
      const head = await r2Client().send(new HeadObjectCommand({ Bucket: r2BucketName(), Key: objectKey }));
      bytes = head.ContentLength ?? 0;
      mimeType = head.ContentType ?? null;
    } catch { return message("動画・画像の保存を確認できません", 400); }
    const allowed = format === "video" ? ["video/mp4","video/webm"] : ["image/jpeg","image/png","image/webp"];
    const cap = format === "video" ? 30*1024*1024 : 5*1024*1024;
    if (!mimeType || !allowed.includes(mimeType) || bytes < 1 || bytes > cap) return message("メディア形式・容量を確認してください", 400);
    if (format === "video") {
      duration = Number(p?.duration);
      if (!Number.isInteger(duration) || duration < 1 || duration > 180) return message("動画は3分以内にしてください", 400);
    }
  }
  const admin = serviceSupabase();
  const { data: authorProfile } = await admin.from("wt_coach_profiles").select("display_name").eq("coach_id", staff.user.id).maybeSingle();
  const { data, error } = await admin.from("wt_content_items").insert({
    author_id: staff.user.id, author_label: authorProfile?.display_name ?? (staff.role === "admin" ? "運営" : ""), origin: staff.role, sharing, format, title, description,
    category, tags, article_body: format === "article" ? articleBody : "",
    object_key: objectKey, mime_type: mimeType, byte_size: bytes, duration_seconds: duration,
  }).select("*").single();
  if (error) {
    console.error("[content] insert", error.message);
    return message("コンテンツを登録できませんでした", 400);
  }
  return NextResponse.json({ item: publicFields(data as Asset) }, { status: 201, headers: noCache });
}

export async function PATCH(request: NextRequest) {
  const staff = await authenticatedStaffRole(request);
  if (!staff) return message("Forbidden", 403);
  const p = await request.json().catch(() => null);
  if (!uuid.test(p?.id ?? "")) return message("Invalid ID", 400);
  const admin = serviceSupabase();
  const { data: existing } = await admin.from("wt_content_items").select("*").eq("id", p.id).maybeSingle();
  if (!existing || (existing.archived_at && existing.archived_at === existing.blocked_at)) return message("Content not found", 404);
  const own = existing.author_id === staff.user.id;
  if (!own && staff.role !== "admin") return message("Forbidden", 403);
  const changes: Record<string,unknown> = { updated_at: new Date().toISOString() };
  if (own) {
    if (p.title !== undefined) {
      const title = clean(p.title,120);
      if (!title) return message("タイトルは必須です", 400);
      changes.title = title;
    }
    if (p.description !== undefined) changes.description = clean(p.description,2000);
    if (p.category !== undefined) changes.category = categories.includes(p.category) ? p.category : "その他";
    if (p.tags !== undefined) changes.tags = tagsOf(p.tags);
    if (p.sharing !== undefined && staff.role === "coach") changes.sharing = p.sharing === "coaches" ? "coaches" : "private";
    if (p.body !== undefined && existing.format === "article") {
      const b = clean(p.body,12000);
      if (!b) return message("記事本文は必須です", 400);
      changes.article_body = b;
    }
    if (p.archived !== undefined) changes.archived_at = p.archived ? new Date().toISOString() : null;
  }
  if (staff.role === "admin" && p.blocked !== undefined) changes.blocked_at = p.blocked ? new Date().toISOString() : null;
  const { data, error } = await admin.from("wt_content_items").update(changes).eq("id",p.id).select("*").single();
  if (error) return message("変更を保存できませんでした", 400);
  return NextResponse.json({ item: publicFields(data as Asset) }, { headers: noCache });
}

/** Logical deletion preserves chat history while removing the item from the library.
 * Matching archive/block timestamps mark deletion; independent archive and block
 * actions remain reversible. Media/signing paths already deny blocked content.
 */
export async function DELETE(request: NextRequest) {
  const staff = await authenticatedStaffRole(request);
  if (!staff) return message("Forbidden", 403);
  const p = await request.json().catch(() => null);
  if (!uuid.test(p?.id ?? "")) return message("Invalid ID", 400);
  const admin = serviceSupabase();
  const { data: existing, error: readError } = await admin.from("wt_content_items").select("id,author_id").eq("id", p.id).maybeSingle();
  if (readError) return message("コンテンツを確認できませんでした", 503);
  if (!existing) return message("Content not found", 404);
  if (staff.role !== "admin" && existing.author_id !== staff.user.id) return message("Forbidden", 403);
  const now = new Date().toISOString();
  let query = admin.from("wt_content_items").update({ archived_at: now, blocked_at: now, updated_at: now }).eq("id", p.id);
  if (staff.role !== "admin") query = query.eq("author_id", staff.user.id);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return message("削除できませんでした", 400);
  return NextResponse.json({ deleted: true }, { headers: noCache });
}
