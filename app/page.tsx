"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Clapperboard,
  Download,
  History,
  Loader2,
  Settings2,
  Sparkles,
  Square,
  Star,
} from "lucide-react";

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.55 0-.27-.01-1-.02-1.96-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.68-1.27-1.68-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.17.92-.26 1.9-.39 2.88-.39s1.96.13 2.88.39c2.2-1.48 3.17-1.17 3.17-1.17.63 1.58.23 2.75.12 3.04.74.8 1.18 1.82 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .3.21.66.8.55A11.52 11.52 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5Z" />
    </svg>
  );
}

import { PlaceholderSceneCard, SceneCard } from "@/components/SceneCard";
import { ProgressStrip } from "@/components/ProgressStrip";
import { SettingsPanel } from "@/components/SettingsPanel";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { StoryboardEditor } from "@/components/StoryboardEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  deleteFinalBlob,
  loadFinalBlob,
  loadHistory,
  loadSettings,
  pushHistory,
  removeHistory,
  saveFinalBlob,
  saveSettings,
  subscribeHistory,
  subscribeSettings,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import {
  getProviderMeta,
  getStylePreset,
  STYLE_PRESETS,
  type GenerateEvent,
  type HistoryItem,
  type SceneAsset,
  type StoryInput,
  type Storyboard,
} from "@/lib/types";

// 去掉文件系统/HTTP 不友好的字符；裁到 60 字以内
function safeFilename(name: string | undefined): string {
  if (!name) return "";
  return name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "")
    .trim()
    .slice(0, 60);
}

const SUGGESTED_TOPICS = [
  "一只猫侦探在赛博朋克城市寻找走失的金鱼",
  "一只小熊猫在月球上开了一家奶茶店",
  "一个机器人在末日废土里寻找最后一朵花",
  "深海里有一座会唱歌的图书馆",
];

const PACING_OPTIONS: { id: "" | "direct" | "slow"; label: string; hint: string }[] = [
  { id: "", label: "自动", hint: "交给模型自己拿捏" },
  { id: "direct", label: "开门见山", hint: "第 1 镜就抛冲突，每镜推进" },
  { id: "slow", label: "慢热铺垫", hint: "前 1-2 镜铺氛围，结尾留余韵" },
];

// 状态机：
//   idle            → 在输入主题，可以点 "拆分镜"
//   loading-sb      → POST /api/storyboard 进行中
//   editing-sb      → 已拿到分镜，正在编辑确认
//   generating      → POST /api/generate-assets SSE 进行中
//   done            → 全部完成（含合成）或从历史加载
//   error           → 任意阶段失败
type Phase =
  | "idle"
  | "loading-sb"
  | "editing-sb"
  | "generating"
  | "done"
  | "error";

