export type QualityMode = "standard" | "high";

function blobAsFile(blob: Blob, name: string) {
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}

export async function optimizeImage(file: File, quality: QualityMode = "standard"): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const maxSide = quality === "high" ? 2560 : 1920;
    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    // Do not recompress already-small files when resolution is acceptable.
    if (ratio === 1 && file.size < (quality === "high" ? 3_000_000 : 1_000_000)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality === "high" ? 0.93 : 0.84)
    );
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    return blobAsFile(blob, file.name.replace(/\.[^.]+$/, "") + ".webp");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Trim in supporting desktop browsers without uploading the original.
 * If captureStream/MediaRecorder is unavailable we refuse rather than silently
 * sending the untrimmed video. Encoding is realtime to avoid huge wasm downloads.
 */
export async function trimVideo(file: File, startSeconds: number, endSeconds: number): Promise<File> {
  if (!("MediaRecorder" in window) || typeof MediaRecorder.isTypeSupported !== "function") {
    throw new Error("この端末では動画の編集に対応していません");
  }
  const mime = ["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"]
    .find(MediaRecorder.isTypeSupported);
  if (!mime) throw new Error("この端末では動画の書き出しに対応していません");
  const url=URL.createObjectURL(file);
  const video=document.createElement("video");
  video.preload="auto";
  video.src=url;
  video.playsInline=true;
  video.muted=false;
  try {
    await new Promise<void>((resolve,reject)=>{
      video.onloadedmetadata=()=>resolve();
      video.onerror=()=>reject(new Error("動画を読み取れませんでした"));
    });
    if (!(startSeconds>=0 && endSeconds>startSeconds && endSeconds<=video.duration+0.1 && endSeconds-startSeconds<=180)) {
      throw new Error("切り取る範囲を確認してください");
    }
    video.currentTime=startSeconds;
    await new Promise<void>((resolve)=>{video.onseeked=()=>resolve();});
    const capture=(video as HTMLVideoElement & {captureStream?:()=>MediaStream}).captureStream;
    if (!capture) throw new Error("この端末では動画のトリミングに対応していません");
    const stream=capture.call(video);
    const chunks:BlobPart[]=[];
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1_600_000});
    await new Promise<void>((resolve,reject)=>{
      let completed=false;
      const finish=(error?:Error)=>{if(completed)return;completed=true;video.pause();stream.getTracks().forEach(t=>t.stop());error?reject(error):resolve();};
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>finish(new Error("動画の編集に失敗しました"));
      recorder.onstop=()=>finish();
      video.ontimeupdate=()=>{
        if(video.currentTime>=endSeconds && recorder.state!=="inactive")recorder.stop();
      };
      video.onended=()=>{if(recorder.state!=="inactive")recorder.stop();};
      recorder.start(1000);
      void video.play().catch(()=>{if(recorder.state!=="inactive")recorder.stop();finish(new Error("動画の再生に失敗しました"));});
    });
    const result=new Blob(chunks,{type:"video/webm"});
    if (!result.size) throw new Error("編集した動画を保存できませんでした");
    return blobAsFile(result,file.name.replace(/\.[^.]+$/,"") + "-trim.webm");
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function videoDuration(file: File): Promise<number> {
  const url=URL.createObjectURL(file);
  try {
    const video=document.createElement("video");
    video.preload="metadata";
    video.src=url;
    return await new Promise<number>((resolve,reject)=>{
      video.onloadedmetadata=()=>resolve(Math.ceil(video.duration));
      video.onerror=()=>reject(new Error("動画の長さを確認できませんでした"));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Optional manual crop and 90-degree rotations (preserves alpha via WebP). */
export async function editPhoto(file: File, cropSquare: boolean, rotation: number): Promise<File> {
  const turns=((Math.round(rotation/90)%4)+4)%4;
  if(!cropSquare && turns===0)return file;
  if(file.type==="image/gif")throw new Error("GIFの編集には対応していません");
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();image.src=url;await image.decode();
    const side=Math.min(image.width,image.height);
    const sw=cropSquare?side:image.width, sh=cropSquare?side:image.height;
    const sx=(image.width-sw)/2, sy=(image.height-sh)/2;
    const canvas=document.createElement("canvas");
    canvas.width=turns%2?sh:sw;canvas.height=turns%2?sw:sh;
    const ctx=canvas.getContext("2d");if(!ctx)throw new Error("画像を編集できません");
    ctx.translate(canvas.width/2,canvas.height/2);
    ctx.rotate(turns*Math.PI/2);
    ctx.drawImage(image,sx,sy,sw,sh,-sw/2,-sh/2,sw,sh);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",.93));
    if(!blob || blob.type!=="image/webp")throw new Error("画像を書き出せません");
    return blobAsFile(blob,file.name.replace(/\.[^.]+$/,"")+"-edited.webp");
  }finally{URL.revokeObjectURL(url);}
}
