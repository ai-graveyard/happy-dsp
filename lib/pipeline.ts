// 主流水线（服务端）。
// 通过 emit() 回调推送 GenerateEvent，调用方负责把事件序列化成 SSE。

import "server-only";

import {
  chat,
  submitImage,
  waitImage,
  submitVideo,
  waitVideo,
  tts,
  type ApiClient,
} from "./server-api";
import { buildStoryboardSystem, buildStoryboardUser } from "./prompts";
import {
  getProviderMeta,
  type GenerateEvent,
  type ProviderId,
  type SceneAsset,
  type Storyboard,
  type UserSettings,
} from "./types";

export interface RunOptions {
  topic: string;
  apiKey: string;
  providerId?: ProviderId | string; // 不合法时回退到默认 provider
  settings: UserSettings;
  signal?: AbortSignal;
}

type Emit = (e: GenerateEvent) => void;

function stripJsonFence(s: string): string {
  s = s.trim();
  const m = s.match(/\{[\s\S]*\}/);
  return m ? m[0] : s;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// 异常类型守卫 —— 让所有 abort 路径只关心 name === "AbortError"
function isAbort(e: unknown): boolean {
  return (e as Error)?.name === "AbortError";
}

// 让 setTimeout 能响应 abort，避免错峰等待期间无法取消
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runPipeline(opts: RunOptions, emit: Emit): Promise<void> {
  const { topic, apiKey, providerId, settings, signal } = opts;
  const provider = getProviderMeta(providerId ?? settings.provider);
  const client: ApiClient = { apiKey, provider };
  // 模型用户留空时回退到该 provider 的默认（不同 provider 命名规则不同）
  const storyboardModel = settings.storyboardModel?.trim() || provider.defaults.storyboardModel;
  const imageModel = settings.imageModel?.trim() || provider.defaults.imageModel;
  const videoModel = settings.videoModel?.trim() || provider.defaults.videoModel;
  const ttsModel = settings.ttsModel?.trim() || provider.defaults.ttsModel;
  const runId = uid();
  emit({ type: "start", topic, runId });

  // --------- Step 1: 拆分镜 ---------
  emit({ type: "log", message: "拆分镜中..." });
  const sys = buildStoryboardSystem(settings.numScenes, settings.secondsPerScene);
  const user = buildStoryboardUser(topic);
  const raw = await chat(client, storyboardModel, [
    { role: "system", content: sys },
    { role: "user", content: user },
  ], signal);
  let sb: Storyboard;
  try {
    sb = JSON.parse(stripJsonFence(raw)) as Storyboard;
  } catch {
    throw new Error(`分镜 JSON 解析失败: ${raw.slice(0, 200)}`);
  }
  if (!Array.isArray(sb.scenes) || sb.scenes.length === 0) {
    throw new Error("分镜结果中没有 scenes");
  }
  // 把 global_style + main_character 拼到每个 image_prompt 前
  for (const s of sb.scenes) {
    s.full_image_prompt =
      `${sb.global_style}, ${sb.main_character}, ${s.image_prompt}`;
  }
  sb.imageSize = settings.imageSize;
  emit({ type: "storyboard", data: sb });

  // 全程跟踪每个分镜的产物
  const assets = new Map<number, SceneAsset>();
  for (const s of sb.scenes) assets.set(s.id, { sceneId: s.id });

  // --------- Step 2: 提交图像 (错开 1.5s 避免 429) ---------
  emit({ type: "log", message: `提交 ${sb.scenes.length} 张关键帧...` });
  const imageTasks = new Map<number, string>();
  for (const s of sb.scenes) {
    const tid = await submitImage(
      client,
      imageModel,
      s.full_image_prompt!,
      settings.imageSize,
      signal,
    );
    imageTasks.set(s.id, tid);
    emit({ type: "frame_submitted", sceneId: s.id });
    await sleep(1500, signal);
  }

  // --------- Step 2b: 并发等图 → 收到后立即触发图生视频 ---------
  emit({ type: "log", message: "等待关键帧 + 启动视频生成..." });
  const videoTasks = new Map<number, string>();
  // 任意两次 submitVideo 间至少 800ms（按完成顺序），避免短时高并发触发 429
  const VIDEO_SUBMIT_GAP_MS = 800;
  let nextVideoSubmitAt = 0;

  const imageThenVideo = Array.from(imageTasks.entries()).map(
    async ([sceneId, tid]) => {
      try {
        const imageUrl = await waitImage(client, tid, signal);
        assets.set(sceneId, { ...assets.get(sceneId)!, imageUrl });
        emit({ type: "frame_done", sceneId, imageUrl });

        const now = Date.now();
        const wait = Math.max(0, nextVideoSubmitAt - now);
        // 立即占据下一个槽位，让并发的其他分镜排到它之后
        nextVideoSubmitAt = Math.max(now, nextVideoSubmitAt) + VIDEO_SUBMIT_GAP_MS;
        if (wait > 0) await sleep(wait, signal);

        const scene = sb.scenes.find((x) => x.id === sceneId)!;
        const vtid = await submitVideo(
          client,
          videoModel,
          scene.video_motion,
          imageUrl,
          signal,
        );
        videoTasks.set(sceneId, vtid);
        emit({ type: "video_submitted", sceneId });
      } catch (err) {
        if (isAbort(err)) throw err;
        emit({
          type: "error",
          sceneId,
          message: `关键帧/视频提交失败: ${(err as Error).message}`,
        });
      }
    },
  );

  // --------- Step 3 (TTS): 与图/视频完全并行 ---------
  const ttsPromises = sb.scenes.map(async (s) => {
    try {
      const audioUrl = await tts(client, ttsModel, s.narration, settings.voice, signal);
      assets.set(s.id, { ...assets.get(s.id)!, audioUrl });
      emit({ type: "audio_done", sceneId: s.id, audioUrl });
    } catch (err) {
      if (isAbort(err)) throw err;
      emit({
        type: "error",
        sceneId: s.id,
        message: `TTS 失败: ${(err as Error).message}`,
      });
    }
  });

  // 等所有图+视频提交
  await Promise.all(imageThenVideo);

  // --------- Step 4: 等所有视频 done ---------
  const videoWaits = Array.from(videoTasks.entries()).map(
    async ([sceneId, tid]) => {
      try {
        const videoUrl = await waitVideo(client, tid, signal);
        assets.set(sceneId, { ...assets.get(sceneId)!, videoUrl });
        emit({ type: "video_done", sceneId, videoUrl });
      } catch (err) {
        if (isAbort(err)) throw err;
        emit({
          type: "error",
          sceneId,
          message: `视频失败: ${(err as Error).message}`,
        });
      }
    },
  );

  await Promise.all([...videoWaits, ...ttsPromises]);

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  emit({ type: "complete", assets: Array.from(assets.values()) });
}
