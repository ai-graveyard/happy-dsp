// Provider-aware API 客户端 (server-side only)。
// 每个 provider 有自己的 baseUrl + 路径/payload 协议；这里按 provider.id 分发：
//   - aliyun-edu  → model-router 风格：/chat/completions, /images/generations 等
//   - dashscope   → DashScope 原生：/services/aigc/text-generation/generation 等
// /tasks/{id} 两边形状基本一致，共用 pollTask。

import "server-only";

import type { ProviderMeta } from "./types";

export interface ApiClient {
  apiKey: string;
  provider: ProviderMeta;
}

// ============================================================================
// 共享工具
// ============================================================================

function authHeaders(apiKey: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function requestWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 5,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const r = await fetch(url, init);
      if (RETRYABLE_STATUS.has(r.status)) {
        lastErr = new Error(`HTTP ${r.status}`);
        const wait = 2_000 * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
      }
      return r;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      if (e instanceof Error && /^HTTP \d{3}: /.test(e.message)) throw e;
      lastErr = e;
      const wait = 2_000 * Math.pow(2, attempt);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw new Error(`请求多次失败: ${url} — ${String(lastErr)}`);
}

function withSignal(init: RequestInit, signal?: AbortSignal): RequestInit {
  return signal ? { ...init, signal } : init;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
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

interface TaskOutput {
  task_status?: string;
  results?: Array<{ url: string }>;
  video_url?: string;
  [k: string]: unknown;
}

// 两个 provider 的 /tasks/{id} 形状一致：output.task_status / results / video_url
async function pollTask(
  client: ApiClient,
  taskId: string,
  intervalMs: number,
  timeoutMs = 600_000,
  label = "task",
  signal?: AbortSignal,
): Promise<TaskOutput> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const r = await requestWithRetry(`${client.provider.baseUrl}/tasks/${taskId}`, withSignal({
      method: "GET",
      headers: authHeaders(client.apiKey),
    }, signal));
    const j = await r.json();
    const out = (j.output || {}) as TaskOutput;
    if (out.task_status === "SUCCEEDED") return out;
    if (out.task_status === "FAILED") {
      throw new Error(`[${label}] task failed: ${JSON.stringify(out)}`);
    }
    await delay(intervalMs, signal);
  }
  throw new Error(`[${label}] 超时: ${taskId}`);
}

// ============================================================================
// 公共 API —— 按 provider 分发
// ============================================================================

export async function chat(
  client: ApiClient,
  model: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  return client.provider.id === "dashscope"
    ? chatDashScope(client, model, messages, signal)
    : chatAliyunEdu(client, model, messages, signal);
}

export async function submitImage(
  client: ApiClient,
  model: string,
  prompt: string,
  size = "1280*720",
  signal?: AbortSignal,
): Promise<string> {
  return client.provider.id === "dashscope"
    ? submitImageDashScope(client, model, prompt, size, signal)
    : submitImageAliyunEdu(client, model, prompt, size, signal);
}

// PR B: 图编辑（带 reference 图）—— 把主角立绘融入新场景的 prompt 里。
// 跟 submitImage 一样异步返回 task_id，poll 完拿 URL。
// shape 参考 DashScope qwen-image-edit-plus 文档：
//   POST /services/aigc/multimodal-generation/generation  (X-DashScope-Async: enable)
//   body: { model, input: { messages: [{ role: "user", content: [{image}, {text}] }] }, parameters: { size, n } }
// EDU model-router 端点路径未公开，先按惯例猜 /images/edits（OpenAI 风格路径
// + DashScope 风格 body）；失败由调用方降级到无 ref 的 submitImage。
export async function submitImageEdit(
  client: ApiClient,
  model: string,
  prompt: string,
  refImageUrl: string,
  size = "1280*720",
  signal?: AbortSignal,
): Promise<string> {
  return client.provider.id === "dashscope"
    ? submitImageEditDashScope(client, model, prompt, refImageUrl, size, signal)
    : submitImageEditAliyunEdu(client, model, prompt, refImageUrl, size, signal);
}

