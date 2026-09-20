"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/supabase";

export type SentChatMessage = {
  id: string;
  sender: "owner" | "coach";
  body: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "";
  mediaName: string;
  createdAt: string;
  replyToId: string;
  replyToBody: string;
  replyToSender: "owner" | "coach" | "";
  readAt: string;
};

export type ChatReplyTarget = {
  id: string;
  sender: "owner" | "coach";
  body: string;
};

type ChatInputProps = {
  ownerId: string;
  dogId: string;
  sender: "owner" | "coach";
  placeholder?: string;
  onSent?: (message: SentChatMessage) => void;
  replyTo?: ChatReplyTarget | null;
  onCancelReply?: () => void;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

type UploadUrlResponse = {
  uploadUrl?: string;
  publicUrl?: string;
  key?: string;
  code?: string;
  error?: string;
};

export default function ChatInput({ ownerId, dogId, sender, placeholder = "メッセージを入力", onSent, replyTo, onCancelReply }: ChatInputProps) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) textInput.current?.focus();
  }, [replyTo]);

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

  async function accessToken(forceRefresh = false): Promise<string> {
    if (forceRefresh) {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !data.session?.access_token) throw new Error("ログインの有効期限が切れました。再度ログインしてください");
      return data.session.access_token;
    }
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) throw new Error("ログイン情報を確認できませんでした。再度ログインしてください");
    const expiresSoon = (data.session.expires_at ?? 0) * 1000 < Date.now() + 60_000;
    return expiresSoon ? accessToken(true) : data.session.access_token;
  }

  async function requestUploadUrl(currentFile: File, token: string) {
    return fetch("/api/upload-url", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: currentFile.name, fileType: currentFile.type, fileSize: currentFile.size, ownerId, dogId }),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if ((!text && !file) || busy) return;
    setBusy(true);
    setError("");
    try {
      let token = await accessToken();

      let mediaUrl = "";
      let mediaKey = "";
      let mediaType: "image" | "video" | "" = "";
      if (file) {
        mediaType = file.type.startsWith("image/") ? "image" : "video";
        let signedResponse = await requestUploadUrl(file, token);
        if (signedResponse.status === 401) {
          token = await accessToken(true);
          signedResponse = await requestUploadUrl(file, token);
        }
        const signed = await signedResponse.json().catch(() => null) as UploadUrlResponse | null;
        if (!signedResponse.ok || !signed?.uploadUrl || !signed.publicUrl) throw new Error(signed?.error || "アップロードを準備できませんでした");
        const uploadResponse = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!uploadResponse.ok) {
          const detail = await uploadResponse.text().catch(() => "");
          console.error("R2 upload failed", uploadResponse.status, detail.slice(0, 300));
          throw new Error(uploadResponse.status === 401 || uploadResponse.status === 403
            ? "R2へのアップロードが拒否されました。R2の認証情報とCORS設定を確認してください"
            : "メディアをアップロードできませんでした");
        }
        mediaUrl = signed.publicUrl;
        mediaKey = signed.key ?? "";
      }

      const messageBody = text || (mediaType === "image" ? "画像を共有しました" : "動画を共有しました");
      const insert = {
        owner_id: ownerId,
        dog_id: dogId,
        sender,
        body: messageBody,
        ...(replyTo ? { reply_to_message_id: replyTo.id } : {}),
        ...(mediaUrl ? { media_url: mediaUrl, media_key: mediaKey, media_type: mediaType, media_name: file?.name ?? "", media_size: file?.size ?? 0 } : {}),
      };
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(insert),
      });
      const result = await response.json().catch(() => null) as { message?: Record<string, string | number | null>; error?: string } | null;
      if (!response.ok || !result?.message) throw new Error(result?.error || "メッセージを送信できませんでした");
      const data = result.message;
      onSent?.({
        id: String(data.id),
        sender: data.sender === "coach" ? "coach" : "owner",
        body: String(data.body ?? ""),
        mediaUrl: String(data.media_url ?? ""),
        mediaType: data.media_type === "image" ? "image" : data.media_type === "video" ? "video" : "",
        mediaName: String(data.media_name ?? ""),
        createdAt: String(data.created_at),
        replyToId: String(data.reply_to_message_id ?? ""),
        replyToBody: String(data.reply_to_body ?? ""),
        replyToSender: data.reply_to_sender === "owner" || data.reply_to_sender === "coach" ? data.reply_to_sender : "",
        readAt: String(data.read_at ?? ""),
      });
      setBody("");
      setFile(null);
      onCancelReply?.();
      if (fileInput.current) fileInput.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "送信できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="media-chat-input" onSubmit={submit}>
      {replyTo && (
        <div className="chat-reply-preview" aria-label="引用返信するメッセージ">
          <span aria-hidden="true">↩</span>
          <div><small>{replyTo.sender === sender ? "あなたのメッセージ" : "相手のメッセージ"}に返信</small><p>{replyTo.body}</p></div>
          <button type="button" onClick={onCancelReply} aria-label="引用返信を取り消す">×</button>
        </div>
      )}
      {file && <div className="media-file-chip"><span>{file.type.startsWith("image/") ? "画像" : "動画"}</span><b>{file.name}</b><button type="button" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }} aria-label="選択したファイルを外す">×</button></div>}
      <textarea ref={textInput} rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder={placeholder} maxLength={3000} />
      {error && <p className="media-chat-error" role="alert">{error}</p>}
      <div className="media-chat-actions">
        <label><span>画像・動画</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={chooseFile} disabled={busy} /></label>
        <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)}MB` : "画像10MB・動画50MBまで"}</small>
        <button disabled={busy || (!body.trim() && !file)}>{busy ? "送信中…" : "送信する"}</button>
      </div>
    </form>
  );
}
