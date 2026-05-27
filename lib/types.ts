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
      { id: "wan2.5-i2v-preview", label: "Wan 2.5 i2v (preview, 默认)" },
      { id: "wan2.6-i2v-flash", label: "Wan 2.6 i2v Flash (更快)" },
      { id: "wan2.7-i2v", label: "Wan 2.7 i2v (最新)" },
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

// ============================================================================
// 视觉风格预设 —— 让用户在生成前就能预知出片基调；"auto" 时交由模型自由发挥。
// keywords 会直接作为 storyboard.global_style 注入图/视频 prompt。
// ============================================================================

export interface StylePreset {
  id: string;
  label: string;     // 中文短名
  emoji: string;     // chip 上的视觉锚点
  hint: string;      // 一句话中文描述，给 trigger / tooltip
  keywords: string;  // 注入 global_style 的英文关键词；auto 留空
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: "auto",
    label: "自动",
    emoji: "✨",
    hint: "让 AI 根据主题自由选择风格",
    keywords: "",
  },
  {
    id: "cinematic",
    label: "电影感",
    emoji: "🎬",
    hint: "写实电影、浅景深、戏剧光",
    keywords:
      "cinematic photorealistic still, shallow depth of field, dramatic key lighting, anamorphic lens, 35mm film grain, 4k",
  },
  {
    id: "anime",
    label: "日漫",
    emoji: "🌸",
    hint: "日式动画、赛璐璐、明亮鲜艳",
    keywords:
      "modern Japanese anime style, cel-shaded, vivid saturated colors, clean line art, dynamic composition, soft rim light",
  },
  {
    id: "ghibli",
    label: "吉卜力",
    emoji: "🌿",
    hint: "吉卜力手绘、温柔治愈",
    keywords:
      "Studio Ghibli hand-drawn animation style, soft watercolor backgrounds, gentle pastel palette, whimsical, warm afternoon light",
  },
  {
    id: "cyberpunk",
    label: "赛博朋克",
    emoji: "🌃",
    hint: "霓虹、夜雨、未来都市",
    keywords:
      "cyberpunk neo-noir, neon signs, wet reflective streets, rain, holographic billboards, blade runner aesthetic, teal and magenta",
  },
  {
    id: "ink",
    label: "水墨",
    emoji: "🖌️",
    hint: "中国水墨、留白写意",
    keywords:
      "traditional Chinese ink wash painting, sumi-e brush strokes, monochrome with subtle color, lots of negative space, rice paper texture",
  },
  {
    id: "pixar",
    label: "3D 卡通",
    emoji: "🧸",
    hint: "皮克斯风、表情夸张、明亮",
    keywords:
      "Pixar style 3D animation, expressive characters, soft global illumination, vibrant colors, subsurface scattering, family friendly",
  },
  {
    id: "retro-film",
    label: "复古胶片",
    emoji: "📼",
    hint: "70s 胶片、暖调颗粒",
    keywords:
      "vintage 1970s film photography, warm Kodachrome color grading, visible film grain, soft halation, nostalgic mood",
  },
  {
    id: "pixel",
    label: "像素",
    emoji: "👾",
    hint: "16-bit 像素游戏画面",
    keywords:
      "16-bit pixel art, limited retro game palette, crisp dithering, side-scrolling composition, SNES aesthetic",
  },
  {
    id: "watercolor",
    label: "水彩",
    emoji: "🎨",
    hint: "水彩插画、柔和梦幻",
    keywords:
      "watercolor illustration, soft pastel washes, visible paper texture, dreamy, hand-painted, light bleeding edges",
  },
] as const;

const STYLE_PRESETS_BY_ID = Object.fromEntries(
  STYLE_PRESETS.map((s) => [s.id, s]),
) as Record<string, StylePreset>;

export const DEFAULT_STYLE: string = "auto";

export function getStylePreset(id?: string | null): StylePreset {
  return (id && STYLE_PRESETS_BY_ID[id]) || STYLE_PRESETS_BY_ID[DEFAULT_STYLE];
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
  style: string;           // STYLE_PRESETS.id；"auto" 表示交给模型
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
  style: DEFAULT_STYLE,
};

export const TTS_VOICES = ["Cherry", "Serena", "Ethan", "Chelsie"] as const;
export const IMAGE_SIZES = [
  { id: "1280*720", label: "横屏 16:9 (1280×720)" },
  { id: "720*1280", label: "竖屏 9:16 (720×1280)" },
] as const;
