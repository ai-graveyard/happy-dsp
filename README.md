# 短视频工厂 · Web 🎬

一句话生成短视频。基于 Next.js + 通义 Qwen 全模态。

> 输入 *"一只猫侦探在赛博朋克城市寻找走失的金鱼"* → 2-3 分钟后拿到一条 ~25 秒带配音和字幕的 mp4。

## 流水线

```
用户输入主题
    │  qwen3-max
    ▼
分镜 JSON (N 个场景，含图像 prompt / 视频运动 / 旁白)
    │
    ├──→ qwen-image-plus  → 关键帧
    │         │  wan2.7-i2v 或 happyhorse-1.0-i2v
    │         ▼
    │      视频片段
    │
    └──→ qwen3-tts-instruct-flash → 旁白 mp3
                                  │
                                  ▼
                            ffmpeg 混音 + 字幕 + 拼接
                                  ▼
                              final.mp4
```

## 功能特色

- 🎨 **画风一致性**：global_style + main_character 自动拼接到每一帧
- ⚡ **全程并发**：图、视频、配音并行生成
- 🔄 **SSE 实时进度**：每一帧/段视频/段配音一好就推回前端；顶部进度条按 关键帧 / 视频 / 配音 三轨展示 X/N，分镜卡片区分"排队 / 生成关键帧 / 生成视频"三态
- 🎚️ **可调参数**：分镜数、单镜时长、横竖屏、TTS 音色
- 🤖 **模型可换**：折叠的"模型配置"区列出每个功能用到的模型（分镜文本 / 文生图 / 图生视频 / TTS），留空即用默认值，兼容 OpenAI 协议
- 🔑 **自带 Key + URL**：用户可自带 API Key 和自定义 API URL（仅存浏览器 localStorage），也可只用部署方提供的共享 Key；安全起见，自定义 URL 必须配合自带 Key
- 🕘 **localStorage 历史**：最近 20 条作品可一键复看
- 📥 **一键下载**：合成完直接下载 mp4

## 本地开发

需要 Node ≥ 22 和 pnpm（仓库已锁定 `pnpm@11.3.0`，启用 corepack 即可自动用对版本）：

```bash
corepack enable                   # 一次性，让 Node 自带的 pnpm 走 packageManager 字段

git clone git@github.com:ai-graveyard/happy-dsp.git
cd happy-dsp
pnpm install
cp .env.example .env              # 可选：填共享 key
pnpm dev
```

打开 http://localhost:3000 ，在桌面左侧设置面板（移动端在右上角 ⚙）填入你的 sk-xxx → 开始生成。如需用其他兼容端点 / 自定义模型，把"API URL"和折叠的"模型配置"展开即可逐项覆盖。

> ⚠️ 系统依赖：`ffmpeg-static` 会自动安装跨平台的 ffmpeg 二进制，不需要单独装 ffmpeg。

## 部署

### Vercel

⚠️ **务必使用 Pro plan + fluid compute**（单次请求最长 ~900 秒）。Hobby 计划 60 秒不够视频生成的耗时。

1. Fork 仓库，连接 Vercel
2. （可选）在 Environment Variables 里加 `SHARED_MR_KEY`，给所有访客一个默认 key
3. Deploy

### Docker / VPS（推荐自部署）

无 serverless timeout 限制，最稳。仓库自带 [Dockerfile](Dockerfile)（Node 22 + pnpm + Next.js standalone，多阶段构建，镜像约 333 MB，运行时用 apt 装的 ffmpeg）：

```bash
docker build -t happy-dsp .
docker run -d --name happy-dsp -p 3000:3000 --env-file .env happy-dsp
```

`.env` 至少需要：

```env
SHARED_MR_KEY=sk-xxxxxxxx                                  # 可选，共享 key（用户没自带 key 时回退到它）
MR_BASE_URL=https://dashscope.aliyuncs.com/api/v1         # 可选，服务端默认 base url（用户没在设置里填自定义 URL 时用）
```

> 用户在 UI 的"设置"里填的 API Key 和 API URL 优先级高于这两个环境变量，按请求覆盖。

或直接 `-e` 传：

```bash
docker run --rm -p 3000:3000 \
  -e SHARED_MR_KEY=sk-xxx \
  -e MR_BASE_URL=https://dashscope.aliyuncs.com/api/v1 \
  happy-dsp
```

不用 Docker 的话，直接：

```bash
pnpm build
pnpm start
```

## API Key / URL / 模型 怎么配

1. 去 [阿里云百炼控制台](https://bailian.console.aliyun.com/?tab=model#/api-key) 创建 key
2. 在右上角 ⚙ 设置（或桌面左侧常驻设置面板）里：
   - **API Key**：粘贴你的 `sk-…`；留空则用部署方的 `SHARED_MR_KEY`
   - **API URL**（可选）：填任意 OpenAI 协议兼容的 base url（如自建网关 / 其他厂商）。⚠️ 出于安全，自定义 URL 必须配合自带 API Key 才生效，避免共享 key 被发到任意端点
   - **模型配置**（可选，默认折叠）：展开后可逐项覆盖 分镜文本 / 文生图 / 图生视频 / TTS 模型；留空回退到默认值。需要所选 API URL 端点支持该模型
3. Key / URL 仅存在浏览器 localStorage，不会上传到任何服务器（除了直接调 API URL 指向的端点）

## 项目结构

```
happy-dsp/
├── app/
│   ├── page.tsx                    # 主页（输入 + 实时进度 + 成片）
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── generate/route.ts       # SSE 流式 pipeline
│       └── merge/route.ts          # ffmpeg 合成
├── components/
│   ├── SceneCard.tsx               # 单分镜卡片（排队/生成关键帧/生成视频 多态）
│   ├── ProgressStrip.tsx           # 全局进度条（拆分镜 / 三轨计数 / 合成）
│   ├── SettingsPanel.tsx           # 设置面板（桌面常驻 / 移动抽屉复用）
│   ├── HistoryDrawer.tsx
│   └── ui/                         # 基础组件（button/input/sheet/...）
├── lib/
│   ├── types.ts                    # 共享 TS 类型 + 默认设置
│   ├── prompts.ts                  # 分镜师 system prompt
│   ├── server-api.ts               # ModelRouter 调用封装 (chat / 异步图 / 异步视频 / TTS)
│   ├── pipeline.ts                 # 主编排（发 GenerateEvent）
│   ├── storage.ts                  # localStorage 工具
│   └── utils.ts                    # cn() 等小工具
└── .env.example
```

## 常见问题

**Q: 卡在某一步很久？**
A: 视频生成是大头，通常 60-120s/段，5 段并发约 2-3 分钟。如果超过 5 分钟没动静，看浏览器 DevTools Network 看下 `/api/generate` 是不是被代理切了连接。

**Q: 报 429？**
A: ModelRouter 限流。`lib/server-api.ts` 已经有指数退避重试 + 1.5s 错开提交，正常情况下能恢复。

**Q: 角色每个分镜长得都不一样？**
A: i2v 模型的局限。我们已经把 `global_style + main_character` 拼到每个 prompt 前缓解。终极方案是用 `wan2.7-r2v`（参考图）模式，TODO。

**Q: 旁白对不齐 5 秒？**
A: prompt 已约束 12-18 字。ffmpeg 给音频补 silence padding 让视频跑满 5 秒。

## License

MIT
