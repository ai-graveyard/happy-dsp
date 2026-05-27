// 整套流水线共享的类型

export interface Scene {
  id: number;
  image_prompt: string;       // 仅场景细节
  video_motion: string;       // 镜头运动描述
  narration: string;          // 中文旁白
  full_image_prompt?: string; // 拼接 global_style 后的最终 prompt（服务端填）
}

export interface Storyboard {
  title: string;
  global_style: string;
  main_character: string;
  scenes: Scene[];
  // Stamped by the server pipeline so the UI can render previews with the
  // right aspect ratio even after the user changes settings or loads history.
  imageSize?: string;
}

export interface SceneAsset {
  sceneId: number;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
}

// SSE 事件 —— 全部都是 application/json 行，前端按 event.type 分发
export type GenerateEvent =
  | { type: "start"; topic: string; runId: string }
  | { type: "storyboard"; data: Storyboard }
  | { type: "frame_submitted"; sceneId: number }
  | { type: "frame_done"; sceneId: number; imageUrl: string }
  | { type: "video_submitted"; sceneId: number }
  | { type: "video_done"; sceneId: number; videoUrl: string }
  | { type: "audio_done"; sceneId: number; audioUrl: string }
  | { type: "log"; message: string }
  | { type: "error"; message: string; sceneId?: number }
  | { type: "complete"; assets: SceneAsset[] };

// 历史记录（存 localStorage）
export interface HistoryItem {
  runId: string;
  topic: string;
  createdAt: number;
  storyboard: Storyboard;
  assets: SceneAsset[];
  finalUrl?: string;       // 合成后的视频 URL（blob: 或远程）
}

// ============================================================================
// Provider —— 预设端点；URL 不让用户随便填，只能在已知列表里选。
// 每个 provider 既有 baseUrl，也带一套该 provider 默认模型名（不同 provider
// 模型命名规则不同，比如 model-router 用 `qwen/foo`，dashscope 原生用 `foo`）。
// ============================================================================

export type ProviderId = "dashscope" | "aliyun-edu";

export interface ProviderMeta {
  id: ProviderId;
  label: string;          // Select 列表里显示的全名
  short: string;          // Trigger 上的紧凑名
  baseUrl: string;
  defaults: {
    storyboardModel: string;
    imageModel: string;
    videoModel: string;
    ttsModel: string;
  };
  // 该 provider 推荐的视频模型 curated 列表（设置面板里下拉）
  videoModels: readonly { id: string; label: string }[];
}

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "dashscope",
    label: "DashScope · 阿里云百炼官方",
    short: "DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    defaults: {
      storyboardModel: "qwen-max",
      imageModel: "wan2.5-t2i-preview",
      videoModel: "wan2.5-i2v-preview",
      ttsModel: "qwen3-tts-flash",
    },
    videoModels: [
      { id: "wan2.5-i2v-preview", label: "Wan 2.5 i2v (preview)" },
    ],
  },
  {
    id: "aliyun-edu",
    label: "Aliyun EDU · 教育版 model-router",
    short: "Aliyun EDU",
    baseUrl: "https://model-router.edu-aliyun.com/v1",
    defaults: {
      storyboardModel: "qwen/qwen3-max",
      imageModel: "qwen/qwen-image-plus",
      videoModel: "qwen/wan2.7-i2v",
      ttsModel: "qwen/qwen3-tts-instruct-flash",
    },
    videoModels: [
      { id: "qwen/wan2.7-i2v", label: "Wan 2.7 (写实/电影感)" },
      { id: "qwen/happyhorse-1.0-i2v", label: "HappyHorse 1.0 (二次元/夸张)" },
    ],
  },
] as const;

const PROVIDERS_BY_ID = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p]),
) as Record<ProviderId, ProviderMeta>;

export const DEFAULT_PROVIDER: ProviderId = "dashscope";

export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === "string" && id in PROVIDERS_BY_ID;
}

// 找不到合法 id 时回退到默认 provider —— 给客户端/服务端都用
export function getProviderMeta(id?: string | null): ProviderMeta {
  return id && isProviderId(id) ? PROVIDERS_BY_ID[id] : PROVIDERS_BY_ID[DEFAULT_PROVIDER];
}

// 用户设置（存 localStorage）
export interface UserSettings {
  apiKey: string;          // 用户自带 key；空表示用共享 key
  provider: ProviderId;    // API 端点预设（dashscope / aliyun-edu）
  numScenes: number;
  secondsPerScene: number;
  voice: string;
  videoModel: string;      // 留空 = 用 provider.defaults.videoModel
  storyboardModel: string; // 留空 = 用 provider.defaults.storyboardModel
  imageModel: string;      // 留空 = 用 provider.defaults.imageModel
  ttsModel: string;        // 留空 = 用 provider.defaults.ttsModel
  imageSize: string;       // 1280*720 / 720*1280
}

export const DEFAULT_SETTINGS: UserSettings = {
  apiKey: "",
  provider: DEFAULT_PROVIDER,
  numScenes: 5,
  secondsPerScene: 5,
  voice: "Cherry",
  videoModel: "",
  storyboardModel: "",
  imageModel: "",
  ttsModel: "",
  imageSize: "1280*720",
};

export const TTS_VOICES = ["Cherry", "Serena", "Ethan", "Chelsie"] as const;
export const IMAGE_SIZES = [
  { id: "1280*720", label: "横屏 16:9 (1280×720)" },
  { id: "720*1280", label: "竖屏 9:16 (720×1280)" },
] as const;
