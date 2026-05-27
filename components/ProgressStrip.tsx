"use client";

import {
  Film,
  ImageIcon,
  Loader2,
  Mic,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgressPhase = "splitting" | "producing" | "merging";

interface Props {
  phase: ProgressPhase;
  totalScenes: number;
  frameCount: number;
  videoCount: number;
  audioCount: number;
  errorCount: number;
  elapsedSec: number;
  latestLog?: string;
}

export function ProgressStrip({
  phase,
  totalScenes,
  frameCount,
  videoCount,
  audioCount,
  errorCount,
  elapsedSec,
  latestLog,
}: Props) {
  // 拆分镜 + 合成：进度未知，indeterminate
  if (phase === "splitting" || phase === "merging") {
    const label = phase === "splitting" ? "AI 正在拆分镜…" : "ffmpeg 合成中…";
    const Icon = phase === "splitting" ? Wand2 : Film;
    return (
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <IndeterminateBar />
        <div className="p-3 flex items-center gap-2.5 text-sm">
          <Icon className="size-4 text-foreground" strokeWidth={1.75} />
          <span className="font-medium">{label}</span>
          <span className="text-xs text-muted-foreground tabular-nums ml-auto">
            {formatElapsed(elapsedSec)}
          </span>
        </div>
        {latestLog && (
          <div className="px-3 pb-2.5 text-xs text-muted-foreground font-mono truncate">
            {latestLog}
          </div>
        )}
      </div>
    );
  }

  // producing：知道总数，按 done/total 显示
  const overallPct =
    totalScenes === 0
      ? 0
      : ((frameCount + videoCount + audioCount) / (totalScenes * 3)) * 100;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <DeterminateBar value={overallPct} />
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm">
            <Loader2
              className="size-3.5 animate-spin text-muted-foreground"
              strokeWidth={1.75}
            />
            <span className="font-medium">生成中</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(overallPct)}%
            </span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatElapsed(elapsedSec)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Tile
            icon={ImageIcon}
            label="关键帧"
            done={frameCount}
            total={totalScenes}
          />
          <Tile
            icon={Film}
            label="视频"
            done={videoCount}
            total={totalScenes}
          />
          <Tile
            icon={Mic}
            label="配音"
            done={audioCount}
            total={totalScenes}
          />
        </div>

        {(latestLog || errorCount > 0) && (
          <div className="flex items-center gap-2 text-xs">
            {errorCount > 0 && (
              <span className="text-destructive tabular-nums shrink-0">
                {errorCount} 个失败
              </span>
            )}
            {latestLog && (
              <span className="text-muted-foreground font-mono truncate">
                {latestLog}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  done,
  total,
}: {
  icon: typeof ImageIcon;
  label: string;
  done: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : (done / total) * 100;
  const complete = total > 0 && done >= total;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <Icon
          className={cn(
            "size-3 shrink-0",
            complete ? "text-foreground" : "text-muted-foreground",
          )}
          strokeWidth={1.75}
        />
        <span className="text-muted-foreground truncate">{label}</span>
        <span
          className={cn(
            "ml-auto tabular-nums font-mono text-[11px]",
            complete ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {done}/{total}
        </span>
      </div>
      <div className="relative h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out",
            complete ? "bg-foreground" : "bg-foreground/70",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function IndeterminateBar() {
  return (
    <div className="relative h-1 overflow-hidden bg-muted">
      <div className="absolute inset-y-0 left-0 w-1/3 bg-foreground rounded-full animate-indeterminate" />
    </div>
  );
}

function DeterminateBar({ value }: { value: number }) {
  return (
    <div className="relative h-1 overflow-hidden bg-muted">
      <div
        className="absolute inset-y-0 left-0 bg-foreground transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}
