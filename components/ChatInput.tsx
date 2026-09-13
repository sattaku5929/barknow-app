"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { supabase } from "@/app/supabase";

export type SentChatMessage = {
  id: string;
  sender: "owner" | "coach";
  body: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "";
  mediaName: string;
  createdAt: string;
};

type ChatInputProps = {
  ownerId: string;
  dogId: string;
  sender: "owner" | "coach";
  placeholder?: string;
  onSent?: (message: SentChatMessage) => void;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export default function ChatInput({ ownerId, dogId, sender, placeholder = "メッセージを入力", onSent }: ChatInputProps) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setError("");
    if (!next) return setFile(null);
    const kind = next.type.startsWith("image/") ? "image" : next.type.startsWith("video/") ? "video" : "";
    if (!kind) {
      event.target.value = "";
      return setError("画像または動画を選択してください");
    }
    const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (next.size > limit) {
      event.target.value = "";
      return setError(`${kind === "image" ? "画像は10MB" : "動画は50MB"}以下にしてください`);
    }
    setFile(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if ((!text && !file) || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("ログイン情報を確認できませんでした");

      let mediaUrl = "";
      let mediaKey = "";
      let mediaType: "image" | "video" | "" = "";
      if (file) {
        mediaType = file.type.startsWith("image/") ? "image" : "video";
        const signedResponse = await fetch("/api/upload-url", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, ownerId, dogId }),
        });
        const signed = await signedResponse.json().catch(() => null) as { uploadUrl?: string; publicUrl?: string; key?: string; error?: string } | null;
        if (!signedResponse.ok || !signed?.uploadUrl || !signed.publicUrl) throw new Error(signed?.error || "アップロードを準備できませんでした");
        const uploadResponse = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!uploadResponse.ok) throw new Error("メディアをアップロードできませんでした");
        mediaUrl = signed.publicUrl;
        mediaKey = signed.key ?? "";
      }

      const messageBody = text || (mediaType === "image" ? "画像を共有しました" : "動画を共有しました");
      const insert = {
        owner_id: ownerId,
        dog_id: dogId,
        sender,
        body: messageBody,
        ...(mediaUrl ? { media_url: mediaUrl, media_key: mediaKey, media_type: mediaType, media_name: file?.name ?? "", media_size: file?.size ?? 0 } : {}),
      };
      const { data, error: insertError } = await supabase.from("wt_coach_messages").insert(insert).select("*").single();
      if (insertError) throw insertError;
      onSent?.({ id: data.id, sender: data.sender, body: data.body ?? "", mediaUrl: data.media_url ?? "", mediaType: data.media_type ?? "", mediaName: data.media_name ?? "", createdAt: data.created_at });
      setBody("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "送信できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="media-chat-input" onSubmit={submit}>
      {file && <div className="media-file-chip"><span>{file.type.startsWith("image/") ? "画像" : "動画"}</span><b>{file.name}</b><button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }} aria-label="選択したファイルを外す">×</button></div>}
      <textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder={placeholder} maxLength={3000} />
      {error && <p className="media-chat-error" role="alert">{error}</p>}
      <div className="media-chat-actions">
        <label><span>画像・動画</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={chooseFile} disabled={busy} /></label>
        <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)}MB` : "画像10MB・動画50MBまで"}</small>
        <button disabled={busy || (!body.trim() && !file)}>{busy ? "送信中…" : "送信する"}</button>
      </div>
    </form>
  );
}
