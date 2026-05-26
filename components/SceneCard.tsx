"use client";

import type { Scene, SceneAsset } from "@/lib/types";

interface Props {
  scene: Scene;
  asset?: SceneAsset;
}

export function SceneCard({ scene, asset }: Props) {
  const hasFrame = !!asset?.imageUrl;
  const hasVideo = !!asset?.videoUrl;
  const hasAudio = !!asset?.audioUrl;

  const stage = hasVideo ? "video" : hasFrame ? "frame" : "pending";

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur overflow-hidden">
      <div className="aspect-video relative bg-zinc-950 flex items-center justify-center">
        {stage === "pending" && (
          <div className="flex flex-col items-center gap-2 text-zinc-500 text-sm">
            <div className="h-6 w-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            <span>等待中</span>
          </div>
        )}
        {stage === "frame" && (
          // 已下载关键帧，等待视频
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset!.imageUrl!}
              alt={`scene ${scene.id}`}
              className="absolute inset-0 w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-xs text-zinc-200">
              <div className="h-3 w-3 border-2 border-zinc-300 border-t-transparent rounded-full animate-spin" />
              生成视频中…
            </div>
          </>
        )}
        {stage === "video" && (
          <video
            src={asset!.videoUrl!}
            controls
            muted
            playsInline
            loop
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-xs text-zinc-200 backdrop-blur">
          #{scene.id}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-sm text-zinc-100 leading-snug">{scene.narration}</p>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
          <span className={hasFrame ? "text-emerald-400" : ""}>● 关键帧</span>
          <span className={hasVideo ? "text-emerald-400" : ""}>● 视频</span>
          <span className={hasAudio ? "text-emerald-400" : ""}>● 配音</span>
        </div>
      </div>
    </div>
  );
}
