import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { r2BucketName, r2Client, R2ConfigurationError } from "@/lib/r2";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";

export const runtime = "nodejs";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Unknown error";
}

async function listR2Keys(prefix: string) {
  const client = r2Client();
  const bucket = r2BucketName();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteR2Keys(keys: string[]) {
  if (!keys.length) return;
  const client = r2Client();
  const bucket = r2BucketName();
  for (let index = 0; index < keys.length; index += 1000) {
    const objects = keys.slice(index, index + 1000).map((Key) => ({ Key }));
    const response = await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objects, Quiet: true },
    }));
    if (response.Errors?.length) {
      throw new Error(`R2 deletion failed for ${response.Errors.length} object(s)`);
    }
  }
}

export async function DELETE(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "ログイン情報を確認できませんでした。再度ログインしてください" }, { status: 401 });
  }

  let admin: ReturnType<typeof serviceSupabase>;
  try {
    admin = serviceSupabase();
  } catch (error) {
    console.error("[Account deletion] service configuration error", error);
    return NextResponse.json({ error: "アカウント削除のサーバー設定を確認してください" }, { status: 503 });
  }

  try {
    const { data: mediaRows, error: mediaError } = await admin
      .from("wt_coach_messages")
      .select("media_key")
      .eq("owner_id", user.id)
      .not("media_key", "is", null);
    if (mediaError) throw mediaError;

    const [ownedUploadKeys] = await Promise.all([
      listR2Keys(`chat/${user.id}/`),
      admin.storage.from("coach-avatars").remove([`${user.id}/avatar.webp`]).then(({ error }) => {
        if (error) throw error;
      }),
    ]);
    const conversationKeys = (mediaRows ?? [])
      .map((row) => typeof row.media_key === "string" ? row.media_key : "")
      .filter(Boolean);
    await deleteR2Keys([...new Set([...ownedUploadKeys, ...conversationKeys])]);
  } catch (error) {
    console.error("[Account deletion] storage cleanup failed", { userId: user.id, error });
    const message = error instanceof R2ConfigurationError
      ? "メディア削除のサーバー設定を確認してください"
      : "保存済み画像・動画を削除できませんでした。時間をおいて再度お試しください";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    const { error: dataError } = await admin.rpc("wt_delete_user_data", { target_user_id: user.id });
    if (dataError) throw dataError;
  } catch (error) {
    console.error("[Account deletion] database cleanup failed", { userId: user.id, error });
    return NextResponse.json({
      error: errorMessage(error).includes("Could not find the function")
        ? "退会用のデータベース更新（026）を適用してください"
        : "登録データを削除できませんでした。時間をおいて再度お試しください",
    }, { status: 500 });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error("[Account deletion] auth user deletion failed", { userId: user.id, error: authError });
    return NextResponse.json({
      error: "登録データは削除されましたが、ログインアカウントの削除を完了できませんでした。もう一度お試しください",
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
