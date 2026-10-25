"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ContentWorkspace.module.css";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

type Props = {
  file: File; duration: number; start: number; end: number; disabled: boolean;
  onReady: (duration: number) => void;
  onRangeChange: (start: number, end: number) => void;
};

export default function VideoTrimEditor({ file, duration, start, end, disabled, onReady, onRangeChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewing = useRef(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    return () => {
      previewing.current = false;
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);
  useEffect(() => { if (disabled) videoRef.current?.pause(); }, [disabled]);
  function seek(value: number) {
    const video = videoRef.current;
    if (!video) return;
    previewing.current = false;
    video.pause();
    video.currentTime = Math.max(0, Math.min(value, video.duration || 0));
  }
  function changeRange(nextStart: number, nextEnd: number, edge: number) {
    onRangeChange(nextStart, nextEnd);
    seek(edge);
  }
  async function playSelection() {
    const video = videoRef.current;
    if (!video) return;
    setError("");
    video.currentTime = start;
    previewing.current = true;
    try { await video.play(); }
    catch { previewing.current = false; setError("動画を再生できませんでした。もう一度お試しください。"); }
  }
  return <section className={styles.editor} aria-label="動画のトリミング">
    <strong>映像を見ながら切り取る</strong>
    <video ref={videoRef} className={styles.trimVideo} controls={!disabled} playsInline preload="metadata"
      onLoadedMetadata={event => {
        const length = event.currentTarget.duration;
        if (Number.isFinite(length) && length > 0) onReady(length);
        else setError("動画の長さを確認できませんでした。別の動画を選んでください。");
      }}
      onError={() => setError("動画を読み込めませんでした。別の動画を選んでください。")}
      onSeeking={event => {
        if (previewing.current && (event.currentTarget.currentTime < start || event.currentTarget.currentTime >= end)) previewing.current = false;
      }}
      onTimeUpdate={event => {
        const video = event.currentTarget;
        setPosition(video.currentTime);
        if (previewing.current && video.currentTime >= end) {
          previewing.current = false;
          video.pause();
          video.currentTime = end;
        }
      }} />
    <small>再生位置 {clock(position)} ／ {clock(duration)}。映像を止めて開始・終了位置を指定できます。</small>
    {duration > 0 && <fieldset className={styles.trimControls} disabled={disabled}>
      <legend>切り取る範囲</legend>
      <label>開始 {clock(start)}<input aria-label="切り取り開始位置" type="range" min={0} max={Math.max(0, end - Math.min(1, duration))} step={0.1} value={start}
        onChange={event => { const next = Number(event.target.value); changeRange(next, end, next); }} /></label>
      <label>終了 {clock(end)}<input aria-label="切り取り終了位置" type="range" min={Math.min(duration, start + Math.min(1, duration))} max={duration} step={0.1} value={end}
        onChange={event => { const next = Number(event.target.value); changeRange(start, next, next); }} /></label>
      <div className={styles.rowActions}>
        <button type="button" onClick={() => { const next = Math.min(position, Math.max(0, end - Math.min(1, duration))); changeRange(next, end, next); }}>現在の位置を開始に</button>
        <button type="button" onClick={() => { const next = Math.max(Math.min(duration, position), start + Math.min(1, duration)); changeRange(start, next, next); }}>現在の位置を終了に</button>
        <button type="button" onClick={() => void playSelection()}>選択範囲を再生</button>
        <button type="button" onClick={() => changeRange(0, duration, 0)}>範囲をリセット</button>
      </div>
      <strong>選択範囲 {clock(start)}〜{clock(end)}（{(end - start).toFixed(1)}秒）</strong>
      {end - start > 180 && <p className={styles.error}>登録する範囲を3分以内にしてください。</p>}
    </fieldset>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <small>切り取った範囲は登録時に保存します。動画編集は対応ブラウザで利用できます。</small>
  </section>;
}
