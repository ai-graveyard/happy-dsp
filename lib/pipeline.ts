// 主流水线（服务端），拆成两个独立可调用的函数：
//   - generateStoryboard()：只拆分镜，返回 Storyboard 对象（一次性，非 SSE）
//   - generateAssets()：接收已编辑的 storyboard，并行跑图/视频/TTS，emit SSE
// 这样前端可以在拿到分镜后让用户编辑/重抽，确认后再触发资源生成。

import "server-only";

import {
  chat,
  submitImage,
  submitImageEdit,
  waitImage,
  submitVideo,
  waitVideo,
  tts,
  type ApiClient,
} from "./server-api";
import { buildStoryboardSystem, buildStoryboardUser } from "./prompts";
import {
  getProviderMeta,
  getStylePreset,
  type GenerateEvent,
  type ProviderId,
  type SceneAsset,
  type StoryInput,
  type Storyboard,
  type UserSettings,
} from "./types";

type Emit = (e: GenerateEvent) => void;

function stripJsonFence(s: string): string {
  s = s.trim();
  const m = s.match(/\{[\s\S]*\}/);
  return m ? m[0] : s;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function isAbort(e: unknown): boolean {
  return (e as Error)?.name === "AbortError";
}

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

// ============================================================================
// Step 1: 拆分镜
// ============================================================================

export interface StoryboardOptions {
  input: StoryInput;
  apiKey: string;
  providerId?: ProviderId | string;
  settings: UserSettings;
  signal?: AbortSignal;
}

export async function generateStoryboard(
  opts: StoryboardOptions,
): Promise<Storyboard> {
  const { input, apiKey, providerId, settings, signal } = opts;
  const provider = getProviderMeta(providerId ?? settings.provider);
  const client: ApiClient = { apiKey, provider };
  const storyboardModel =
    settings.storyboardModel?.trim() || provider.defaults.storyboardModel;

  const stylePreset = getStylePreset(settings.style);
  const styleKeywords = stylePreset.keywords.trim();
  const sys = buildStoryboardSystem(
    settings.numScenes,
    settings.secondsPerScene,
    styleKeywords || undefined,
    input.character?.trim() || undefined,
    input.pacing,
  );
  const user = buildStoryboardUser(input.topic);
  const raw = await chat(
    client,
    storyboardModel,
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    signal,
  );
  let sb: Storyboard;
  try {
    sb = JSON.parse(stripJsonFence(raw)) as Storyboard;
  } catch {
    throw new Error(`分镜 JSON 解析失败: ${raw.slice(0, 200)}`);
  }
  if (!Array.isArray(sb.scenes) || sb.scenes.length === 0) {
    throw new Error("分镜结果中没有 scenes");
  }
  // 非 auto 时强制覆盖 global_style —— 模型偶尔会自己 "微调" 风格描述，
  // 直接覆盖保证用户选的风格 100% 落到下游图/视频 prompt。
  if (styleKeywords) {
    sb.global_style = styleKeywords;
  }
  // 把 global_style + main_character 拼到每个 image_prompt 前
  for (const s of sb.scenes) {
    s.full_image_prompt =
      `${sb.global_style}, ${sb.main_character}, ${s.image_prompt}`;
  }
  sb.imageSize = settings.imageSize;
  return sb;
}

// ============================================================================
// Step 1.5 (PR B): 主角立绘 —— 用 main_character + global_style 文生图，
// 拿一张干净的角色卡给用户在编辑器里确认；这张图同时会作为下游 reference 注入
// 每个 scene 的 image-edit 调用，保证主角一致性。
// ============================================================================

export interface CharacterOptions {
  storyboard: Storyboard;
  apiKey: string;
  providerId?: ProviderId | string;
  settings: UserSettings;
  signal?: AbortSignal;
}

export async function generateCharacterPortrait(
  opts: CharacterOptions,
): Promise<string> {
  const { storyboard: sb, apiKey, providerId, settings, signal } = opts;
  const provider = getProviderMeta(providerId ?? settings.provider);
  const client: ApiClient = { apiKey, provider };
  const imageModel = settings.imageModel?.trim() || provider.defaults.imageModel;
  const imageSize = sb.imageSize || settings.imageSize;

  // 立绘 prompt —— 强调全身、中性背景、干净构图，方便后续做 reference
  const prompt =
    `${sb.global_style}, character reference sheet, full body portrait of ` +
    `${sb.main_character}, neutral solid background, T-pose, clean composition, ` +
    `front view, no other characters, high detail`;

  const tid = await submitImage(client, imageModel, prompt, imageSize, signal);
  const url = await waitImage(client, tid, signal);
  if (!url) throw new Error("立绘生成成功但未返回 URL");
  return url;
}

// ============================================================================
// Step 2-4: 图/视频/TTS，并行
// ============================================================================

export interface AssetsOptions {
  storyboard: Storyboard;
  apiKey: string;
  providerId?: ProviderId | string;
  settings: UserSettings;
  signal?: AbortSignal;
}

export async function generateAssets(
  opts: AssetsOptions,
  emit: Emit,
): Promise<void> {
  const { storyboard: sb, apiKey, providerId, settings, signal } = opts;
  const provider = getProviderMeta(providerId ?? settings.provider);
  const client: ApiClient = { apiKey, provider };
  const imageModel = settings.imageModel?.trim() || provider.defaults.imageModel;
  const editImageModel =
    settings.editImageModel?.trim() || provider.defaults.editImageModel;
  const videoModel = settings.videoModel?.trim() || provider.defaults.videoModel;
  const ttsModel = settings.ttsModel?.trim() || provider.defaults.ttsModel;

  const runId = uid();
  emit({ type: "start", runId });

  // 用户编辑过 image_prompt 后，full_image_prompt 可能没刷新；这里兜底重拼一次。
  // 同时确保 imageSize 跟当前 settings 一致（用户在编辑时切换了方向也能生效）。
  for (const s of sb.scenes) {
    s.full_image_prompt =
      `${sb.global_style}, ${sb.main_character}, ${s.image_prompt}`;
  }
  const imageSize = sb.imageSize || settings.imageSize;

  // PR B: 如果有主角立绘 + provider 支持 ref，就走 image-edit endpoint
  const refImageUrl = sb.characterImageUrl?.trim() || "";
  const useRef = !!refImageUrl && provider.supportsReferenceImage;
  if (useRef) {
    emit({
      type: "log",
      message: `已带主角立绘 reference (${editImageModel})，每帧会融入主角形象`,
    });
  }

  const assets = new Map<number, SceneAsset>();
  for (const s of sb.scenes) assets.set(s.id, { sceneId: s.id });

  // 单帧提交：有 ref 用 image-edit；失败就降级到无 ref 文生图，保证流程能往下走。
  async function submitFrame(s: typeof sb.scenes[number]): Promise<string> {
    if (useRef) {
      try {
        return await submitImageEdit(
          client,
          editImageModel,
          s.image_prompt, // image-edit 直接吃场景描述，不需要再拼角色
          refImageUrl,
          imageSize,
          signal,
        );
      } catch (err) {
        if (isAbort(err)) throw err;
        // image-edit endpoint 在 EDU 端可能 404 / 模型名不对 / 配额限制；
        // 单帧降级，下次循环还会再试一次，不影响其它分镜。
        emit({
          type: "log",
          message: `场景 ${s.id} 立绘 reference 注入失败，降级到无 ref 文生图：${(err as Error).message.slice(0, 120)}`,
        });
        return submitImage(client, imageModel, s.full_image_prompt!, imageSize, signal);
      }
    }
    return submitImage(client, imageModel, s.full_image_prompt!, imageSize, signal);
  }

  // --------- Step 2: 提交图像 (错开 1.5s 避免 429) ---------
  emit({ type: "log", message: `提交 ${sb.scenes.length} 张关键帧...` });
  const imageTasks = new Map<number, string>();
  for (const s of sb.scenes) {
    const tid = await submitFrame(s);
    imageTasks.set(s.id, tid);
    emit({ type: "frame_submitted", sceneId: s.id });
    await sleep(1500, signal);
  }

  // --------- Step 2b: 并发等图 → 收到后立即触发图生视频 ---------
  emit({ type: "log", message: "等待关键帧 + 启动视频生成..." });
  const videoTasks = new Map<number, string>();
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
