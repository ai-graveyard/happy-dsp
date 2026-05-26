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
  numScenes: number;
  secondsPerScene: number;
  voice: string;
  videoModel: string;      // qwen/wan2.7-i2v 或 qwen/happyhorse-1.0-i2v
  imageSize: string;       // 1280*720 / 720*1280
}

export const DEFAULT_SETTINGS: UserSettings = {
  apiKey: "",
  numScenes: 5,
  secondsPerScene: 5,
  voice: "Cherry",
  videoModel: "qwen/wan2.7-i2v",
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
