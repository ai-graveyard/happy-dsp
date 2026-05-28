"use client";

// 分镜确认页 —— /api/storyboard 返回后、/api/generate-assets 触发前的可编辑表。
// 用户可以在这里改标题/主角/风格关键词，以及每条 scene 的 image_prompt / video_motion / narration；
// 也可以增删/移动场景、点 "重抽分镜" 让 LLM 再来一版。
//
// 受控组件：所有状态由父组件持有，父组件决定 onConfirm 时把当前 storyboard
// 直接传给 /api/generate-assets。

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Scene, Storyboard } from "@/lib/types";

interface Props {
  storyboard: Storyboard;
  onChange: (sb: Storyboard) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRegenerate: () => void;
  regenerating?: boolean;
  busy?: boolean; // 父级正在跑 /api/generate-assets 时禁用所有编辑
  // PR B: 主角立绘状态
  characterLoading?: boolean;
  characterError?: string;
  onRegenerateCharacter?: () => void;
  supportsRefImage?: boolean; // false 时显示提示：该 provider 不会注入 ref
}

// 重新编号 scene.id，保证连续。新增/删除/排序后调一次。
function reindex(scenes: Scene[]): Scene[] {
  return scenes.map((s, i) => ({ ...s, id: i + 1 }));
}

export function StoryboardEditor({
  storyboard,
  onChange,
  onConfirm,
  onCancel,
  onRegenerate,
  regenerating = false,
  busy = false,
  characterLoading = false,
  characterError,
  onRegenerateCharacter,
  supportsRefImage = true,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const disabled = busy || regenerating;

  function patch(partial: Partial<Storyboard>) {
    onChange({ ...storyboard, ...partial });
  }

  function patchScene(id: number, partial: Partial<Scene>) {
    onChange({
      ...storyboard,
      scenes: storyboard.scenes.map((s) =>
        s.id === id ? { ...s, ...partial } : s,
      ),
    });
  }

  function moveScene(id: number, dir: -1 | 1) {
    const idx = storyboard.scenes.findIndex((s) => s.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= storyboard.scenes.length) return;
    const arr = [...storyboard.scenes];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    patch({ scenes: reindex(arr) });
  }

  function removeScene(id: number) {
    if (storyboard.scenes.length <= 1) return;
    patch({
      scenes: reindex(storyboard.scenes.filter((s) => s.id !== id)),
    });
  }

  function addScene() {
    const newScene: Scene = {
      id: storyboard.scenes.length + 1,
      image_prompt: "",
      video_motion: "",
      narration: "",
    };
    patch({ scenes: [...storyboard.scenes, newScene] });
  }

  function toggleCollapse(id: number) {
    setCollapsed((m) => ({ ...m, [id]: !m[id] }));
  }

  return (
    <section className="rounded-md border border-border bg-card">
      <div className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
              02 · 分镜确认
            </div>
            <h2 className="text-base font-semibold">
              确认或调整分镜，再开始批量生成
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              这一步可以改标题/主角/风格关键词，逐条编辑提示词和旁白，或增删/排序场景。
            </p>
          </div>
        </div>

        {/* PR B: 主角立绘卡 + 文本字段 横向并排 */}
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <CharacterPanel
            url={storyboard.characterImageUrl}
            loading={characterLoading}
            error={characterError}
            onRegenerate={onRegenerateCharacter}
            supportsRefImage={supportsRefImage}
            disabled={disabled}
          />

          <div className="grid gap-4 sm:grid-cols-2 content-start">
            <div className="space-y-1.5">
              <Label htmlFor="sb-title">标题</Label>
              <Input
                id="sb-title"
                value={storyboard.title}
                onChange={(e) => patch({ title: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-character">主角 (英文)</Label>
              <Input
                id="sb-character"
                value={storyboard.main_character}
                onChange={(e) => patch({ main_character: e.target.value })}
                disabled={disabled}
                className="font-mono text-xs"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="sb-style">画风关键词 (英文)</Label>
              <Textarea
                id="sb-style"
                value={storyboard.global_style}
                onChange={(e) => patch({ global_style: e.target.value })}
                disabled={disabled}
                rows={2}
                className="font-mono text-xs resize-none"
              />
              <p className="text-[10px] text-muted-foreground">
                改了风格/主角后，每条场景的 image_prompt 会在生成时自动拼上前缀；
                改了主角描述可以点立绘旁的 🔄 重抽，刷新角色卡。
              </p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div className="p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            场景 ({storyboard.scenes.length})
          </div>
          <button
            type="button"
            onClick={addScene}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="size-3" />
            添加场景
          </button>
        </div>

        <div className="space-y-2">
          {storyboard.scenes.map((s, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === storyboard.scenes.length - 1;
            const isCollapsed = !!collapsed[s.id];
            return (
              <div
                key={s.id}
                className="rounded-sm border border-border bg-background/40"
              >
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(s.id)}
                    className="font-mono text-[11px] px-1.5 py-0.5 rounded-sm bg-foreground/5 text-foreground tabular-nums hover:bg-foreground/10"
                    title={isCollapsed ? "展开" : "折叠"}
                  >
                    {String(s.id).padStart(2, "0")}
                  </button>
                  <span className="text-xs text-muted-foreground line-clamp-1 flex-1">
                    {s.narration || (
                      <span className="italic">未填旁白</span>
                    )}
                  </span>
                  <div className="flex items-center gap-0.5 text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => moveScene(s.id, -1)}
                      disabled={disabled || isFirst}
                      className="p-1 rounded-sm hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                      title="上移"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveScene(s.id, 1)}
                      disabled={disabled || isLast}
                      className="p-1 rounded-sm hover:bg-foreground/5 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                      title="下移"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeScene(s.id)}
                      disabled={disabled || storyboard.scenes.length <= 1}
                      className="p-1 rounded-sm hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent"
                      title="删除"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`scene-${s.id}-narration`}
                        className="text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        旁白 (中文, 12~18 字)
                      </Label>
                      <Input
                        id={`scene-${s.id}-narration`}
                        value={s.narration}
                        onChange={(e) =>
                          patchScene(s.id, { narration: e.target.value })
                        }
                        disabled={disabled}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`scene-${s.id}-image`}
                          className="text-[10px] uppercase tracking-wider text-muted-foreground"
                        >
                          画面提示 (英文)
                        </Label>
                        <Textarea
                          id={`scene-${s.id}-image`}
                          value={s.image_prompt}
                          onChange={(e) =>
                            patchScene(s.id, { image_prompt: e.target.value })
                          }
                          disabled={disabled}
                          rows={3}
                          className="font-mono text-xs resize-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`scene-${s.id}-motion`}
                          className="text-[10px] uppercase tracking-wider text-muted-foreground"
                        >
                          镜头运动 (英文)
                        </Label>
                        <Textarea
                          id={`scene-${s.id}-motion`}
                          value={s.video_motion}
                          onChange={(e) =>
                            patchScene(s.id, { video_motion: e.target.value })
                          }
                          disabled={disabled}
                          rows={3}
                          className="font-mono text-xs resize-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
        >
          <X className="size-3.5" />
          取消
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={disabled}
            title="保留主题和设置，让 AI 重新拆一版分镜"
          >
            {regenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {regenerating ? "重抽中…" : "重抽分镜"}
          </Button>
          <Button onClick={onConfirm} disabled={disabled || characterLoading}>
            <Sparkles className="size-4" />
            开始生成
          </Button>
        </div>
      </div>
    </section>
  );
}

// PR B: 主角立绘卡片 —— loading / 出图 / 失败三态，每种都给一个 🔄 重抽按钮。
function CharacterPanel({
  url,
  loading,
  error,
  onRegenerate,
  supportsRefImage,
  disabled,
}: {
  url?: string;
  loading?: boolean;
  error?: string;
  onRegenerate?: () => void;
  supportsRefImage?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center justify-between">
        <span>主角立绘</span>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={disabled || loading}
            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
            title="按当前主角描述重抽立绘"
          >
            {loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            重抽
          </button>
        )}
      </Label>
      <div
        className={cn(
          "relative aspect-[3/4] rounded-sm border overflow-hidden flex items-center justify-center text-xs",
          error
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span>立绘生成中…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-1 px-2 text-center">
            <AlertTriangle className="size-4" />
            <span className="line-clamp-3 leading-tight">{error}</span>
          </div>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt="主角立绘"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <ImageIcon className="size-5 opacity-50" strokeWidth={1.25} />
            <span>暂无立绘</span>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {supportsRefImage
          ? "生成场景帧时这张立绘会作为 reference 注入，保证主角一致"
          : "当前 provider 不支持参考图注入，立绘仅供你预览角色"}
      </p>
    </div>
  );
}
