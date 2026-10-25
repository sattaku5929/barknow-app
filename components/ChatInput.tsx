"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/supabase";
import { ContentPicker, type ContentItem } from "@/components/content/ContentWorkspace";
import { editPhoto, optimizeImage, trimVideo, videoDuration, type QualityMode } from "@/lib/media-optimization";

export type SentChatMessage = {
  id: string;
  sender: "owner" | "coach";
  body: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "";
  mediaName: string;
  contentId: string;
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
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaEditOpen, setMediaEditOpen] = useState(false);
  const [highQuality, setHighQuality] = useState<QualityMode>("standard");
  const [cropSquare, setCropSquare] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [clipDuration, setClipDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) textInput.current?.focus();
  }, [replyTo]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setError(""); setSelectedContent(null); setMediaEditOpen(false); setCropSquare(false); setRotation(0);
    setClipStart(0); setClipEnd(0); setClipDuration(0);
    if (!next) { setFile(null); return; }
    const kind = next.type.startsWith("image/") ? "image" : next.type.startsWith("video/") ? "video" : "";
    if (!kind) { event.target.value = ""; setError("画像または動画を選択してください"); return; }
    if (next.size > (kind === "image" ? 50 : 250) * 1024 * 1024) {
      event.target.value = ""; setError("大きすぎるファイルです。短い動画を選んでください"); return;
    }
    setFile(next);
    if (kind === "video") {
      try { const duration = await videoDuration(next); setClipDuration(duration); setClipEnd(duration); }
      catch { setError("動画を読み取れません。MP4またはWebMをお試しください"); }
    }
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
    if ((!text && !file && !selectedContent) || busy) return;
    setBusy(true);
    setError("");
    try {
      let token = await accessToken();

      let mediaUrl = "";
      let mediaKey = "";
      let mediaType: "image" | "video" | "" = "";
      let uploadedName = "";
      let uploadedSize = 0;
      if (file) {
        let uploadFile: File = file;
        mediaType = file.type.startsWith("image/") ? "image" : "video";
        if (mediaType === "image") {
          uploadFile = await optimizeImage(await editPhoto(file, cropSquare, rotation), highQuality);
          if (uploadFile.size > MAX_IMAGE_BYTES) throw new Error("画像が10MBを超えています。別の画像を選択してください");
        } else {
          if (clipDuration > 0 && (clipStart > 0 || clipEnd < clipDuration)) {
            uploadFile = await trimVideo(file, clipStart, clipEnd);
          } else if (file.size > MAX_VIDEO_BYTES) {
            throw new Error("動画が50MBを超えています。編集して短くするか、小さい動画を選択してください");
          }
          if (uploadFile.size > MAX_VIDEO_BYTES) throw new Error("動画が50MBを超えています。短く編集してください");
        }
        let signedResponse = await requestUploadUrl(uploadFile, token);
        if (signedResponse.status === 401) {
          token = await accessToken(true);
          signedResponse = await requestUploadUrl(uploadFile, token);
        }
        const signed = await signedResponse.json().catch(() => null) as UploadUrlResponse | null;
        if (!signedResponse.ok || !signed?.uploadUrl || !signed.publicUrl) throw new Error(signed?.error || "アップロードを準備できませんでした");
        const uploadResponse = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": uploadFile.type }, body: uploadFile });
        if (!uploadResponse.ok) {
          const detail = await uploadResponse.text().catch(() => "");
          console.error("R2 upload failed", uploadResponse.status, detail.slice(0, 300));
          throw new Error(uploadResponse.status === 401 || uploadResponse.status === 403
            ? "R2へのアップロードが拒否されました。R2の認証情報とCORS設定を確認してください"
            : "メディアをアップロードできませんでした");
        }
        mediaUrl = signed.publicUrl;
        mediaKey = signed.key ?? "";
        uploadedName = uploadFile.name;
        uploadedSize = uploadFile.size;
      }

      const messageBody = text || (selectedContent ? selectedContent.title + "を共有しました" : mediaType === "image" ? "画像を共有しました" : "動画を共有しました");
      const insert = {
        owner_id: ownerId,
        dog_id: dogId,
        sender,
        body: messageBody,
        ...(replyTo ? { reply_to_message_id: replyTo.id } : {}),
        ...(selectedContent ? { content_id: selectedContent.id } : {}),
        ...(mediaUrl ? { media_url: mediaUrl, media_key: mediaKey, media_type: mediaType, media_name: uploadedName, media_size: uploadedSize } : {}),
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
        contentId: String(data.content_id ?? ""),
        createdAt: String(data.created_at),
        replyToId: String(data.reply_to_message_id ?? ""),
        replyToBody: String(data.reply_to_body ?? ""),
        replyToSender: data.reply_to_sender === "owner" || data.reply_to_sender === "coach" ? data.reply_to_sender : "",
        readAt: String(data.read_at ?? ""),
      });
      setBody("");
      setFile(null);
      setSelectedContent(null);
      setMediaEditOpen(false);
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
      {file && <div className="media-file-chip"><span>{file.type.startsWith("image/") ? "画像" : "動画"}</span><b>{file.name}</b>
        <button type="button" disabled={busy} onClick={() => setMediaEditOpen(value => !value)}>{mediaEditOpen ? "編集を閉じる" : "編集"}</button>
        <button type="button" disabled={busy} onClick={() => { setFile(null);setMediaEditOpen(false);if(fileInput.current)fileInput.current.value=""; }} aria-label="選択したファイルを外す">×</button>
      </div>}
      {file && mediaEditOpen && <div className="chat-media-edit" style={{padding:12,background:"#f2f9f4",borderRadius:12,display:"grid",gap:8}}>
        {file.type.startsWith("image/") ? <>
          <label><input type="checkbox" checked={cropSquare} onChange={e=>setCropSquare(e.target.checked)}/>中央を正方形に切り抜く</label>
          <button type="button" onClick={()=>setRotation(deg=>(deg+90)%360)}>右に90度回転（{rotation}°）</button>
          <label><input type="checkbox" checked={highQuality==="high"} onChange={e=>setHighQuality(e.target.checked?"high":"standard")}/>高画質で送信</label>
        </> : <>
          <small>動画の開始・終了位置を選択してください</small>
          <label>開始 {clipStart}秒 <input type="range" min={0} max={Math.max(1,clipEnd-1)} value={clipStart} onChange={e=>setClipStart(Number(e.target.value))}/></label>
          <label>終了 {clipEnd}秒 <input type="range" min={Math.min(clipDuration,clipStart+1)} max={Math.max(1,clipDuration)} value={clipEnd} onChange={e=>setClipEnd(Number(e.target.value))}/></label>
          <small>対応ブラウザでは編集後に変換して送信します。未対応の場合はエラーを表示します。</small>
        </>}
      </div>}
      {selectedContent && <div className="media-file-chip"><span>教材</span><b>{selectedContent.title}</b><button type="button" disabled={busy} onClick={()=>setSelectedContent(null)} aria-label="コンテンツを外す">×</button></div>}
      {pickerOpen && sender==="coach" && <ContentPicker onCancel={()=>setPickerOpen(false)} onPick={item=>{setSelectedContent(item);setFile(null);setPickerOpen(false);if(fileInput.current)fileInput.current.value="";}}/>}
      <textarea ref={textInput} rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder={placeholder} maxLength={3000} />
      {error && <p className="media-chat-error" role="alert">{error}</p>}
      <div className="media-chat-actions">
        <label><span>画像・動画</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={chooseFile} disabled={busy} /></label>
        {sender==="coach" && <button type="button" disabled={busy} onClick={()=>setPickerOpen(open=>!open)} style={{background:"#e8f5ec",color:"#008661",border:"1px solid #b8d8c7",borderRadius:10,padding:"9px 12px",cursor:"pointer"}}>コンテンツから選ぶ</button>}
        <small>{file ? (file.size/1024/1024).toFixed(1)+"MB" : "写真を自動最適化 · 動画最大50MB"}</small>
        <button disabled={busy || (!body.trim() && !file && !selectedContent)}>{busy ? "送信中…" : "送信する"}</button>
      </div>
    </form>
  );
}
