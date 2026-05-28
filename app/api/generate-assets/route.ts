// POST /api/generate-assets
// 入参: { storyboard: Storyboard, settings: UserSettings }
// header: x-mr-key（可选）
// 出参: SSE stream of GenerateEvent（不含 storyboard 事件，分镜已由 /api/storyboard 给过）

import { generateAssets } from "@/lib/pipeline";
import {
  DEFAULT_SETTINGS,
  isProviderId,
  type GenerateEvent,
  type Storyboard,
  type UserSettings,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // 跟原 /api/generate 一致

interface Body {
  storyboard?: Storyboard;
  settings?: Partial<UserSettings>;
}

function validateStoryboard(sb: unknown): sb is Storyboard {
  if (!sb || typeof sb !== "object") return false;
  const x = sb as Storyboard;
  if (typeof x.title !== "string") return false;
  if (typeof x.global_style !== "string") return false;
  if (typeof x.main_character !== "string") return false;
  if (!Array.isArray(x.scenes) || x.scenes.length === 0) return false;
  return x.scenes.every(
    (s) =>
      typeof s.id === "number" &&
      typeof s.image_prompt === "string" &&
      typeof s.video_motion === "string" &&
      typeof s.narration === "string",
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  if (!validateStoryboard(body.storyboard)) {
    return new Response(
      JSON.stringify({ error: "storyboard 不合法" }),
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      function send(event: GenerateEvent) {
        if (closed) return;
        const line = `data: ${JSON.stringify(event)}\n\n`;
        try { controller.enqueue(encoder.encode(line)); } catch {}
      }
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {}
      }, 15_000);

      try {
        await generateAssets(
          {
            storyboard: body.storyboard!,
            apiKey,
            providerId,
            settings,
            signal: req.signal,
          },
          send,
        );
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          send({ type: "error", message: (err as Error).message });
        }
      } finally {
        closed = true;
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      // 客户端断开 —— 由 req.signal 触发 pipeline 内的 abort
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
