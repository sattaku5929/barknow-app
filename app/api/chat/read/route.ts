import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, serviceSupabase } from "@/lib/server/supabase";

type ReadInput = {
  owner_id?: string;
  dog_id?: string;
};

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = await request.json().catch(() => null) as ReadInput | null;
  if (!input?.owner_id || !input.dog_id) {
    return NextResponse.json({ error: "Invalid read receipt request" }, { status: 400 });
  }
  if (input.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const readAt = new Date().toISOString();
  const { data, error } = await serviceSupabase()
    .from("wt_coach_messages")
    .update({ read_at: readAt })
    .eq("owner_id", input.owner_id)
    .eq("dog_id", input.dog_id)
    .eq("sender", "coach")
    .is("read_at", null)
    .select("id,read_at");

  if (error) {
    console.error("Chat read receipt update failed", {
      ownerId: input.owner_id,
      dogId: input.dog_id,
      error,
    });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ messages: data ?? [] });
}
