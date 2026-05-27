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

// 用户设置（存 localStorage）
export interface UserSettings {
  apiKey: string;          // 用户自带 key；空表示用共享 key
  apiBaseUrl: string;      // 自定义 API URL；空表示用默认/服务端 env
  numScenes: number;
  secondsPerScene: number;
  voice: string;
  videoModel: string;      // 图生视频 (qwen/wan2.7-i2v 或 qwen/happyhorse-1.0-i2v)
  storyboardModel: string; // 分镜文本生成
  imageModel: string;      // 文生图
  ttsModel: string;        // TTS
  imageSize: string;       // 1280*720 / 720*1280
}

export const DEFAULT_API_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

export const DEFAULT_STORYBOARD_MODEL = "qwen/qwen3-max";
export const DEFAULT_IMAGE_MODEL = "qwen/qwen-image-plus";
export const DEFAULT_VIDEO_MODEL = "qwen/wan2.7-i2v";
export const DEFAULT_TTS_MODEL = "qwen/qwen3-tts-instruct-flash";

export const DEFAULT_SETTINGS: UserSettings = {
  apiKey: "",
  apiBaseUrl: "",
  numScenes: 5,
  secondsPerScene: 5,
  voice: "Cherry",
  videoModel: DEFAULT_VIDEO_MODEL,
  storyboardModel: DEFAULT_STORYBOARD_MODEL,
  imageModel: DEFAULT_IMAGE_MODEL,
  ttsModel: DEFAULT_TTS_MODEL,
  imageSize: "1280*720",
};

export const TTS_VOICES = ["Cherry", "Serena", "Ethan", "Chelsie"] as const;
export const VIDEO_MODELS = [
  { id: "qwen/wan2.7-i2v", label: "Wan 2.7 (写实/电影感)" },
  { id: "qwen/happyhorse-1.0-i2v", label: "HappyHorse 1.0 (二次元/夸张)" },
] as const;
export const IMAGE_SIZES = [
  { id: "1280*720", label: "横屏 16:9 (1280×720)" },
  { id: "720*1280", label: "竖屏 9:16 (720×1280)" },
] as const;
