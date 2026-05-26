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
} from "./server-api";
import { buildStoryboardSystem, buildStoryboardUser } from "./prompts";
import type {
  GenerateEvent,
  SceneAsset,
  Storyboard,
  UserSettings,
} from "./types";

export interface RunOptions {
  topic: string;
  apiKey: string;
  settings: UserSettings;
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

export async function runPipeline(opts: RunOptions, emit: Emit): Promise<void> {
  const { topic, apiKey, settings } = opts;
  const runId = uid();
  emit({ type: "start", topic, runId });

  // --------- Step 1: 拆分镜 ---------
  emit({ type: "log", message: "拆分镜中..." });
  const sys = buildStoryboardSystem(settings.numScenes, settings.secondsPerScene);
  const user = buildStoryboardUser(topic);
  const raw = await chat(apiKey, "qwen/qwen3-max", [
    { role: "system", content: sys },
    { role: "user", content: user },
  ]);
  const sb = JSON.parse(stripJsonFence(raw)) as Storyboard;
  // 把 global_style + main_character 拼到每个 image_prompt 前
  for (const s of sb.scenes) {
    s.full_image_prompt =
      `${sb.global_style}, ${sb.main_character}, ${s.image_prompt}`;
  }
  emit({ type: "storyboard", data: sb });

  // 全程跟踪每个分镜的产物
  const assets = new Map<number, SceneAsset>();
  for (const s of sb.scenes) assets.set(s.id, { sceneId: s.id });

  // --------- Step 2: 提交图像 (错开 1.5s 避免 429) ---------
  emit({ type: "log", message: `提交 ${sb.scenes.length} 张关键帧...` });
  const imageTasks = new Map<number, string>();
  for (const s of sb.scenes) {
    const tid = await submitImage(
      apiKey,
      s.full_image_prompt!,
      settings.imageSize,
    );
    imageTasks.set(s.id, tid);
    emit({ type: "frame_submitted", sceneId: s.id });
    await new Promise((r) => setTimeout(r, 1500));
  }

  // --------- Step 2b: 并发等图 → 收到后立即触发图生视频 ---------
  emit({ type: "log", message: "等待关键帧 + 启动视频生成..." });
  const videoTasks = new Map<number, string>();

  const imageThenVideo = Array.from(imageTasks.entries()).map(
    async ([sceneId, tid], idx) => {
      const imageUrl = await waitImage(apiKey, tid);
      assets.set(sceneId, { ...assets.get(sceneId)!, imageUrl });
      emit({ type: "frame_done", sceneId, imageUrl });

      // 错开提交视频（每段 +0.8s）
      await new Promise((r) => setTimeout(r, 800 * idx));

      const scene = sb.scenes.find((x) => x.id === sceneId)!;
      const vtid = await submitVideo(
        apiKey,
        settings.videoModel,
        scene.video_motion,
        imageUrl,
      );
      videoTasks.set(sceneId, vtid);
      emit({ type: "video_submitted", sceneId });
    },
  );

  // --------- Step 3 (TTS): 与图/视频完全并行 ---------
  const ttsPromises = sb.scenes.map(async (s) => {
    try {
      const audioUrl = await tts(apiKey, s.narration, settings.voice);
      assets.set(s.id, { ...assets.get(s.id)!, audioUrl });
      emit({ type: "audio_done", sceneId: s.id, audioUrl });
    } catch (err) {
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
        const videoUrl = await waitVideo(apiKey, tid);
        assets.set(sceneId, { ...assets.get(sceneId)!, videoUrl });
        emit({ type: "video_done", sceneId, videoUrl });
      } catch (err) {
        emit({
          type: "error",
          sceneId,
          message: `视频失败: ${(err as Error).message}`,
        });
      }
    },
  );

  await Promise.all([...videoWaits, ...ttsPromises]);

  emit({ type: "complete", assets: Array.from(assets.values()) });
}
