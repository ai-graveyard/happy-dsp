// POST /api/generate
// 入参: { topic: string, settings: UserSettings }
// header: x-mr-key（可选，用户自带 key；缺则用 env.SHARED_MR_KEY）
// header: x-mr-base-url（可选，用户自定义 API URL；必须配合 x-mr-key 使用）
// 出参: Server-Sent Events stream of GenerateEvent

import { runPipeline } from "@/lib/pipeline";
import type { GenerateEvent, UserSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // Vercel Pro fluid compute up to ~900s

interface Body {
  topic?: string;
  settings?: Partial<UserSettings>;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const topic = (body.topic || "").trim();
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

  const userBaseUrl = (req.headers.get("x-mr-base-url") || "").trim();
  let baseUrl: string | undefined;
  if (userBaseUrl) {
    // 自定义 URL 必须配合自带 key，否则共享 key 可能被发送到任意服务器
    if (!userKey) {
      return new Response(
        JSON.stringify({
          error: "自定义 API URL 必须配合自带 API Key 使用。",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    try {
      const u = new URL(userBaseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("scheme");
      }
      baseUrl = userBaseUrl;
    } catch {
      return new Response(
        JSON.stringify({
          error: "API URL 格式无效，需以 http:// 或 https:// 开头。",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
  }

  const settings: UserSettings = { ...DEFAULT_SETTINGS, ...(body.settings || {}) };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      function send(event: GenerateEvent) {
        if (closed) return;
        const line = `data: ${JSON.stringify(event)}\n\n`;
        try { controller.enqueue(encoder.encode(line)); } catch {}
      }
      // 心跳，防止中间代理切断空闲连接
      const heartbeat = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch {}
      }, 15_000);

      try {
        await runPipeline(
          { topic, apiKey, baseUrl, settings, signal: req.signal },
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
