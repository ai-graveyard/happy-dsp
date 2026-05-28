// POST /api/character
// 入参: { storyboard: Storyboard, settings: UserSettings }
// header: x-mr-key（可选）
// 出参: JSON { url: string }（一次性，非 SSE）
//
// 用 storyboard.main_character + global_style 生成一张主角立绘。
// 前端拿到 URL 后写回 storyboard.characterImageUrl，提交给 /api/generate-assets
// 时下游会作为 reference image 注入每个场景帧。

import { generateCharacterPortrait } from "@/lib/pipeline";
import {
  DEFAULT_SETTINGS,
  isProviderId,
  type Storyboard,
  type UserSettings,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 立绘只是一张图，3 分钟充足
export const maxDuration = 180;

interface Body {
  storyboard?: Partial<Storyboard>;
  settings?: Partial<UserSettings>;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const sb = body.storyboard as Storyboard | undefined;
  if (!sb || typeof sb.main_character !== "string" || !sb.main_character.trim()) {
    return new Response(
      JSON.stringify({ error: "storyboard.main_character 不能为空" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (typeof sb.global_style !== "string") {
    return new Response(
      JSON.stringify({ error: "storyboard.global_style 缺失" }),
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

  try {
    const url = await generateCharacterPortrait({
      storyboard: sb,
      apiKey,
      providerId,
      settings,
      signal: req.signal,
    });
    return new Response(JSON.stringify({ url }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
