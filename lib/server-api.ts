// Model Router API 客户端 (server-side only)。
// 端到端处理：chat / 异步图像 / 异步视频 / TTS。
// key 由调用方传入（用户自带 key > 环境变量 SHARED_MR_KEY）。

import "server-only";

const DEFAULT_BASE = "https://model-router.edu-aliyun.com/v1";

function getBaseUrl() {
  return process.env.MR_BASE_URL || DEFAULT_BASE;
}

function authHeaders(apiKey: string, extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}

// 带 429 / 5xx 指数退避的请求。
async function requestWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 5,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const r = await fetch(url, init);
      if ([429, 500, 502, 503, 504].includes(r.status)) {
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
      lastErr = e;
      const wait = 2_000 * Math.pow(2, attempt);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw new Error(`请求多次失败: ${url} — ${String(lastErr)}`);
}

// -------------------------- chat --------------------------

export async function chat(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const r = await requestWithRetry(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model, messages, stream: false }),
  });
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
  apiKey: string,
  taskId: string,
  intervalMs: number,
  timeoutMs = 600_000,
  label = "task",
): Promise<TaskOutput> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await requestWithRetry(`${getBaseUrl()}/tasks/${taskId}`, {
      method: "GET",
      headers: authHeaders(apiKey),
    });
    const j = await r.json();
    const out = (j.output || {}) as TaskOutput;
    if (out.task_status === "SUCCEEDED") return out;
    if (out.task_status === "FAILED") {
      throw new Error(`[${label}] task failed: ${JSON.stringify(out)}`);
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(`[${label}] 超时: ${taskId}`);
}

// ------------------------ 文生图 (异步) ------------------------

export async function submitImage(
  apiKey: string,
  prompt: string,
  size = "1280*720",
): Promise<string> {
  const r = await requestWithRetry(`${getBaseUrl()}/images/generations`, {
    method: "POST",
    headers: authHeaders(apiKey, { "X-MR-Async": "true" }),
    body: JSON.stringify({
      model: "qwen/qwen-image-plus",
      input: { prompt },
      parameters: { size, n: 1, prompt_extend: true },
    }),
  });
  const j = await r.json();
  return j.output.task_id as string;
}

export async function waitImage(apiKey: string, taskId: string): Promise<string> {
  const out = await pollTask(apiKey, taskId, 3_000, 300_000, `image#${taskId}`);
  return (out.results?.[0]?.url ?? "") as string;
}

// ------------------------ 图生视频 (异步) ------------------------

export async function submitVideo(
  apiKey: string,
  model: string,
  prompt: string,
  imageUrl: string,
): Promise<string> {
  const r = await requestWithRetry(`${getBaseUrl()}/videos/generations`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      input: {
        prompt,
        media: [{ type: "first_frame", url: imageUrl }],
      },
    }),
  });
  const j = await r.json();
  return j.output.task_id as string;
}

export async function waitVideo(apiKey: string, taskId: string): Promise<string> {
  const out = await pollTask(apiKey, taskId, 10_000, 600_000, `video#${taskId}`);
  return (out.video_url ?? "") as string;
}

// ------------------------ TTS (同步) ------------------------

export async function tts(
  apiKey: string,
  text: string,
  voice = "Cherry",
): Promise<string> {
  const r = await requestWithRetry(`${getBaseUrl()}/audio/speech`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model: "qwen/qwen3-tts-instruct-flash",
      input: text,
      voice,
    }),
  });
  const j = await r.json();
  return j.output.audio.url as string;
}
