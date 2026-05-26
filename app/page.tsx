"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SceneCard } from "@/components/SceneCard";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import {
  loadHistory,
  loadSettings,
  pushHistory,
  removeHistory,
  saveSettings,
} from "@/lib/storage";
import {
  DEFAULT_SETTINGS,
  type GenerateEvent,
  type HistoryItem,
  type SceneAsset,
  type Storyboard,
  type UserSettings,
} from "@/lib/types";

const SUGGESTED_TOPICS = [
  "一只猫侦探在赛博朋克城市寻找走失的金鱼",
  "一只小熊猫在月球上开了一家奶茶店",
  "一个机器人在末日废土里寻找最后一朵花",
  "深海里有一座会唱歌的图书馆",
];

type Phase = "idle" | "running" | "done" | "error";

export default function HomePage() {
  const [topic, setTopic] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [assets, setAssets] = useState<Record<number, SceneAsset>>({});
  const [error, setError] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    setHistory(loadHistory());
  }, []);

  function persistSettings(s: UserSettings) {
    setSettings(s);
    saveSettings(s);
  }

  const handleEvent = useCallback((ev: GenerateEvent) => {
    switch (ev.type) {
      case "start":
        runIdRef.current = ev.runId;
        break;
      case "log":
        setLogs((ls) => [...ls.slice(-20), ev.message]);
        break;
      case "storyboard":
        setStoryboard(ev.data);
        setAssets(
          Object.fromEntries(
            ev.data.scenes.map((s) => [s.id, { sceneId: s.id }]),
          ),
        );
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
        setError(ev.message);
        if (!ev.sceneId) setPhase("error");
        break;
      case "complete":
        setPhase("done");
        break;
    }
  }, []);

  async function startGeneration() {
    if (!topic.trim() || phase === "running") return;
    setPhase("running");
    setLogs([]);
    setStoryboard(null);
    setAssets({});
    setError(null);
    setFinalUrl(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (settings.apiKey) headers["x-mr-key"] = settings.apiKey;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({ topic: topic.trim(), settings }),
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
    setPhase("idle");
  }

  // 所有分镜齐了 → 自动 merge
  useEffect(() => {
    if (phase !== "done" || !storyboard) return;
    const allReady = storyboard.scenes.every((s) => {
      const a = assets[s.id];
      return a?.videoUrl && a?.audioUrl;
    });
    if (!allReady || finalUrl || merging) return;

    (async () => {
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
        const url = URL.createObjectURL(blob);
        setFinalUrl(url);

        if (runIdRef.current) {
          const item: HistoryItem = {
            runId: runIdRef.current,
            topic: topic.trim(),
            createdAt: Date.now(),
            storyboard,
            assets: Object.values(assets),
          };
          pushHistory(item);
          setHistory(loadHistory());
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setMerging(false);
      }
    })();
  }, [phase, storyboard, assets, finalUrl, merging, topic]);

  function loadFromHistory(item: HistoryItem) {
    setTopic(item.topic);
    setStoryboard(item.storyboard);
    setAssets(
      Object.fromEntries(item.assets.map((a) => [a.sceneId, a])),
    );
    setPhase("done");
    setHistoryOpen(false);
    setFinalUrl(null);
    setError(null);
  }

  function removeFromHistory(id: string) {
    removeHistory(id);
    setHistory(loadHistory());
  }

  const orderedScenes = storyboard?.scenes ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-40 backdrop-blur bg-zinc-950/80 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🎬</span>
            <h1 className="font-semibold tracking-tight">短视频工厂</h1>
            <span className="hidden sm:inline text-xs text-zinc-500 ml-2">
              一句话生成 2-3 分钟出片
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryOpen(true)}
              className="px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900 rounded-md transition flex items-center gap-1.5"
            >
              <span>📁</span>
              <span className="hidden sm:inline">历史</span>
              {history.length > 0 && (
                <span className="text-xs text-zinc-500">({history.length})</span>
              )}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900 rounded-md transition flex items-center gap-1.5"
            >
              <span>⚙</span>
              <span className="hidden sm:inline">设置</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full space-y-8">
        <section>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              输入你的 idea
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={phase === "running"}
              placeholder="例：一只猫侦探在赛博朋克城市寻找走失的金鱼…"
              rows={3}
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TOPICS.map((s) => (
                <button
                  key={s}
                  onClick={() => setTopic(s)}
                  disabled={phase === "running"}
                  className="text-xs px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="text-xs text-zinc-500">
                {settings.numScenes} 个分镜 · 每段 {settings.secondsPerScene}s ·{" "}
                {settings.apiKey ? "用你的 key" : "共享 key"}
              </div>
              {phase === "running" ? (
                <button
                  onClick={cancel}
                  className="px-5 py-2 bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20 rounded-lg text-sm transition"
                >
                  取消
                </button>
              ) : (
                <button
                  onClick={startGeneration}
                  disabled={!topic.trim()}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium rounded-lg text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ✨ 开始生成
                </button>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 text-red-300 text-sm">
            <div className="font-medium mb-1">出错了</div>
            <div className="text-red-200/80 whitespace-pre-wrap">{error}</div>
          </div>
        )}

        {storyboard && (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">
                {storyboard.title}
                {phase === "running" && (
                  <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 font-normal">
                    <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
                    生成中
                  </span>
                )}
              </h2>
              <div className="text-xs text-zinc-500">
                风格: {storyboard.global_style}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {orderedScenes.map((s) => (
                <SceneCard key={s.id} scene={s} asset={assets[s.id]} />
              ))}
            </div>

            {logs.length > 0 && phase === "running" && (
              <div className="text-xs text-zinc-500 font-mono">
                {logs.slice(-1)}
              </div>
            )}
          </section>
        )}

        {(phase === "done" || finalUrl) && storyboard && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              成片
              {merging && (
                <span className="text-xs text-zinc-500 font-normal flex items-center gap-1.5">
                  <span className="h-3 w-3 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                  ffmpeg 合成中…
                </span>
              )}
            </h2>
            {finalUrl ? (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-3 space-y-3">
                <video
                  src={finalUrl}
                  controls
                  autoPlay
                  className="w-full rounded-lg bg-black"
                />
                <a
                  href={finalUrl}
                  download={`${storyboard.title || "short-video"}.mp4`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium rounded-lg text-sm transition"
                >
                  ⬇ 下载 MP4
                </a>
              </div>
            ) : !merging ? (
              <div className="text-sm text-zinc-500">
                等待所有分镜完成后会自动合成…
              </div>
            ) : null}
          </section>
        )}

        {phase === "idle" && !storyboard && (
          <div className="text-center text-zinc-600 text-sm py-12">
            输入一句话主题，2-3 分钟生成一条 ~25 秒的短视频
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-zinc-600 py-6">
        Powered by{" "}
        <a
          href="https://bailian.console.aliyun.com/"
          target="_blank"
          rel="noreferrer"
          className="hover:text-zinc-400"
        >
          通义 Qwen 全模态
        </a>{" "}
        · 开源于 GitHub
      </footer>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={persistSettings}
      />
      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={history}
        onLoad={loadFromHistory}
        onRemove={removeFromHistory}
      />
    </div>
  );
}