export default function HomePage() {
  const [topic, setTopic] = useState("");
  const [character, setCharacter] = useState("");
  const [pacing, setPacing] = useState<"" | "direct" | "slow">("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [assets, setAssets] = useState<Record<number, SceneAsset>>({});
  const [sceneErrors, setSceneErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [loadedFromHistory, setLoadedFromHistory] = useState(false);
  const [historyFinalState, setHistoryFinalState] = useState<
    null | "loading" | "missing"
  >(null);
  const [framesSubmitted, setFramesSubmitted] = useState<Record<number, true>>({});
  // PR B: 主角立绘 loading / error 状态。立绘 URL 本身写在 storyboard.characterImageUrl
  const [characterLoading, setCharacterLoading] = useState(false);
  const [characterError, setCharacterError] = useState<string | undefined>();
  const characterAbortRef = useRef<AbortController | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);

  const settings = useSyncExternalStore(
    subscribeSettings,
    loadSettings,
    loadSettings,
  );
  const history = useSyncExternalStore(
    subscribeHistory,
    loadHistory,
    loadHistory,
  );
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const finalUrlRef = useRef<string | null>(null);

  useEffect(() => {
    finalUrlRef.current = finalUrl;
  }, [finalUrl]);
  useEffect(() => {
    return () => {
      if (finalUrlRef.current) URL.revokeObjectURL(finalUrlRef.current);
    };
  }, []);

  // 1s 心跳：在 loading-sb / generating / merging 时更新 elapsed 显示
  useEffect(() => {
    const active =
      phase === "loading-sb" || phase === "generating" || merging;
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase, merging]);

  // ============================================================================
  // SSE 事件处理（只在 generating 阶段会收到）
  // ============================================================================
  const handleEvent = useCallback((ev: GenerateEvent) => {
    switch (ev.type) {
      case "start":
        runIdRef.current = ev.runId;
        break;
      case "log":
        setLogs((ls) => [...ls.slice(-19), ev.message]);
        break;
      case "frame_submitted":
        setFramesSubmitted((m) => ({ ...m, [ev.sceneId]: true }));
        break;
      case "frame_done":
        setAssets((a) => ({
          ...a,
          [ev.sceneId]: { ...a[ev.sceneId], imageUrl: ev.imageUrl },
        }));
        break;
      case "video_done":
        setAssets((a) => ({
          ...a,
          [ev.sceneId]: { ...a[ev.sceneId], videoUrl: ev.videoUrl },
        }));
        break;
      case "audio_done":
        setAssets((a) => ({
          ...a,
          [ev.sceneId]: { ...a[ev.sceneId], audioUrl: ev.audioUrl },
        }));
        break;
      case "error":
        if (ev.sceneId) {
          setSceneErrors((m) => ({ ...m, [ev.sceneId!]: ev.message }));
        } else {
          setError(ev.message);
          setPhase("error");
        }
        break;
      case "complete":
        setPhase((p) => (p === "error" ? p : "done"));
        break;
    }
  }, []);

  function buildStoryInput(): StoryInput {
    return {
      topic: topic.trim(),
      character: character.trim() || undefined,
      pacing: pacing || undefined,
    };
  }

  // ============================================================================
  // Step 1.5 (PR B): 主角立绘（POST /api/character）—— 并行
  // 取消任何在跑的立绘任务，按 storyboard.main_character 重新出图。
  // ============================================================================
  const fetchCharacter = useCallback(
    async (sb: Storyboard) => {
      characterAbortRef.current?.abort();
      const ctrl = new AbortController();
      characterAbortRef.current = ctrl;
      setCharacterLoading(true);
      setCharacterError(undefined);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (settings.apiKey) headers["x-mr-key"] = settings.apiKey;
        const res = await fetch("/api/character", {
          method: "POST",
          headers,
          body: JSON.stringify({ storyboard: sb, settings }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const { url } = (await res.json()) as { url: string };
        // 竞态守卫：用户在立绘出来前点了 "重抽分镜"，会换掉 storyboard 引用
        setStoryboard((cur) => (cur ? { ...cur, characterImageUrl: url } : cur));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setCharacterError((err as Error).message);
      } finally {
        if (characterAbortRef.current === ctrl) setCharacterLoading(false);
      }
    },
    [settings],
  );

  // ============================================================================
  // Step 1: 拆分镜（POST /api/storyboard）
  // ============================================================================
  const fetchStoryboard = useCallback(
    async (input: StoryInput) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (settings.apiKey) headers["x-mr-key"] = settings.apiKey;
        const res = await fetch("/api/storyboard", {
          method: "POST",
          headers,
          body: JSON.stringify({ input, settings }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const { storyboard: sb } = (await res.json()) as { storyboard: Storyboard };
        setStoryboard(sb);
        setPhase("editing-sb");
        // 拆完分镜立刻并行出立绘；不 await，让用户先看到分镜
        fetchCharacter(sb);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message);
          setPhase("error");
        }
      }
    },
    [settings, fetchCharacter],
  );

  // 用户在编辑器里点 "重抽立绘"
  function regenerateCharacter() {
    if (!storyboard) return;
    fetchCharacter(storyboard);
  }

  async function startStoryboard() {
    if (!topic.trim() || phase === "loading-sb" || phase === "generating") return;
    setPhase("loading-sb");
    setLogs([]);
    setStoryboard(null);
    setAssets({});
    setSceneErrors({});
    setFramesSubmitted({});
    setError(null);
    if (finalUrl) URL.revokeObjectURL(finalUrl);
    setFinalUrl(null);
    setLoadedFromHistory(false);
    setHistoryFinalState(null);
    // 取消任何在跑的立绘任务，重置立绘状态
    characterAbortRef.current?.abort();
    setCharacterLoading(false);
    setCharacterError(undefined);
    setStartedAt(Date.now());
    setNow(Date.now());

    await fetchStoryboard(buildStoryInput());
  }

  async function regenerateStoryboard() {
    if (!storyboard) return;
    setPhase("loading-sb");
    characterAbortRef.current?.abort();
    setCharacterLoading(false);
    setCharacterError(undefined);
    setStartedAt(Date.now());
    setNow(Date.now());
    await fetchStoryboard(buildStoryInput());
  }

  // ============================================================================
  // Step 2-4: 资源生成（POST /api/generate-assets，SSE）
  // ============================================================================
  async function startAssets() {
    if (!storyboard) return;
    setPhase("generating");
    setLogs([]);
    setAssets(
      Object.fromEntries(storyboard.scenes.map((s) => [s.id, { sceneId: s.id }])),
    );
    setSceneErrors({});
    setFramesSubmitted({});
    setError(null);
    setStartedAt(Date.now());
    setNow(Date.now());

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (settings.apiKey) headers["x-mr-key"] = settings.apiKey;

      const res = await fetch("/api/generate-assets", {
        method: "POST",
        headers,
        body: JSON.stringify({ storyboard, settings }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("响应无 body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const chunk of parts) {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            try {
              handleEvent(JSON.parse(data) as GenerateEvent);
            } catch {
              // ignore malformed
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
        setPhase("error");
      }
    }
  }

  function cancel() {
    abortRef.current?.abort();
    characterAbortRef.current?.abort();
    setCharacterLoading(false);
    setPhase("idle");
  }

  function cancelEditing() {
    characterAbortRef.current?.abort();
    setCharacterLoading(false);
    setCharacterError(undefined);
    setStoryboard(null);
    setPhase("idle");
  }

  // 自动合成
  const runMerge = useCallback(
    async (pushHistoryItem: boolean) => {
      if (!storyboard) return;
      const runId = runIdRef.current;
      setError(null);
      setMerging(true);
      try {
        const res = await fetch("/api/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyboard,
            assets: Object.values(assets),
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `merge failed: ${res.status}`);
        }
        const blob = await res.blob();
        if (runIdRef.current !== runId) return;
        if (finalUrlRef.current) URL.revokeObjectURL(finalUrlRef.current);
        setFinalUrl(URL.createObjectURL(blob));
        setHistoryFinalState(null);

        if (runId) {
          await saveFinalBlob(runId, blob).catch(() => {});
          if (pushHistoryItem) {
            const item: HistoryItem = {
              runId,
              topic: topic.trim(),
              createdAt: Date.now(),
              storyboard,
              assets: Object.values(assets),
            };
            pushHistory(item);
          }
        }
      } catch (err) {
        if (runIdRef.current !== runId) return;
        setError((err as Error).message);
      } finally {
        if (runIdRef.current === runId) setMerging(false);
      }
    },
    [storyboard, assets, topic],
  );

  useEffect(() => {
    if (phase !== "done" || !storyboard || loadedFromHistory) return;
    const allSettled = storyboard.scenes.every((s) => {
      if (sceneErrors[s.id]) return true;
      const a = assets[s.id];
      return a?.videoUrl && a?.audioUrl;
    });
    const hasAnyUsable = storyboard.scenes.some((s) => {
      const a = assets[s.id];
      return a?.videoUrl && a?.audioUrl;
    });
    if (!allSettled || !hasAnyUsable || finalUrl || merging) return;

    runMerge(true);
  }, [phase, storyboard, assets, sceneErrors, finalUrl, merging, loadedFromHistory, runMerge]);

  function loadFromHistory(item: HistoryItem) {
    setTopic(item.topic);
    setCharacter("");
    setPacing("");
    setStoryboard(item.storyboard);
    setAssets(Object.fromEntries(item.assets.map((a) => [a.sceneId, a])));
    setSceneErrors({});
    setPhase("done");
    setHistoryOpen(false);
    if (finalUrl) URL.revokeObjectURL(finalUrl);
    setFinalUrl(null);
    setError(null);
    setLoadedFromHistory(true);
    // 取消任何在跑的立绘任务（如果用户在编辑分镜时切到历史）
    characterAbortRef.current?.abort();
    setCharacterLoading(false);
    setCharacterError(undefined);
    runIdRef.current = item.runId;
    setHistoryFinalState("loading");

    loadFinalBlob(item.runId)
      .then((blob) => {
        if (runIdRef.current !== item.runId) return;
        if (blob) {
          setFinalUrl(URL.createObjectURL(blob));
          setHistoryFinalState(null);
        } else {
          setHistoryFinalState("missing");
        }
      })
      .catch(() => {
        if (runIdRef.current !== item.runId) return;
        setHistoryFinalState("missing");
      });
  }

  function removeFromHistory(id: string) {
    removeHistory(id);
    deleteFinalBlob(id).catch(() => {});
  }

  const orderedScenes = storyboard?.scenes ?? [];
  const totalSeconds = settings.numScenes * settings.secondsPerScene;
  const isLoadingSb = phase === "loading-sb";
  const isEditingSb = phase === "editing-sb";
  const isGenerating = phase === "generating";
  // 输入区是否禁用 —— 在拆分镜/编辑分镜/生成时都不允许改主题
  const inputsDisabled = isLoadingSb || isEditingSb || isGenerating;
  const erroredSceneCount = orderedScenes.filter(
    (s) => sceneErrors[s.id],
  ).length;
  const activeImageSize = storyboard?.imageSize ?? settings.imageSize;
  const isPortrait = activeImageSize === "720*1280";
  const previewAspectClass = isPortrait ? "aspect-[9/16]" : "aspect-video";
  const allFailed =
    phase === "done" &&
    !loadedFromHistory &&
    orderedScenes.length > 0 &&
    erroredSceneCount === orderedScenes.length;

  const totalScenes = orderedScenes.length;
  const frameCount = orderedScenes.filter((s) => assets[s.id]?.imageUrl).length;
  const videoCount = orderedScenes.filter((s) => assets[s.id]?.videoUrl).length;
  const audioCount = orderedScenes.filter((s) => assets[s.id]?.audioUrl).length;
  const elapsedSec = startedAt ? (now - startedAt) / 1000 : 0;
  const progressPhase: "splitting" | "producing" | "merging" | null = merging
    ? "merging"
    : isGenerating
      ? "producing"
      : isLoadingSb
        ? "splitting"
        : null;
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clapperboard className="size-5 text-primary" strokeWidth={1.5} />
            <div className="flex items-baseline gap-3">
              <h1 className="text-sm font-semibold tracking-tight">
                短视频工厂
              </h1>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                一句话生成 · 2-3 分钟出片
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              asChild
              title="开源仓库 · 喜欢的话点个 Star ⭐"
            >
              <a
                href="https://github.com/ai-graveyard/happy-dsp"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub 开源仓库"
              >
                <GithubMark className="size-4" />
                <span className="hidden sm:inline">Star</span>
                <Star className="size-3.5 hidden sm:inline-block fill-current text-amber-500" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileSettingsOpen(true)}
              className="lg:hidden"
            >
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">设置</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="size-4" />
              <span className="hidden sm:inline">历史</span>
              {history.length > 0 && (
                <span className="text-muted-foreground tabular-nums">
                  {history.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Body grid */}
      <div className="flex-1 mx-auto max-w-[1400px] w-full px-4 sm:px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar — settings, always visible on lg+ */}
          <aside className="hidden lg:block lg:col-span-3">
            <div className="sticky top-[4.5rem]">
              <div className="rounded-md border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Settings2 className="size-4 text-muted-foreground" />
                  <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    设置
                  </h2>
                </div>
                <SettingsPanel
                  settings={settings}
                  onChange={saveSettings}
                  disabled={inputsDisabled}
                />
              </div>
            </div>
          </aside>

          {/* Main column */}
          <main className="col-span-12 lg:col-span-9 space-y-6">
            {/* Input card */}
            <section className="rounded-md border border-border bg-card">
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="topic"
                    className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    01 · 输入主题
                  </label>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                    <span>{settings.numScenes} 镜</span>
                    <span className="text-border">·</span>
                    <span>{settings.secondsPerScene}s/镜</span>
                    <span className="text-border">·</span>
                    <span>≈ {totalSeconds}s</span>
                    <span className="text-border">·</span>
                    <span>
                      {getStylePreset(settings.style).emoji}{" "}
                      {getStylePreset(settings.style).label}
                    </span>
                    <span className="text-border">·</span>
                    <span>
                      {getProviderMeta(settings.provider).short}
                    </span>
                    <span className="text-border">·</span>
                    <span>
                      {settings.apiKey ? "自带 key" : "共享 key"}
                    </span>
                  </div>
                </div>

                <Textarea
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={inputsDisabled}
                  placeholder="例：一只猫侦探在赛博朋克城市寻找走失的金鱼…"
                  rows={3}
                  className="resize-none"
                />

                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TOPICS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setTopic(s)}
                      disabled={inputsDisabled}
                      className="text-xs h-9 px-3 rounded-sm border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* 主角描述 + 节奏 —— 可选字段 */}
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="character"
                      className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      主角描述 <span className="normal-case opacity-60">(可选)</span>
                    </label>
                    <Input
                      id="character"
                      value={character}
                      onChange={(e) => setCharacter(e.target.value)}
                      disabled={inputsDisabled}
                      placeholder="例：橘色虎斑猫，戴侦探帽和风衣"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      节奏 <span className="normal-case opacity-60">(可选)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PACING_OPTIONS.map((opt) => {
                        const active = pacing === opt.id;
                        return (
                          <button
                            key={opt.id || "auto"}
                            onClick={() => setPacing(opt.id)}
                            disabled={inputsDisabled}
                            title={opt.hint}
                            aria-pressed={active}
                            className={cn(
                              "text-xs h-9 px-3 rounded-sm border transition disabled:opacity-50",
                              active
                                ? "border-primary text-primary bg-primary/10"
                                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      风格
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {getStylePreset(settings.style).hint}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_PRESETS.map((s) => {
                      const active = settings.style === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() =>
                            saveSettings({ ...settings, style: s.id })
                          }
                          disabled={inputsDisabled}
                          title={s.hint}
                          aria-pressed={active}
                          className={cn(
                            "text-xs h-9 px-3 rounded-sm border transition disabled:opacity-50 inline-flex items-center gap-1",
                            active
                              ? "border-primary text-primary bg-primary/10"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          <span aria-hidden="true">{s.emoji}</span>
                          <span>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="p-3 flex items-center justify-between">
                <div className="px-2 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  {isLoadingSb ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      拆分镜中…
                    </>
                  ) : isEditingSb ? (
                    <>等你确认分镜 ↓</>
                  ) : isGenerating ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      生成中… 请勿关闭页面
                    </>
                  ) : merging ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      ffmpeg 合成中…
                    </>
                  ) : (
                    "准备就绪"
                  )}
                </div>
                {isLoadingSb || isGenerating ? (
                  <Button variant="outline" onClick={cancel}>
                    <Square className="size-3.5" fill="currentColor" />
                    取消
                  </Button>
                ) : isEditingSb ? (
                  // 编辑分镜时输入区禁用，操作转到下面 editor 上
                  <Button disabled>
                    <Sparkles className="size-4" />
                    在下方编辑分镜
                  </Button>
                ) : (
                  <Button onClick={startStoryboard} disabled={!topic.trim()}>
                    <Sparkles className="size-4" />
                    拆分镜
                  </Button>
                )}
              </div>
            </section>

            {/* 顶部全局进度条 */}
            {progressPhase && (
              <ProgressStrip
                phase={progressPhase}
                totalScenes={totalScenes}
                frameCount={frameCount}
                videoCount={videoCount}
                audioCount={audioCount}
                errorCount={erroredSceneCount}
                elapsedSec={elapsedSec}
                latestLog={latestLog}
              />
            )}

            {error && (
              <section className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <div className="font-medium text-destructive mb-1">出错了</div>
                <div className="text-destructive/80 whitespace-pre-wrap text-xs font-mono">
                  {error}
                </div>
              </section>
            )}

            {/* 分镜确认编辑器 —— 仅在 editing-sb 阶段显示 */}
            {isEditingSb && storyboard && (
              <StoryboardEditor
                storyboard={storyboard}
                onChange={setStoryboard}
                onConfirm={startAssets}
                onCancel={cancelEditing}
                onRegenerate={regenerateStoryboard}
                regenerating={false}
                characterLoading={characterLoading}
                characterError={characterError}
                onRegenerateCharacter={regenerateCharacter}
                supportsRefImage={getProviderMeta(settings.provider).supportsReferenceImage}
              />
            )}

            {/* 分镜阶段重抽时的占位（loading-sb 阶段且已经有过 storyboard 但被清掉了）*/}
            {isLoadingSb && (
              <section className="rounded-md border border-dashed border-border bg-card/30 p-6 text-sm text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                正在拆分镜，请稍候…
              </section>
            )}

            {/* 生成 / 完成阶段：场景卡片网格 */}
            {(isGenerating || phase === "done" || phase === "error") && storyboard && (
              <section className="space-y-4">
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
                      02 · 分镜
                    </div>
                    <h2 className="text-base font-semibold flex items-center gap-3">
                      {storyboard.title}
                      {isGenerating && (
                        <Badge variant="outline" className="normal-case">
                          <Loader2 className="size-3 animate-spin" />
                          生成中
                        </Badge>
                      )}
                    </h2>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    风格 · {storyboard.global_style}
                  </div>
                </div>

                <div
                  className={cn(
                    "grid gap-3",
                    isPortrait
                      ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                      : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
                  )}
                >
                  {orderedScenes.map((s) => (
                    <SceneCard
                      key={s.id}
                      scene={s}
                      asset={assets[s.id]}
                      errorMessage={sceneErrors[s.id]}
                      aspectClass={previewAspectClass}
                      frameSubmitted={!!framesSubmitted[s.id]}
                      audioPending={isGenerating && !assets[s.id]?.audioUrl}
                    />
                  ))}
                </div>
              </section>
            )}

            {(phase === "done" || finalUrl) && storyboard && (
              <section className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
                      03 · 成片
                    </div>
                    <h2 className="text-base font-semibold flex items-center gap-3">
                      最终成片
                      {merging && (
                        <Badge variant="outline" className="normal-case">
                          <Loader2 className="size-3 animate-spin" />
                          ffmpeg 合成中
                        </Badge>
                      )}
                    </h2>
                  </div>
                </div>
                {finalUrl ? (
                  <div className="rounded-md border border-border bg-card p-3 space-y-3">
                    <div className={isPortrait ? "max-w-xs mx-auto" : ""}>
                      <video
                        src={finalUrl}
                        controls
                        autoPlay
                        className={cn(
                          "w-full rounded-sm bg-black",
                          previewAspectClass,
                        )}
                      />
                    </div>
                    <Button asChild>
                      <a
                        href={finalUrl}
                        download={`${safeFilename(storyboard.title) || "short-video"}.mp4`}
                      >
                        <Download className="size-4" />
                        下载 MP4
                      </a>
                    </Button>
                  </div>
                ) : loadedFromHistory && !merging ? (
                  <div
                    className={cn(
                      "rounded-md border border-dashed border-border bg-card/30 flex flex-col items-center justify-center text-xs gap-3 text-muted-foreground p-4",
                      previewAspectClass,
                      isPortrait ? "max-w-xs mx-auto" : "",
                    )}
                  >
                    {historyFinalState === "loading" ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>正在加载本地缓存的成片…</span>
                      </div>
                    ) : (
                      <>
                        <span className="text-center">
                          本地未缓存成片。可以基于已有的分镜素材重新跑一次 ffmpeg 合成（不会重新生图/视频/配音）。
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runMerge(false)}
                        >
                          <Sparkles className="size-3.5" />
                          重新合成
                        </Button>
                      </>
                    )}
                  </div>
                ) : allFailed ? (
                  <div className="text-sm text-destructive">
                    所有分镜都失败了，无法合成。请检查 API Key 或重试。
                  </div>
                ) : merging ? (
                  <div className="rounded-md border border-border bg-card overflow-hidden">
                    <div className="relative h-1 overflow-hidden bg-muted">
                      <div className="absolute inset-y-0 left-0 w-1/3 bg-foreground rounded-full animate-indeterminate" />
                    </div>
                    <div
                      className={cn(
                        previewAspectClass,
                        isPortrait ? "max-w-xs mx-auto" : "",
                        "flex items-center justify-center text-xs text-muted-foreground gap-2",
                      )}
                    >
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>ffmpeg 拼接 {orderedScenes.length - erroredSceneCount} 个分镜…</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {erroredSceneCount > 0
                      ? `${erroredSceneCount} 个分镜失败，等待其余分镜完成后会用可用部分合成…`
                      : "等待所有分镜完成后会自动合成…"}
                  </div>
                )}
              </section>
            )}

            {loadedFromHistory && storyboard && (
              <div className="text-xs text-muted-foreground border-l-2 border-border pl-3">
                历史记录已加载。成片是本地缓存的；分镜的远端图片/视频 URL 可能已过期。
              </div>
            )}

            {/* 空状态占位 —— 还没开始拆分镜 */}
            {!storyboard && !isLoadingSb && (
              <>
                <section className="space-y-4">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
                      02 · 分镜
                    </div>
                    <h2 className="text-base font-semibold text-muted-foreground">
                      分镜将在此显示（你可以确认/编辑后再生成视频）
                    </h2>
                  </div>
                  <div
                    className={cn(
                      "grid gap-3",
                      isPortrait
                        ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                        : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
                    )}
                  >
                    {Array.from({ length: settings.numScenes }).map((_, i) => (
                      <PlaceholderSceneCard
                        key={i}
                        index={i + 1}
                        aspectClass={previewAspectClass}
                        pulse={false}
                      />
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
                      03 · 成片
                    </div>
                    <h2 className="text-base font-semibold text-muted-foreground">
                      成片将在此显示
                    </h2>
                  </div>
                  <div
                    className={cn(
                      "rounded-md border border-dashed border-border bg-card/30",
                      isPortrait ? "max-w-xs mx-auto" : "",
                    )}
                  >
                    <div
                      className={cn(
                        previewAspectClass,
                        "flex items-center justify-center text-xs text-muted-foreground/70",
                      )}
                    >
                      {isPortrait ? "9:16 竖屏" : "16:9 横屏"} · ≈ {totalSeconds}s
                    </div>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
          <span>
            Powered by{" "}
            <a
              href="https://bailian.console.aliyun.com/"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline-offset-2 hover:underline"
            >
              通义 Qwen 全模态
            </a>
          </span>
          <span className="inline-flex items-center gap-3">
            <a
              href="https://github.com/ai-graveyard/happy-dsp"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-foreground underline-offset-2 hover:underline"
            >
              <GithubMark className="size-3.5" />
              开源 · ai-graveyard/happy-dsp
              <Star className="size-3 fill-current text-amber-500" />
            </a>
            <span className="text-border">·</span>
            <span className="font-mono">v0.1</span>
          </span>
        </div>
      </footer>

      {/* Mobile settings sheet */}
      <Sheet open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>设置</SheetTitle>
            <SheetDescription className="sr-only">
              API Key、分镜数、音色和模型等参数
            </SheetDescription>
          </SheetHeader>
          <div className="p-5 overflow-y-auto h-[calc(100%-3.5rem)]">
            <SettingsPanel
              settings={settings}
              onChange={saveSettings}
              disabled={inputsDisabled}
            />
          </div>
        </SheetContent>
      </Sheet>

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        items={history}
        onLoad={loadFromHistory}
        onRemove={removeFromHistory}
      />
    </div>
  );
}
