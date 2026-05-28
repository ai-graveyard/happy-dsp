# 短视频工厂 · Web 🎬

一句话生成短视频。基于 Next.js + 通义 Qwen 全模态。

🌐 **在线体验**：<https://dsp.v2ai.org/>

> 输入 *"一只猫侦探在赛博朋克城市寻找走失的金鱼"* → 2-3 分钟后拿到一条 ~25 秒带配音和字幕的 mp4。

## 流水线

```
用户输入主题
    │  qwen3-max（可注入风格预设）
    ▼
分镜 JSON (N 个场景：图像 prompt / 镜头运动 / 旁白)
    │
    ├──→ qwen-image-plus  → 关键帧
    │         │  wan2.5/2.6-flash/2.7-i2v 或 happyhorse-1.0-i2v
    │         ▼
    │      视频片段
    │
    └──→ qwen3-tts-instruct-flash → 旁白 mp3
                                  │
                                  ▼
                            ffmpeg 混音 + 字幕 + 拼接 → final.mp4
```

## 特性

- 🎨 `global_style + main_character` 拼接到每帧，画风/角色一致
- 🎭 10 种风格预设（电影感 / 日漫 / 吉卜力 / 赛博朋克 / 水墨 …）
- ⚡ 图、视频、配音并发；SSE 实时推进度
- 🌐 端点二选一：DashScope（百炼官方） / Aliyun EDU（教育版 model-router）
- 🔑 自带 key 或共享 key，仅存浏览器 localStorage
- 🕘 历史成片缓存到 IndexedDB，可回看 / 重新合成

## 本地开发

需要 Node ≥ 22 和 pnpm（仓库锁定 `pnpm@11.3.0`，corepack 自动用对版本）：

```bash
corepack enable
git clone git@github.com:ai-graveyard/happy-dsp.git
cd happy-dsp
pnpm install
cp .env.example .env    # 可选：填共享 key
pnpm dev
```

打开 <http://localhost:3000>，在设置面板填入 `sk-…` 开始生成。

> `ffmpeg-static` 会自动装跨平台 ffmpeg 二进制，不用单独装。

## 部署

### Vercel

⚠️ 必须 **Pro plan + fluid compute**（单请求最长 ~900s）；Hobby 60s 不够。

### Docker / VPS（推荐）

无 serverless timeout，最稳。仓库自带 [Dockerfile](Dockerfile)（多阶段，~333 MB）：

```bash
docker build -t happy-dsp .
docker run -d -p 3000:3000 --env-file .env happy-dsp
```

`.env` 可选 `SHARED_MR_KEY=sk-xxx`（用户没自带 key 时的回退）。

## 配置

1. 去 [阿里云百炼控制台](https://bailian.console.aliyun.com/?tab=model#/api-key) 创建 key
2. 设置面板里：
   - **API Key**：粘贴 `sk-…`，留空则用 `SHARED_MR_KEY`
   - **API 端点**：DashScope 或 Aliyun EDU（默认 EDU + HappyHorse 1.0 i2v）
   - **模型配置**（折叠，可选）：分别覆盖 分镜文本 / 文生图 / 图生视频 / TTS

> 两个 provider 的模型命名规则不同，切换后自定义字段需自行确认兼容。

## License

MIT
