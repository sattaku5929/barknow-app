import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedStaffRole } from "@/lib/server/supabase";
import { r2BucketName, r2Client } from "@/lib/r2";
import { ensureR2Budget } from "@/lib/r2-usage";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const staff = await authenticatedStaffRole(request);
  if (!staff) return NextResponse.json({ error:"Coach/Admin only" }, { status:403 });
  const p = await request.json().catch(()=>null);
  const type = typeof p?.type === "string" ? p.type.toLowerCase() : "";
  const size = Number(p?.size);
  const mime: Record<string,string> = {
    "video/mp4":"mp4","video/webm":"webm","image/jpeg":"jpg","image/png":"png","image/webp":"webp",
  };
  if (!mime[type] || !Number.isSafeInteger(size) || size < 1 || size > (type.startsWith("video/") ? 30 : 5)*1024*1024) {
    return NextResponse.json({ error:"動画は30MB以下、画像は5MB以下にしてください" }, { status:400 });
  }
  if (type.startsWith("video/") && (Number(p?.duration) < 1 || Number(p?.duration) > 180)) {
    return NextResponse.json({ error:"動画は3分以内にしてください" }, { status:400 });
  }
  try {
    const usage = await ensureR2Budget(size);
    const key = `content/${staff.user.id}/${crypto.randomUUID()}.${mime[type]}`;
    const url = await getSignedUrl(r2Client(), new PutObjectCommand({
      Bucket:r2BucketName(),Key:key,ContentLength:size,ContentType:type,CacheControl:"private, no-store",
    }),{ expiresIn:300 });
    return NextResponse.json({ uploadUrl:url,key,usageBytes:usage.bytes,maximumBytes:usage.limitBytes }, {
      headers:{"Cache-Control":"private, no-store"},
    });
  } catch(err) {
    console.error("[content] upload reservation failed",err);
    return NextResponse.json({ error:err instanceof Error && err.message.includes("保存容量") ? err.message : "ストレージ容量を確認できませんでした。運営にお問い合わせください" }, { status:503 });
  }
}