export async function waitImage(
  client: ApiClient,
  taskId: string,
  signal?: AbortSignal,
): Promise<string> {
  const out = await pollTask(client, taskId, 3_000, 300_000, `image#${taskId}`, signal);
  // qwen-image-edit / wan-image-edit 异步任务返回的格式可能是
  //   results: [{ url }]               （跟 text2image 一致）
  // 或者
  //   choices: [{ message: { content: [{ image: url }] } }]   （multimodal 风格）
  // 兜底两种都尝试一遍。
  const fromResults = out.results?.[0]?.url;
  if (fromResults) return fromResults;
  const choices = (out as { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> }).choices;
  const fromChoices = choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (fromChoices) return fromChoices;
  return "";
}

export async function submitVideo(
  client: ApiClient,
  model: string,
  prompt: string,
  imageUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  return client.provider.id === "dashscope"
    ? submitVideoDashScope(client, model, prompt, imageUrl, signal)
    : submitVideoAliyunEdu(client, model, prompt, imageUrl, signal);
}

export async function waitVideo(
  client: ApiClient,
  taskId: string,
  signal?: AbortSignal,
): Promise<string> {
  const out = await pollTask(client, taskId, 10_000, 600_000, `video#${taskId}`, signal);
  return (out.video_url ?? "") as string;
}

export async function tts(
  client: ApiClient,
  model: string,
  text: string,
  voice = "Cherry",
  signal?: AbortSignal,
): Promise<string> {
  return client.provider.id === "dashscope"
    ? ttsDashScope(client, model, text, voice, signal)
    : ttsAliyunEdu(client, model, text, voice, signal);
}

// ============================================================================
// Aliyun EDU (model-router) 实现 —— OpenAI 风格路径
// ============================================================================

async function chatAliyunEdu(
  client: ApiClient,
  model: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(`${client.provider.baseUrl}/chat/completions`, withSignal({
    method: "POST",
    headers: authHeaders(client.apiKey),
    body: JSON.stringify({ model, messages, stream: false }),
  }, signal));
  const j = await r.json();
  return j.choices[0].message.content as string;
}

async function submitImageAliyunEdu(
  client: ApiClient,
  model: string,
  prompt: string,
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(`${client.provider.baseUrl}/images/generations`, withSignal({
    method: "POST",
    headers: authHeaders(client.apiKey, { "X-MR-Async": "true" }),
    body: JSON.stringify({
      model,
      input: { prompt },
      parameters: { size, n: 1, prompt_extend: true },
    }),
  }, signal));
  const j = await r.json();
  return j.output.task_id as string;
}

async function submitImageEditAliyunEdu(
  client: ApiClient,
  model: string,
  prompt: string,
  refImageUrl: string,
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  // EDU 端点路径未公开；按 model-router 惯例尝试 /images/edits
  const r = await requestWithRetry(`${client.provider.baseUrl}/images/edits`, withSignal({
    method: "POST",
    headers: authHeaders(client.apiKey, { "X-MR-Async": "true" }),
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              { image: refImageUrl },
              { text: prompt },
            ],
          },
        ],
      },
      parameters: { size, n: 1 },
    }),
  }, signal));
  const j = await r.json();
  return j.output.task_id as string;
}

async function submitVideoAliyunEdu(
  client: ApiClient,
  model: string,
  prompt: string,
  imageUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(`${client.provider.baseUrl}/videos/generations`, withSignal({
    method: "POST",
    headers: authHeaders(client.apiKey),
    body: JSON.stringify({
      model,
      input: {
        prompt,
        media: [{ type: "first_frame", url: imageUrl }],
      },
    }),
  }, signal));
  const j = await r.json();
  return j.output.task_id as string;
}

async function ttsAliyunEdu(
  client: ApiClient,
  model: string,
  text: string,
  voice: string,
  signal?: AbortSignal,
): Promise<string> {
  // 服务端报 "The input parameter requires json" —— input 必须是 JSON 对象
  // 而不是裸字符串，且 voice 也需要随 input 走。
  const r = await requestWithRetry(`${client.provider.baseUrl}/audio/speech`, withSignal({
    method: "POST",
    headers: authHeaders(client.apiKey),
    body: JSON.stringify({
      model,
      input: { text, voice },
    }),
  }, signal));
  const j = await r.json();
  return j.output.audio.url as string;
}

