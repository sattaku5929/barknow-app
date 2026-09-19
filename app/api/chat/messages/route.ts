import { NextRequest, NextResponse } from "next/server";
import { sendPushNotification } from "@/lib/pushSender";
import { authenticatedSupabase, authenticatedUser, serviceSupabase } from "@/lib/server/supabase";

type MessageInput = {
  owner_id?: string;
  dog_id?: string;
  sender?: "owner" | "coach";
  body?: string;
  media_url?: string;
  media_key?: string;
  media_type?: "image" | "video" | "";
  media_name?: string;
  media_size?: number;
};

export async function POST(request: NextRequest) {
  const user = await authenticatedUser(request);
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!user || !accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = await request.json().catch(() => null) as MessageInput | null;
  if (!input?.owner_id || !input.dog_id || !input.sender || !input.body?.trim()) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }
  if (input.sender === "owner" && input.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const message = {
    owner_id: input.owner_id,
    dog_id: input.dog_id,
    sender: input.sender,
    body: input.body.trim(),
    ...(input.media_url ? {
      media_url: input.media_url,
      media_key: input.media_key || null,
      media_type: input.media_type || null,
      media_name: input.media_name || null,
      media_size: input.media_size || null,
    } : {}),
  };
  const client = authenticatedSupabase(accessToken);
  const { data, error } = await client.from("wt_coach_messages").insert(message).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = serviceSupabase();
  let receiverUserId = input.owner_id;
  let senderName = "担当コーチ";
  if (input.sender === "owner") {
    const [{ data: assignment }, { data: ownerProfile }] = await Promise.all([
      admin.from("wt_coach_assignments").select("coach_id").eq("owner_id", input.owner_id).eq("dog_id", input.dog_id).maybeSingle(),
      admin.from("wt_owner_profiles").select("full_name").eq("user_id", input.owner_id).maybeSingle(),
    ]);
    receiverUserId = assignment?.coach_id ?? "";
    senderName = ownerProfile?.full_name || "オーナー";
  } else {
    const { data: coachProfile } = await admin.from("wt_coach_profiles").select("display_name").eq("coach_id", user.id).maybeSingle();
    senderName = coachProfile?.display_name || "担当コーチ";
  }

  if (receiverUserId && receiverUserId !== user.id) {
    try {
      await sendPushNotification(receiverUserId, "BarKnow", `${senderName}さんから新着メッセージがあります`, `/chat/${input.dog_id}`);
    } catch (pushError) {
      console.error("Push notification failed", pushError);
    }
  }

  return NextResponse.json({ message: data });
}
