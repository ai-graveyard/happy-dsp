// Model Router API 客户端 (server-side only)。
// 端到端处理：chat / 异步图像 / 异步视频 / TTS。
// key 由调用方传入（用户自带 key > 环境变量 SHARED_MR_KEY）。

import "server-only";

import { DEFAULT_API_BASE_URL } from "./types";

export interface ApiClient {
  apiKey: string;
  baseUrl: string; // 已 resolve、已 strip 尾斜杠
}

// 优先级：调用方覆盖 > env > 默认
export function resolveBaseUrl(override?: string): string {
  const raw = (override?.trim() || process.env.MR_BASE_URL || DEFAULT_API_BASE_URL).trim();
  return raw.replace(/\/+$/, "");
}

function authHeaders(apiKey: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}

// 带 429 / 5xx 指数退避的请求。
// 4xx (非 429) 直接抛错不重试；网络错误也按 5xx 处理。
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
        // 非可重试错误：立即抛出
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
      }
      return r;
    } catch (e) {
      // AbortError 立即上抛，不重试
      if ((e as Error)?.name === "AbortError") throw e;
      // 已经是 HTTP 非重试错误也直接抛
      if (e instanceof Error && /^HTTP \d{3}: /.test(e.message)) throw e;
      lastErr = e;
      const wait = 2_000 * Math.pow(2, attempt);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw new Error(`请求多次失败: ${url} — ${String(lastErr)}`);
}

// 把 AbortSignal 合并进 RequestInit
function withSignal(init: RequestInit, signal?: AbortSignal): RequestInit {
  return signal ? { ...init, signal } : init;
}

// 让 setTimeout 能响应 abort，避免轮询期间无法取消
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

// -------------------------- chat --------------------------

export async function chat(
  client: ApiClient,
  model: string,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(`${client.baseUrl}/chat/completions`, withSignal({
    method: "POST",
    headers: authHeaders(client.apiKey),
    body: JSON.stringify({ model, messages, stream: false }),
  }, signal));
  const j = await r.json();
  return j.choices[0].message.content as string;
}

// ------------------------ 异步任务 ------------------------

interface TaskOutput {
  task_status?: string;
  results?: Array<{ url: string }>;
  video_url?: string;
  [k: string]: unknown;
}

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
    const r = await requestWithRetry(`${client.baseUrl}/tasks/${taskId}`, withSignal({
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

// ------------------------ 文生图 (异步) ------------------------

export async function submitImage(
  client: ApiClient,
  model: string,
  prompt: string,
  size = "1280*720",
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(`${client.baseUrl}/images/generations`, withSignal({
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

export async function waitImage(
  client: ApiClient,
  taskId: string,
  signal?: AbortSignal,
): Promise<string> {
  const out = await pollTask(client, taskId, 3_000, 300_000, `image#${taskId}`, signal);
  return (out.results?.[0]?.url ?? "") as string;
}

// ------------------------ 图生视频 (异步) ------------------------

export async function submitVideo(
  client: ApiClient,
  model: string,
  prompt: string,
  imageUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(`${client.baseUrl}/videos/generations`, withSignal({
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

export async function waitVideo(
  client: ApiClient,
  taskId: string,
  signal?: AbortSignal,
): Promise<string> {
  const out = await pollTask(client, taskId, 10_000, 600_000, `video#${taskId}`, signal);
  return (out.video_url ?? "") as string;
}

// ------------------------ TTS (同步) ------------------------

export async function tts(
  client: ApiClient,
  model: string,
  text: string,
  voice = "Cherry",
  signal?: AbortSignal,
): Promise<string> {
  const r = await requestWithRetry(`${client.baseUrl}/audio/speech`, withSignal({
    method: "POST",
    headers: authHeaders(client.apiKey),
    body: JSON.stringify({
      model,
      input: text,
      voice,
    }),
  }, signal));
  const j = await r.json();
  return j.output.audio.url as string;
}
