import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedStaffRole, authenticatedSupabase } from "@/lib/server/supabase";
import { canWriteCoaching } from "@/lib/server/coachingAuthorization";
import { assertR2Configuration, R2ConfigurationError, r2BucketName, r2Client } from "@/lib/r2";
import { ensureR2Budget } from "@/lib/r2-usage";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function safeFileName(value: string) {
  const cleaned = value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.slice(-120) || "media";
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ code: "auth_required", error: "ログイン情報を確認できませんでした。再度ログインしてください" }, { status: 401 });
  }

  let userClient: ReturnType<typeof authenticatedSupabase>;
  try {
    userClient = authenticatedSupabase(token);
  } catch (error) {
    console.error("Supabase public configuration error", error);
    return NextResponse.json({ code: "supabase_public_not_configured", error: "Supabaseの公開接続設定を確認してください" }, { status: 503 });
  }

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) {
    console.warn("Media upload authentication failed", authError?.message ?? "User not found");
    return NextResponse.json({ code: "auth_session_invalid", error: "ログインの有効期限が切れました。再度ログインしてください" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { fileName?: string; fileType?: string; fileSize?: number; ownerId?: string; dogId?: string } | null;
  const fileName = payload?.fileName?.trim() ?? "";
  const fileType = payload?.fileType?.trim().toLowerCase() ?? "";
  const fileSize = Number(payload?.fileSize ?? 0);
  const ownerId = payload?.ownerId?.trim() ?? "";
  const dogId = payload?.dogId?.trim() ?? "";
  if (!fileName || !ownerId || !dogId) return NextResponse.json({ error: "アップロード情報が不足しています" }, { status: 400 });
  if (!ALLOWED_TYPES.has(fileType)) return NextResponse.json({ error: "対応していないファイル形式です" }, { status: 400 });
  const limit = fileType.startsWith("image/") ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > limit) {
    return NextResponse.json({ error: `ファイルは${limit / 1024 / 1024}MB以下にしてください` }, { status: 400 });
  }

  let bypassForSupportAdmin = false;
  try {
    const { data: dog, error: dogError } = await userClient.from("wt_dogs").select("id,owner_id").eq("id", dogId).eq("owner_id", ownerId).maybeSingle();
    if (dogError) throw dogError;
    if (!dog) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (user.id !== ownerId) {
      const [{ data: role, error: roleError }, { data: assignment, error: assignmentError }] = await Promise.all([
        userClient.from("wt_user_roles").select("role").eq("user_id", user.id).maybeSingle(),
        userClient.from("wt_coach_assignments").select("id").eq("coach_id", user.id).eq("owner_id", ownerId).eq("dog_id", dogId).maybeSingle(),
      ]);
      if (roleError) throw roleError;
      if (assignmentError) throw assignmentError;
      const adminAllowed = role?.role === "admin" && (await authenticatedStaffRole(request))?.role === "admin";
      bypassForSupportAdmin = adminAllowed;
      if (!adminAllowed && !(role?.role === "coach" && assignment)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } catch (error) {
    console.error("Media conversation authorization error", error);
    return NextResponse.json({ code: "conversation_check_failed", error: "会話の権限を確認できませんでした" }, { status: 500 });
  }

  // Do not issue writable object URLs for non-entitled owners, including
  // media-only chat messages. The message DB policy remains the final guard.
  if (!bypassForSupportAdmin) {
    try {
      if (!await canWriteCoaching(ownerId, dogId)) {
        return NextResponse.json({ error: "画像・動画の共有には有効な月額契約と担当コーチの確定が必要です", code: "coaching_membership_required" }, { status: 403 });
      }
    } catch (error) {
      console.error("Media coaching access check failed", { userId: user.id, error });
      return NextResponse.json({ code: "coaching_access_unavailable", error: "利用権限を確認できませんでした" }, { status: 503 });
    }
  }

  try {
    assertR2Configuration();
    await ensureR2Budget(fileSize);
    const date = new Date().toISOString().slice(0, 10);
    const key = `chat/${user.id}/${date}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
    const command = new PutObjectCommand({
      Bucket: r2BucketName(),
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
      CacheControl: "private, no-store",
    });
    const uploadUrl = await getSignedUrl(r2Client(), command, { expiresIn: 300 });
    const publicUrl = `r2://${key}`;
    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    console.error("R2 presigned URL error", error);
    if (error instanceof Error && error.message.startsWith("保存容量")) {
      return NextResponse.json({ code:"r2_budget_exceeded", error:error.message }, { status:413 });
    }
    if (error instanceof R2ConfigurationError) {
      return NextResponse.json({
        code: "r2_not_configured",
        error: `メディア保存先の環境変数が不足しています（${error.missing.join(", ")}）`,
        missing: error.missing,
      }, { status: 503 });
    }
    return NextResponse.json({ code: "r2_signing_failed", error: "アップロード先を準備できませんでした。R2の認証情報を確認してください" }, { status: 502 });
  }
}
