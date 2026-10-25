import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { authenticatedStaffRole, authenticatedSupabase, authenticatedUser, serviceSupabase } from "@/lib/server/supabase";
import { r2BucketName, r2Client } from "@/lib/r2";
export const runtime = "nodejs";
const noCache = {"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
export async function POST(request:NextRequest) {
  const user=await authenticatedUser(request);
  if (!user) return NextResponse.json({error:"Unauthorized"},{status:401,headers:noCache});
  const p=await request.json().catch(()=>null);
  if (typeof p?.contentId!=="string" || !/^[0-9a-f-]{36}$/i.test(p.contentId)) {
    return NextResponse.json({error:"Invalid content"},{status:400,headers:noCache});
  }
  const staff=await authenticatedStaffRole(request);
  const admin=serviceSupabase();
  const {data:item}=await admin.from("wt_content_items").select("id,author_id,sharing,origin,archived_at,blocked_at,object_key").eq("id",p.contentId).maybeSingle();
  if (!item || !item.object_key || item.blocked_at) return NextResponse.json({error:"Media unavailable"},{status:404,headers:noCache});
  let allowed=false;
  if (staff) allowed=staff.role==="admin" || item.author_id===user.id || (!item.archived_at && ["team","coaches"].includes(item.sharing));
  if (!allowed && typeof p?.messageId==="string") {
    const token=request.headers.get("authorization")!.slice(7);
    const {data:message}=await authenticatedSupabase(token).from("wt_coach_messages").select("content_id")
      .eq("id",p.messageId).eq("content_id",p.contentId).maybeSingle();
    allowed=!!message;
  }
  if (!allowed) return NextResponse.json({error:"Forbidden"},{status:403,headers:noCache});
  try {
    const url=await getSignedUrl(r2Client(),new GetObjectCommand({
      Bucket:r2BucketName(),Key:item.object_key,ResponseCacheControl:"private, no-store",
    }),{expiresIn:300});
    return NextResponse.json({url,expiresIn:300},{headers:noCache});
  } catch {
    return NextResponse.json({error:"動画を読み込めませんでした"},{status:503,headers:noCache});
  }
}
