import { NextRequest,NextResponse } from "next/server";
import { authenticatedStaffRole, serviceSupabase } from "@/lib/server/supabase";
import { inspectR2Usage } from "@/lib/r2-usage";
export const runtime="nodejs";
export async function GET(request:NextRequest) {
  const staff=await authenticatedStaffRole(request);
  if (!staff || staff.role!=="admin") return NextResponse.json({error:"Forbidden"},{status:403});
  try {
    const [usage,counts]=await Promise.all([
      inspectR2Usage(),
      serviceSupabase().from("wt_content_items").select("id,origin,author_id,sharing,byte_size,archived_at"),
    ]);
    if (counts.error) throw counts.error;
    return NextResponse.json({usage,items:counts.data},{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({error:"ストレージの状態を取得できませんでした"},{status:503});
  }
}
