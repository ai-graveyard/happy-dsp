// POST /api/storyboard
// 入参: { input: StoryInput, settings: UserSettings }
// header: x-mr-key（可选，用户自带 key；缺则用 env.SHARED_MR_KEY）
// 出参: JSON Storyboard（一次性，非 SSE）
//
// 这是新流程第 1 步：只拆分镜，不生图/视频。
// 前端拿到 storyboard 后让用户编辑/重抽，确认了才调 /api/generate-assets。

import { generateStoryboard } from "@/lib/pipeline";
import {
  DEFAULT_SETTINGS,
  isProviderId,
  type StoryInput,
  type UserSettings,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 拆分镜只调一次 LLM，几十秒足够
export const maxDuration = 120;

interface Body {
  input?: Partial<StoryInput>;
  settings?: Partial<UserSettings>;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const topic = (body.input?.topic || "").trim();
  if (!topic) {
    return new Response(
      JSON.stringify({ error: "topic 不能为空" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const userKey = req.headers.get("x-mr-key") || "";
  const apiKey = userKey || process.env.SHARED_MR_KEY || "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "未配置 API Key：请在设置中填入你自己的 sk-xxx，或部署方需配置 SHARED_MR_KEY 环境变量。",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const settings: UserSettings = { ...DEFAULT_SETTINGS, ...(body.settings || {}) };
  const providerId = isProviderId(settings.provider) ? settings.provider : undefined;
  const input: StoryInput = {
    topic,
    character: body.input?.character?.trim() || undefined,
    pacing: body.input?.pacing === "slow" || body.input?.pacing === "direct"
      ? body.input.pacing
      : undefined,
  };

  try {
    const storyboard = await generateStoryboard({
      input,
      apiKey,
      providerId,
      settings,
      signal: req.signal,
    });
    return new Response(JSON.stringify({ storyboard }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      // 客户端断开 —— 不返回错误体（连接已经没了）
      return new Response(null, { status: 499 });
    }
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
