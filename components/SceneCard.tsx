"use client";

import { AlertTriangle, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Scene, SceneAsset } from "@/lib/types";

interface Props {
  scene: Scene;
  asset?: SceneAsset;
  errorMessage?: string;
  aspectClass?: string;
  // 是否已向后端提交了关键帧请求（用于区分 "排队" vs "生成中"）
  frameSubmitted?: boolean;
  // 是否还在等配音（用于 dot 的 loading 态）
  audioPending?: boolean;
}

type Stage =
  | "error"
  | "video_ready"      // 视频已生成
  | "video_processing" // 图已生成、视频生成中
  | "frame_processing" // 帧提交了、还没出图
  | "queued";          // 还没提交

export function SceneCard({
  scene,
  asset,
  errorMessage,
  aspectClass = "aspect-video",
  frameSubmitted,
  audioPending,
}: Props) {
  const hasFrame = !!asset?.imageUrl;
  const hasVideo = !!asset?.videoUrl;
  const hasAudio = !!asset?.audioUrl;
  const stage: Stage = errorMessage
    ? "error"
    : hasVideo
      ? "video_ready"
      : hasFrame
        ? "video_processing"
        : frameSubmitted
          ? "frame_processing"
          : "queued";

  const isWorking =
    stage === "frame_processing" || stage === "video_processing";

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border bg-card overflow-hidden transition-colors",
        stage === "error"
          ? "border-destructive/40"
          : isWorking
            ? "border-foreground/30"
            : "border-border",
      )}
    >
      <div
        className={cn(
          aspectClass,
          "relative bg-muted flex items-center justify-center overflow-hidden",
        )}
      >
        {stage === "queued" && (
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-4 animate-spin opacity-60" />
            <span>排队中</span>
          </div>
        )}
        {stage === "frame_processing" && (
          <>
            {/* shimmer 背景 */}
            <div
              className="absolute inset-0 animate-shimmer"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent 0%, oklch(0 0 0 / 0.06) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
              }}
            />
            <div className="relative flex flex-col items-center gap-2 text-foreground text-xs">
              <Loader2 className="size-4 animate-spin" />
              <span className="font-medium">生成关键帧</span>
            </div>
          </>
        )}
        {stage === "error" && (
          <div className="flex flex-col items-center gap-2 text-destructive text-xs px-3 text-center">
            <AlertTriangle className="size-4" />
            <span className="line-clamp-3 break-words">{errorMessage}</span>
          </div>
        )}
        {(stage === "video_processing" || stage === "video_ready") && (
          <>
            {stage === "video_ready" ? (
              <video
                src={asset!.videoUrl!}
                controls
                muted
                playsInline
                loop
                autoPlay
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset!.imageUrl!}
                  alt={`scene ${scene.id}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* 顶部 indeterminate 进度条 */}
                <div className="absolute top-0 inset-x-0 h-0.5 overflow-hidden bg-black/30">
                  <div className="h-full w-1/3 bg-white/90 animate-indeterminate" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 text-[11px] text-white/95">
                  <Loader2 className="size-3 animate-spin" />
                  <span className="font-medium">生成视频中</span>
                </div>
              </>
            )}
          </>
        )}
        <div className="absolute top-2 left-2 font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-background/85 text-foreground tabular-nums z-10">
          {String(scene.id).padStart(2, "0")}
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2 border-t border-border">
        <p className="text-sm text-foreground leading-snug line-clamp-3">
          {scene.narration}
        </p>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          <StageDot
            label="帧"
            on={hasFrame}
            loading={!hasFrame && stage === "frame_processing"}
          />
          <StageDot
            label="视频"
            on={hasVideo}
            loading={!hasVideo && stage === "video_processing"}
          />
          <StageDot
            label="配音"
            on={hasAudio}
            loading={!hasAudio && !!audioPending}
          />
        </div>
      </div>
    </div>
  );
}

export function PlaceholderSceneCard({
  index,
  aspectClass = "aspect-video",
  pulse = false,
}: {
  index: number;
  aspectClass?: string;
  pulse?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-dashed border-border bg-card/30 overflow-hidden",
        pulse && "animate-pulse",
      )}
    >
      <div
        className={cn(
          aspectClass,
          "relative bg-muted/40 flex items-center justify-center",
        )}
      >
        <ImageIcon
          className="size-6 text-muted-foreground/40"
          strokeWidth={1.25}
        />
        <div className="absolute top-2 left-2 font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-background/60 text-muted-foreground tabular-nums">
          {String(index).padStart(2, "0")}
        </div>
      </div>
      <div className="p-3 flex flex-col gap-2 border-t border-dashed border-border">
        <div className="h-3 rounded-sm bg-muted/60 w-11/12" />
        <div className="h-3 rounded-sm bg-muted/60 w-3/5" />
      </div>
    </div>
  );
}

function StageDot({
  label,
  on,
  loading,
}: {
  label: string;
  on: boolean;
  loading?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "size-1.5 rounded-full",
          on
            ? "bg-foreground"
            : loading
              ? "bg-foreground/60 animate-pulse"
              : "bg-border",
        )}
      />
      <span
        className={cn(
          on
            ? "text-foreground"
            : loading
              ? "text-foreground/80"
              : "",
        )}
      >
        {label}
      </span>
    </span>
  );
}
