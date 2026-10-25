"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/supabase";
import { optimizeImage, videoDuration } from "@/lib/media-optimization";
import styles from "./ContentWorkspace.module.css";

export type ContentItem = {
  id:string;authorId:string;origin:"coach"|"admin";format:"video"|"image"|"article";
  sharing:"private"|"coaches"|"team";title:string;description:string;category:string;
  tags:string[];body:string;size:number;duration:number|null;archived:boolean;blocked:boolean;createdAt:string;
};
const categories=["吠え","噛み癖","トイレ","お散歩","お留守番","基本のしつけ","社会化・慣れ","その他"];
const formats: Record<ContentItem["format"],string>={video:"動画",image:"画像",article:"記事"};
async function call<T>(url:string,method="GET",payload?:unknown):Promise<T>{
  const {data}=await supabase.auth.getSession();
  if(!data.session?.access_token) throw new Error("再度ログインしてください");
  const response=await fetch(url,{method,cache:"no-store",headers:{
    Authorization:`Bearer ${data.session.access_token}`,
    ...(payload===undefined?{}:{"Content-Type":"application/json"}),
  },...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(result?.error||"通信に失敗しました");
  return result as T;
}
const friendlyBytes=(value:number)=>value>=1024*1024?`${(value/1024/1024).toFixed(1)}MB`:`${Math.round(value/1024)}KB`;

function match(item:ContentItem,query:string,category:string,format:string,source:string,uid:string){
  const q=query.trim().toLocaleLowerCase();
  return (!q || [item.title,item.description,item.category,...item.tags].join(" ").toLocaleLowerCase().includes(q)) &&
    (category==="すべて"||item.category===category) &&
    (format==="all"||item.format===format) &&
    (source==="all"||(source==="mine"&&item.authorId===uid)||(source==="shared"&&item.authorId!==uid));
}

export function ContentPicker({onPick,onCancel}:{
  onPick:(item:ContentItem)=>void;onCancel:()=>void;
}){
  const [items,setItems]=useState<ContentItem[]>([]);
  const [uid,setUid]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [q,setQ]=useState("");
  const [category,setCategory]=useState("すべて");
  const [format,setFormat]=useState("all");
  const [source,setSource]=useState("all");
  useEffect(()=>{
    let alive=true;
    void Promise.all([call<{items:ContentItem[]}>("/api/content/items"),supabase.auth.getUser()])
      .then(([result,auth])=>{if(alive){setItems(result.items.filter(x=>!x.archived&&!x.blocked));setUid(auth.data.user?.id??"");}})
      .catch(err=>{if(alive)setError(err instanceof Error?err.message:"読み込みに失敗しました");})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[]);
  const results=useMemo(()=>items.filter(x=>match(x,q,category,format,source,uid)),[items,q,category,format,source,uid]);
  return <section className={styles.picker} aria-label="コンテンツを選ぶ">
    <header className={styles.heading}><div><strong>コンテンツから選ぶ</strong><small>悩みに合う動画・画像・記事を探す</small></div><button type="button" onClick={onCancel} aria-label="閉じる">×</button></header>
    <input className={styles.search} aria-label="キーワード検索" value={q} onChange={e=>setQ(e.target.value)} placeholder="例：吠え、散歩、トイレ"/>
    <div className={styles.filters}>
      <select aria-label="カテゴリー" value={category} onChange={e=>setCategory(e.target.value)}><option>すべて</option>{categories.map(x=><option key={x}>{x}</option>)}</select>
      <select aria-label="形式" value={format} onChange={e=>setFormat(e.target.value)}><option value="all">すべての形式</option><option value="video">動画</option><option value="image">画像</option><option value="article">記事</option></select>
      <select aria-label="投稿者" value={source} onChange={e=>setSource(e.target.value)}><option value="all">すべての投稿</option><option value="mine">マイ動画・記事</option><option value="shared">共有コンテンツ</option></select>
    </div>
    {loading?<p>読み込み中…</p>:error?<p role="alert">{error}</p>:<div className={styles.resultList} aria-live="polite">
      <small>{results.length}件のコンテンツ</small>
      {results.length===0&&<p>該当するコンテンツがありません。</p>}
      {results.map(item=><button type="button" className={styles.result} key={item.id} onClick={()=>onPick(item)}>
        <span className={styles.typeIcon}>{item.format==="video"?"▶":item.format==="image"?"▧":"≡"}</span>
        <span><strong>{item.title}</strong><small>{item.category} · {formats[item.format]} · {item.origin==="admin"?"運営":item.authorId===uid?"マイコンテンツ":"共有コンテンツ"}</small></span>
        <span aria-hidden="true">＋</span>
      </button>)}
    </div>}
  </section>;
}

type FormState={title:string;description:string;category:string;tags:string;sharing:"private"|"coaches";format:"video"|"image"|"article";body:string};
const empty:FormState={title:"",description:"",category:"その他",tags:"",sharing:"private",format:"video",body:""};
export default function ContentWorkspace({role}:{role:"coach"|"admin"}){
  const [items,setItems]=useState<ContentItem[]>([]);
  const [authors,setAuthors]=useState<Record<string,string>>({});
  const [uid,setUid]=useState("");
  const [usage,setUsage]=useState<{bytes:number;objects:number;limitBytes:number;warningBytes:number}|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [form,setForm]=useState<FormState>(empty);
  const [file,setFile]=useState<File|null>(null);
  const [q,setQ]=useState("");
  const [category,setCategory]=useState("すべて");
  const [editing,setEditing]=useState<string|null>(null);
  async function refresh(){
    const [result,auth]=await Promise.all([call<{items:ContentItem[];authors:Record<string,string>}>("/api/content/items"),supabase.auth.getUser()]);
    setItems(result.items);setAuthors(result.authors);setUid(auth.data.user?.id??"");
    if(role==="admin"){
      try {const result=await call<{usage:{bytes:number;objects:number;limitBytes:number;warningBytes:number}}>("/api/content/usage");setUsage(result.usage);}
      catch{setUsage(null);}
    }
  }
  useEffect(()=>{let alive=true;const timeout=window.setTimeout(()=>{void refresh().catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});},0);return()=>{alive=false;window.clearTimeout(timeout);};},[role]);
  async function chooseFile(e:ChangeEvent<HTMLInputElement>){
    const next=e.target.files?.[0]??null;setError("");
    if(!next){setFile(null);return;}
    if(!(next.type.startsWith("video/")||next.type.startsWith("image/"))){setError("画像または動画を選択してください");return;}
    setFile(next);if(!form.title)setForm(current=>({...current,title:next.name.replace(/\.[^.]+$/,"").slice(0,120)}));
  }
  async function saveNew(){
    if(saving)return;
    setSaving(true);setError("");setNotice("");
    try{
      if(!form.title.trim())throw new Error("タイトルを入力してください");
      let key:string|undefined;let duration:number|undefined;
      const format=form.format;
      if(format!=="article"){
        if(!file)throw new Error("画像または動画を選んでください");
        const prepared=format==="image"?await optimizeImage(file):file;
        if(format==="video")duration=await videoDuration(prepared);
        if(format==="video"&&(!duration||duration>180))throw new Error("動画は3分以内にしてください");
        const max=format==="video"?30:5;
        if(prepared.size>max*1024*1024)throw new Error(`ファイルが${max}MBを超えています。短く編集するか画質を調整してください`);
        const signed=await call<{uploadUrl:string;key:string}>("/api/content/upload","POST",{
          type:prepared.type,size:prepared.size,duration,
        });
        const uploaded=await fetch(signed.uploadUrl,{method:"PUT",headers:{"Content-Type":prepared.type},body:prepared});
        if(!uploaded.ok)throw new Error("アップロードに失敗しました。R2 CORS設定を確認してください");
        key=signed.key;
      }
      await call("/api/content/items","POST",{
        ...form,format,key,duration,tags:form.tags.split(","),
      });
      setForm(empty);setFile(null);setNotice("コンテンツを登録しました");await refresh();
    }catch(e){setError(e instanceof Error?e.message:"登録できませんでした");}
    finally{setSaving(false);}
  }
  async function changeItem(id:string,changes:Record<string,unknown>){
    if(saving)return;setSaving(true);setError("");setNotice("");
    try {await call("/api/content/items","PATCH",{id,...changes});await refresh();setNotice("変更を保存しました");}
    catch(e){setError(e instanceof Error?e.message:"更新できませんでした");}finally{setSaving(false);}
  }
  const visible=useMemo(()=>items.filter(i=>match(i,q,category,"all","all",uid)),[items,q,category,uid]);
  const active=items.filter(i=>!i.archived&&!i.blocked);
  return <section className={styles.workspace} aria-label="コンテンツ管理">
    <div className={styles.title}><div><small>{role==="admin"?"WAN TONE / CONTENT OPERATIONS":"WAN TONE / MY CONTENT"}</small>
      <h2>{role==="admin"?"共通コンテンツ・動画管理":"マイ動画・コンテンツ"}</h2>
      <p>{role==="admin"?"運営教材の作成とコーチ別のストックを一元管理します。":"悩み別に素材をストックし、チャットからすぐに送れます。"}</p></div>
      <strong>{active.length}<small> 件</small></strong>
    </div>
    {role==="admin"&&<div className={styles.stats}>
      <div><small>登録コンテンツ</small><strong>{items.length}</strong></div>
      <div><small>コーチ登録</small><strong>{items.filter(i=>i.origin==="coach").length}</strong></div>
      <div><small>運営コンテンツ</small><strong>{items.filter(i=>i.origin==="admin").length}</strong></div>
      <div><small>R2 保存容量（実測）</small><strong>{usage?friendlyBytes(usage.bytes):"確認不可"}</strong>
        {usage&&<progress max={usage.limitBytes} value={usage.bytes} aria-label="R2利用容量"/>}</div>
    </div>}
    <div className={styles.panel}>
      <h3>{role==="admin"?"運営コンテンツを追加":"マイコンテンツを追加"}</h3>
      <div className={styles.filters}>
        <label>形式<select value={form.format} onChange={e=>{setForm(f=>({...f,format:e.target.value as FormState["format"]}));setFile(null);}}>
          <option value="video">動画</option><option value="image">画像</option>{role==="admin"&&<option value="article">解説記事</option>}
        </select></label>
        <label>悩みの種類<select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      </div>
      <label>タイトル（必須）<input maxLength={120} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="例：他の犬とすれ違うときの練習"/></label>
      {form.format!=="article"?<label>動画・画像ファイル<input type="file" accept={form.format==="video"?"video/mp4,video/webm":"image/jpeg,image/png,image/webp"} onChange={chooseFile}/>
        <small>動画3分・30MB以内、画像5MB以内。画像は画質を保って自動最適化します。</small></label>:
        <label>記事本文（必須）<textarea rows={7} value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} maxLength={12000}/></label>}
      <label>説明（任意）<textarea rows={2} maxLength={2000} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label>
      <label>検索タグ（カンマ区切り）<input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="例：来客,吠え,練習"/></label>
      {role==="coach"&&<label>コーチ間共有<select value={form.sharing} onChange={e=>setForm(f=>({...f,sharing:e.target.value as FormState["sharing"]}))}>
        <option value="private">自分専用</option><option value="coaches">他のコーチにも共有</option>
      </select></label>}
      {file&&<p className={styles.helper}>選択中：{file.name}（{friendlyBytes(file.size)}）</p>}
      <button type="button" className={styles.primary} disabled={saving} onClick={()=>void saveNew()}>{saving?"処理中…":"登録する"}</button>
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      {notice&&<p role="status" className={styles.success}>{notice}</p>}
    </div>
    <div className={styles.panel}>
      <h3>{role==="admin"?"全コーチ・運営の登録一覧":"登録済みのコンテンツ"}</h3>
      <div className={styles.filters}>
        <input aria-label="コンテンツ検索" placeholder="タイトル・タグで検索" value={q} onChange={e=>setQ(e.target.value)}/>
        <select aria-label="カテゴリー絞り込み" value={category} onChange={e=>setCategory(e.target.value)}><option>すべて</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
      </div>
      {loading?<p>読み込み中…</p>:visible.length===0?<p className={styles.helper}>まだコンテンツがありません。</p>:<div className={styles.resultList}>
        {visible.map(item=><article className={styles.row} key={item.id}>
          <div className={styles.typeIcon}>{item.format==="video"?"▶":item.format==="image"?"▧":"≡"}</div>
          <div className={styles.rowBody}>
            <strong>{item.title}</strong>
            <small>{item.category} · {formats[item.format]} · {role==="admin"?(item.origin==="admin"?"運営":authors[item.authorId]||"コーチ"):item.authorId===uid?"自分":"共有動画"} · {item.sharing==="private"?"非共有":"コーチ共有"}</small>
            {item.archived&&<small>アーカイブ済み（送信済みの相手は引き続き閲覧可）</small>}
            {item.blocked&&<small className={styles.error}>運営によって視聴停止中</small>}
            {item.body&&<p>{item.body.slice(0,150)}{item.body.length>150?"…":""}</p>}
            <div className={styles.rowActions}>
              {!item.blocked&&!item.archived&&<ContentPreview contentId={item.id} format={item.format}/>}
              {item.authorId===uid&&<button type="button" disabled={saving} onClick={()=>setEditing(editing===item.id?null:item.id)}>編集</button>}
              {item.authorId===uid&&<button type="button" disabled={saving} onClick={()=>void changeItem(item.id,{archived:!item.archived})}>{item.archived?"再公開":"アーカイブ"}</button>}
              {role==="admin"&&<button type="button" disabled={saving} onClick={()=>void changeItem(item.id,{blocked:!item.blocked})}>{item.blocked?"視聴停止を解除":"視聴停止"}</button>}
            </div>
            {editing===item.id&&<ContentItemEditor key={item.id} item={item} save={c=>void changeItem(item.id,c)} cancel={()=>setEditing(null)} saving={saving}/>}
          </div>
        </article>)}
      </div>}
    </div>
  </section>;
}
function ContentItemEditor({item,save,cancel,saving}:{item:ContentItem;save:(changes:Record<string,unknown>)=>void;cancel:()=>void;saving:boolean}){
  const [title,setTitle]=useState(item.title);
  const [sharing,setSharing]=useState(item.sharing);
  const [category,setCategory]=useState(item.category);
  const [body,setBody]=useState(item.body);
  return <div className={styles.editor}>
    <label>タイトル<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>カテゴリー<select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
    {item.origin==="coach"&&<label>共有範囲<select value={sharing} onChange={e=>setSharing(e.target.value as ContentItem["sharing"])}><option value="private">自分専用</option><option value="coaches">他コーチ共有</option></select></label>}
    {item.format==="article"&&<label>記事<textarea rows={5} value={body} onChange={e=>setBody(e.target.value)}/></label>}
    <button type="button" disabled={saving} onClick={()=>save({title,category,sharing,body})}>変更を保存</button>
    <button type="button" onClick={cancel}>キャンセル</button>
  </div>;
}
function ContentPreview({contentId,format}:{contentId:string;format:ContentItem["format"]}){
  const [url,setUrl]=useState("");
  const [error,setError]=useState("");
  if(format==="article")return null;
  return <div className={styles.preview}>
    <button type="button" onClick={()=>{void call<{url:string}>("/api/content/media","POST",{contentId}).then(r=>setUrl(r.url)).catch(e=>setError(e.message));}}>プレビュー</button>
    {error&&<small role="alert">{error}</small>}
    {url&&(format==="video"?<video src={url} controls playsInline preload="metadata"/>:<img src={url} alt="登録画像のプレビュー"/>)}
  </div>;
}
