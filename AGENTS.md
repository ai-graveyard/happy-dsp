# happy-dsp · Agent 指南

一句话生成 ~25 秒短视频的 Next.js 应用。流水线：主题 → 分镜 JSON → 关键帧 → i2v 视频 → TTS 旁白 → ffmpeg 合成 mp4。详细产品说明见 [README.md](README.md)。

## 技术栈

- **Next.js 16.2.6** App Router + `output: "standalone"`（破坏性变更，见下方规则）
- **React 19.2** / **TypeScript 6**（strict）
- **Tailwind v4**（PostCSS plugin）+ Radix UI primitives + `cn()` from `clsx + tailwind-merge`
- **pnpm 11.3.0** （`packageManager` 字段已锁，corepack 自动取对的版本）
- **Node ≥ 22**
- 服务端：`ffmpeg-static` 调 ffmpeg 合成；SSE 流式回推进度

## 常用命令

```bash
pnpm dev     # next dev
pnpm build   # next build（standalone 输出）
pnpm start   # next start
pnpm lint    # eslint（flat config）
```

无单测；改动用 `pnpm build` + `pnpm lint` 把关，UI 改动手动跑 `pnpm dev` 验证。

## 目录结构

```
app/
├── page.tsx                  # 主页（输入 + 实时进度 + 成片）
├── layout.tsx / globals.css
└── api/
    ├── generate/route.ts     # SSE 流式 pipeline 入口
    └── merge/route.ts        # ffmpeg 合成
components/
├── SceneCard / ProgressStrip / SettingsPanel / HistoryDrawer
└── ui/                       # 基础组件（shadcn 风格，本地维护）
lib/
├── types.ts                  # 共享类型 + 默认设置 + ProviderMeta
├── prompts.ts                # 分镜师 system prompt
├── server-api.ts             # provider 调用封装（chat / 异步图 / 异步视频 / TTS）
├── pipeline.ts               # 主编排（发 GenerateEvent）
├── storage.ts                # localStorage / IndexedDB 工具
└── utils.ts                  # cn() 等
```

路径别名：`@/*` → 仓库根目录。

## 关键约定

- **Provider 抽象**：端点只在 `dashscope`（百炼官方）和 `aliyun-edu`（教育版 model-router）两个预设里选，URL 不开放给用户自填。两边协议不同（DashScope 走 `/services/aigc/*` + `X-DashScope-Async`；EDU 走 `/chat/completions` 等 + `X-MR-Async`），新增模型调用时先看 `lib/server-api.ts` 里现有的 provider 分发，不要绕过。
- **流水线事件**：所有进度通过 `GenerateEvent` 联合类型推回前端（见 [lib/types.ts](lib/types.ts)）。新增阶段要同步加事件类型 + `ProgressStrip` / `SceneCard` 渲染。
- **API Key**：用户 key 只存浏览器 localStorage；服务端只在用户没传时回退到 `SHARED_MR_KEY` 环境变量。绝不要把 key 写日志、写文件或回显到响应里。
- **历史缓存**：元数据 → localStorage（最多 20 条）；成片 mp4 → IndexedDB。修改 schema 要兼容老数据（参考 `lib/storage.ts` 的迁移逻辑）。
- **`ffmpeg-static`**：必须留在 `next.config.ts` 的 `serverExternalPackages` 里，否则 Turbopack 会把 `__dirname` 内联成 `/ROOT/...`，运行时找不到二进制。
- **Vercel 部署**：长任务（图/视频生成）需要 Pro plan + fluid compute；Hobby 60s 不够。改动 API route 时注意别引入新的同步阻塞。

## 编码风格

- TypeScript strict 全开，避免 `any`；共享类型集中在 `lib/types.ts`。
- 中文注释 OK（仓库里很多），但接口名 / 函数名用英文。
- 服务端代码注意：API route 默认在 Node runtime（用到 ffmpeg / `fs`），不要随手加 `export const runtime = "edge"`。
- 提交信息保持现有风格（短句、英文为主、可含中文），不需要 conventional commits 前缀。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
