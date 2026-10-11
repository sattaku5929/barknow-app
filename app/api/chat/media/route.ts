import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedSupabase, authenticatedUser } from "@/lib/server/supabase";
import { r2BucketName, r2Client } from "@/lib/r2";
import { validChatMediaKey } from "@/lib/media-security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    const body = await request.json().catch(() => null);
    if (typeof body?.messageId !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
    const token = request.headers.get("authorization")!.slice(7);
    const { data: message, error } = await authenticatedSupabase(token).from("wt_coach_messages")
      .select("media_key,media_type").eq("id", body.messageId).maybeSingle();
    // Use the caller's RLS client, never a service-role lookup of a supplied key.
    if (error || !message || !validChatMediaKey(message.media_key) || !["image", "video"].includes(message.media_type)) {
      return NextResponse.json({ error: "Media not found" }, { status: 404, headers });
    }
    const url = await getSignedUrl(r2Client(), new GetObjectCommand({
      Bucket: r2BucketName(), Key: message.media_key,
      ResponseCacheControl: "private, no-store",
    }), { expiresIn: 300 });
    return NextResponse.json({ url, expiresIn: 300 }, { headers });
  } catch {
    return NextResponse.json({ error: "メディアを読み込めませんでした" }, { status: 503, headers });
  }
}
