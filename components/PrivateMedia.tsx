"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/supabase";
import { dogAvatarPath } from "@/lib/media-security";

export function useChatMediaUrl(messageId: string, enabled = true) {
  const [resolved, setResolved] = useState({ id: "", url: "" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const response = await fetch("/api/chat/media", {
          method: "POST", cache: "no-store", signal: controller.signal,
          headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        });
        const body = await response.json();
        if (active) setResolved({ id: messageId, url: response.ok ? body.url : "" });
      } catch { if (active) setResolved({ id: messageId, url: "" }); }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 240_000);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) setResolved({ id: "", url: "" });
    });
    return () => { active = false; controller.abort(); clearInterval(timer); listener.subscription.unsubscribe(); };
  }, [messageId, enabled]);
  return enabled && resolved.id === messageId ? resolved.url : "";
}

export function PrivateChatMedia({ messageId, type, alt = "", controls = false, autoPlay = false }: {
  messageId: string; type: "image" | "video"; alt?: string; controls?: boolean; autoPlay?: boolean;
}) {
  const url = useChatMediaUrl(messageId);
  if (!url) return <span aria-label="メディアを読み込み中">…</span>;
  return type === "image" ? <img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" />
    : <video src={url} controls={controls} autoPlay={autoPlay} muted={!controls} playsInline preload="metadata" />;
}

export function PrivateDogImage({ src, alt }: { src: string; alt: string }) {
  const [resolved, setResolved] = useState({ src: "", url: "" });
  useEffect(() => {
    const path = dogAvatarPath(src);
    if (!path) return;
    let active = true;
    async function refresh() {
      try {
        const { data, error } = await supabase.storage.from("dog-avatars").createSignedUrl(path!, 300);
        if (active) setResolved({ src, url: error ? "" : data.signedUrl });
      } catch { if (active) setResolved({ src, url: "" }); }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 240_000);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) setResolved({ src: "", url: "" });
    });
    return () => { active = false; clearInterval(timer); listener.subscription.unsubscribe(); };
  }, [src]);
  return resolved.src === src && resolved.url ? <img src={resolved.url} alt={alt} referrerPolicy="no-referrer" /> : <span aria-label={alt}>…</span>;
}
