"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/supabase";
import type { ContentItem } from "@/components/content/ContentWorkspace";
import { PrivateChatMedia } from "@/components/PrivateMedia";
import styles from "./ChatContent.module.css";

type ChatMedia = {
  id:string;body:string;sender:"owner"|"coach";mediaUrl:string;
  mediaType:"image"|"video"|"";mediaName:string;contentId?:string;createdAt:string;
};
async function api<T>(path:string, method="GET", data?:unknown):Promise<T>{
  const {data:session}=await supabase.auth.getSession();
  if(!session.session?.access_token)throw new Error("ログインが必要です");
  const response=await fetch(path,{method,cache:"no-store",headers:{
    Authorization:`Bearer ${session.session.access_token}`,
    ...(data===undefined?{}:{"Content-Type":"application/json"}),
  },...(data===undefined?{}:{body:JSON.stringify(data)})});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(result?.error||"取得できませんでした");
  return result as T;
}
function useReceivedContent(messageId:string){
  const [state,setState]=useState<{messageId:string;item:ContentItem|null;error:string}>({messageId:"",item:null,error:""});
  useEffect(()=>{
    let alive=true;
    void api<{item:ContentItem}>(`/api/content/items?messageId=${encodeURIComponent(messageId)}`)
      .then(r=>{if(alive)setState({messageId,item:r.item,error:""});})
      .catch(e=>{if(alive)setState({messageId,item:null,error:e instanceof Error?e.message:"表示できません"});});
    return()=>{alive=false;};
  },[messageId]);
  return state.messageId===messageId?state:{messageId,item:null,error:""};
}
export function ContentAttachment({messageId,compact=false}:{messageId:string;compact?:boolean}){
  const state=useReceivedContent(messageId);
  const item=state.item;
  if(state.error)return <p className={styles.unavailable}>このコンテンツは現在閲覧できません。</p>;
  if(!item)return <p className={styles.loading}>コンテンツを読み込み中…</p>;
  return <article className={styles.attachment}>
    <div className={styles.attachmentHeader}><span>{item.format==="video"?"▶":item.format==="image"?"▧":"≡"}</span>
      <div><strong>{item.title}</strong><small>{item.category} · {item.format==="video"?"動画":item.format==="image"?"画像":"解説記事"}</small></div>
    </div>
    {item.description&&!compact&&<p>{item.description}</p>}
    {item.format==="article"?<details><summary>解説記事を読む</summary><p className={styles.articleBody}>{item.body}</p></details>:<SignedContentMedia item={item} messageId={messageId}/>}
  </article>;
}
function SignedContentMedia({item,messageId}:{item:ContentItem;messageId:string}){
  const [url,setUrl]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    async function load(){
      try{
        const {url}=await api<{url:string}>("/api/content/media","POST",{contentId:item.id,messageId});
        if(alive)setUrl(url);
      }catch{if(alive)setError("メディアを読み込めませんでした");}
    }
    void load();
    const interval=window.setInterval(()=>void load(),240000);
    return()=>{alive=false;window.clearInterval(interval);};
  },[item.id,messageId]);
  if(error)return <p className={styles.unavailable}>{error}</p>;
  if(!url)return <p className={styles.loading}>読み込み中…</p>;
  return item.format==="video"?<video src={url} controls playsInline preload="metadata" className={styles.media}/>:
    <img src={url} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className={styles.media}/>;
}

export function ChatMediaLibrary({messages,onClose,onJump}:{
  messages:ChatMedia[];onClose:()=>void;onJump:(messageId:string)=>void;
}){
  const [tab,setTab]=useState<"all"|"image"|"video"|"article">("all");
  const [q,setQ]=useState("");
  const [content,setContent]=useState<Record<string,ContentItem>>({});
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let alive=true;
    const includes=messages.filter(m=>m.contentId);
    if(includes.length===0)return;
    void Promise.all(includes.map(m=>api<{item:ContentItem}>(`/api/content/items?messageId=${encodeURIComponent(m.id)}`).then(r=>[m.id,r.item] as const).catch(()=>null)))
      .then(results=>{if(alive)setContent(Object.fromEntries(results.filter((r):r is readonly [string,ContentItem]=>r!==null)));})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[messages]);
  const filtered=useMemo(()=>{
    const seen=new Set<string>();
    return [...messages].reverse().filter(m=>{
      if(!m.mediaUrl&&!m.contentId)return false;
      const key=m.contentId?`content:${m.contentId}`:`message:${m.id}`;
      if(seen.has(key))return false;
      seen.add(key);
      const item=content[m.id];
      const type=item?.format==="article"?"article":item?.format==="image"?"image":item?.format==="video"?"video":m.mediaType;
      const label=item?.title||m.mediaName||m.body;
      return (tab==="all"||type===tab)&&[label,item?.category,item?.description,...(item?.tags??[])].join(" ").toLocaleLowerCase().includes(q.trim().toLocaleLowerCase());
    });
  },[messages,content,tab,q]);
  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="メディア一覧" onClick={onClose}>
    <section className={styles.library} onClick={event=>event.stopPropagation()}>
      <header className={styles.libraryHeader}>
        <div><small>SHARED MEDIA</small><h2>メディア一覧</h2><p>写真・動画・記事をまとめて探せます</p></div>
        <button type="button" onClick={onClose} aria-label="メディア一覧を閉じる">×</button>
      </header>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="タイトル・キーワードで検索" aria-label="メディアを検索" className={styles.search}/>
      <div className={styles.tabs} role="group" aria-label="メディアの種類">
        {([["all","すべて"],["image","写真"],["video","動画"],["article","記事"]] as const).map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
      </div>
      {loading&&<small>コンテンツ情報を確認中…</small>}
      <div className={styles.entries} aria-live="polite">
        {filtered.length===0&&<p>該当するメディアはありません。</p>}
        {filtered.map(m=>{
          const item=content[m.id];
          const type=item?.format||m.mediaType;
          return <article key={m.id} className={styles.entry}>
            <div className={styles.entryInfo}>
              <span className={styles.icon}>{type==="article"?"≡":type==="video"?"▶":"▧"}</span>
              <div><strong>{item?.title||m.mediaName||(type==="video"?"共有された動画":"共有された写真")}</strong>
                <small>{m.sender==="coach"?"コーチ":"オーナー"} · {new Date(m.createdAt).toLocaleDateString("ja-JP")}</small></div>
            </div>
            {m.contentId?<ContentAttachment messageId={m.id} compact/>:
              m.mediaType==="image"?<div className={styles.thumbnail}><PrivateChatMedia messageId={m.id} type="image" alt={m.mediaName}/></div>:
              <div className={styles.thumbnail}><PrivateChatMedia messageId={m.id} type="video" controls/></div>}
            <button type="button" className={styles.jump} onClick={()=>onJump(m.id)}>元のメッセージへ移動</button>
          </article>;
        })}
      </div>
    </section>
  </div>;
}
