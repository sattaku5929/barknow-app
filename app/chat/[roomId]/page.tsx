import { redirect } from "next/navigation";

export default async function ChatRedirectPage({ params, searchParams }: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ recipient?: string }>;
}) {
  const { roomId } = await params;
  const { recipient } = await searchParams;
  const recipientQuery = recipient === "owner" || recipient === "coach" ? `&recipient=${recipient}` : "";
  redirect(`/?view=coach&chatDog=${encodeURIComponent(roomId)}${recipientQuery}`);
}
