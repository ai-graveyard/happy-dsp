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
- 🔄 **SSE 实时进度**：每一帧/段视频/段配音一好就推回前端
- 🎚️ **可调参数**：分镜数、单镜时长、横竖屏、TTS 音色、视频模型
- 🔑 **双 Key 模式**：用户可自带 Key（存浏览器 localStorage），或用部署方提供的共享 Key
- 🕘 **localStorage 历史**：最近 20 条作品可一键复看
- 📥 **一键下载**：合成完直接下载 mp4

## 本地开发

```bash
git clone <repo>
cd web
npm install
cp .env.example .env.local        # 可选：填共享 key
npm run dev
```

打开 http://localhost:3000 ，点右上角 ⚙ 设置 → 填入你的 sk-xxx → 开始生成。

> ⚠️ 系统依赖：`ffmpeg-static` 会自动安装跨平台的 ffmpeg 二进制，不需要单独装 ffmpeg。

## 部署

### Vercel

⚠️ **务必使用 Pro plan + fluid compute**（单次请求最长 ~900 秒）。Hobby 计划 60 秒不够视频生成的耗时。

1. Fork 仓库，连接 Vercel
2. （可选）在 Environment Variables 里加 `SHARED_MR_KEY`，给所有访客一个默认 key
3. Deploy

### Docker / VPS（推荐自部署）

无 serverless timeout 限制，最稳：

```bash
npm run build
npm start
```

或自己写一个 Dockerfile（基于 `node:20-alpine`）。

## API Key 怎么搞

1. 去 [阿里云百炼控制台](https://bailian.console.aliyun.com/?tab=model#/api-key) 创建 key
2. 复制粘贴到右上角 ⚙ 设置里
3. Key 仅存在你的浏览器 localStorage，不会上传到任何服务器（除了直接调 ModelRouter）

## 项目结构

```
web/
├── app/
│   ├── page.tsx                    # 主页（输入 + 实时进度 + 成片）
│   ├── layout.tsx
│   └── api/
│       ├── generate/route.ts       # SSE 流式 pipeline
│       └── merge/route.ts          # ffmpeg 合成
├── components/
│   ├── SceneCard.tsx               # 单分镜卡片（进度可视化）
│   ├── SettingsDrawer.tsx
│   └── HistoryDrawer.tsx
├── lib/
│   ├── types.ts                    # 共享 TS 类型 + 默认设置
│   ├── prompts.ts                  # 分镜师 system prompt
│   ├── server-api.ts               # ModelRouter 调用封装 (chat / 异步图 / 异步视频 / TTS)
│   ├── pipeline.ts                 # 主编排（发 GenerateEvent）
│   └── storage.ts                  # localStorage 工具
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