// ============================================================================
// DashScope 原生实现 —— /services/aigc/* 路径 + X-DashScope-Async
// 参考：https://help.aliyun.com/zh/model-studio/developer-reference/api-details
// 注意：以下路径基于 DashScope 公开文档，部分模型（尤其 TTS）endpoint
// 可能随模型族不同而需要调整，遇到 404/400 看 task_status FAILED 时优先核对。
// ============================================================================

async function chatDashScope(
  client: ApiClient,
  model: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(
    `${client.provider.baseUrl}/services/aigc/text-generation/generation`,
    withSignal({
      method: "POST",
      headers: authHeaders(client.apiKey),
      body: JSON.stringify({
        model,
        input: { messages },
        parameters: { result_format: "message" },
      }),
    }, signal),
  );
  const j = await r.json();
  return j.output.choices[0].message.content as string;
}

async function submitImageDashScope(
  client: ApiClient,
  model: string,
  prompt: string,
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(
    `${client.provider.baseUrl}/services/aigc/text2image/image-synthesis`,
    withSignal({
      method: "POST",
      headers: authHeaders(client.apiKey, { "X-DashScope-Async": "enable" }),
      body: JSON.stringify({
        model,
        input: { prompt },
        parameters: { size, n: 1, prompt_extend: true },
      }),
    }, signal),
  );
  const j = await r.json();
  return j.output.task_id as string;
}

async function submitImageEditDashScope(
  client: ApiClient,
  model: string,
  prompt: string,
  refImageUrl: string,
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  // qwen-image-edit-plus / wan2.7-image-pro 走 multimodal-generation/generation
  // 异步接口；body 用 messages.content 数组，里面塞 image + text。
  const r = await requestWithRetry(
    `${client.provider.baseUrl}/services/aigc/multimodal-generation/generation`,
    withSignal({
      method: "POST",
      headers: authHeaders(client.apiKey, { "X-DashScope-Async": "enable" }),
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [
                { image: refImageUrl },
                { text: prompt },
              ],
            },
          ],
        },
        parameters: { size, n: 1 },
      }),
    }, signal),
  );
  const j = await r.json();
  return j.output.task_id as string;
}

async function submitVideoDashScope(
  client: ApiClient,
  model: string,
  prompt: string,
  imageUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  // DashScope 的 i2v 入参在 2.7 那一代换了：
  //   wan2.5 / wan2.6 → input.img_url (旧)
  //   wan2.7+         → input.media   (新)
  // 同时也兜底其它 OpenAPI 风格的模型族（vidu/sora 等），保持 media 新格式。
  const usesMedia = /^wan2\.[7-9]/.test(model) || /^wan[3-9]/.test(model);
  const input = usesMedia
    ? { prompt, media: [{ type: "first_frame", url: imageUrl }] }
    : { prompt, img_url: imageUrl };
  const r = await requestWithRetry(
    `${client.provider.baseUrl}/services/aigc/video-generation/video-synthesis`,
    withSignal({
      method: "POST",
      headers: authHeaders(client.apiKey, { "X-DashScope-Async": "enable" }),
      body: JSON.stringify({ model, input, parameters: {} }),
    }, signal),
  );
  const j = await r.json();
  return j.output.task_id as string;
}

async function ttsDashScope(
  client: ApiClient,
  model: string,
  text: string,
  voice: string,
  signal?: AbortSignal,
): Promise<string> {
  // qwen-tts / qwen3-tts 同步 HTTP 入口（multimodal-generation）。
  // 不同 TTS 模型族（CosyVoice 等）入口可能不同，必要时按模型分发。
  const r = await requestWithRetry(
    `${client.provider.baseUrl}/services/aigc/multimodal-generation/generation`,
    withSignal({
      method: "POST",
      headers: authHeaders(client.apiKey),
      body: JSON.stringify({
        model,
        input: { text, voice },
        parameters: {},
      }),
    }, signal),
  );
  const j = await r.json();
  return j.output.audio.url as string;
}
