"use client";

import { useEffect, useState } from "react";
import {
  IMAGE_SIZES,
  TTS_VOICES,
  VIDEO_MODELS,
  type UserSettings,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSave: (s: UserSettings) => void;
}

export function SettingsDrawer({ open, onClose, settings, onSave }: Props) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);

  if (!open) return null;

  function update<K extends keyof UserSettings>(k: K, v: UserSettings[K]) {
    setLocal((s) => ({ ...s, [k]: v }));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">设置</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section>
            <label className="text-sm font-medium text-zinc-200 mb-1.5 block">
              API Key
            </label>
            <input
              type="password"
              value={local.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="sk-xxxxxxxx (留空使用共享 key)"
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-zinc-600"
            />
            <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
              填入你自己的{" "}
              <a
                href="https://bailian.console.aliyun.com/?tab=model#/api-key"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                阿里云百炼 API Key
              </a>
              ，留空则尝试用部署方提供的共享 key（可能不可用或受限）。Key 仅存浏览器
              localStorage，每次请求随单次调用发送。
            </p>
          </section>

          <section>
            <label className="text-sm font-medium text-zinc-200 mb-1.5 block">
              分镜数：<span className="text-emerald-400">{local.numScenes}</span>
            </label>
            <input
              type="range"
              min={3}
              max={10}
              value={local.numScenes}
              onChange={(e) => update("numScenes", parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500"
            />
            <p className="text-xs text-zinc-500 mt-1">
              视频总时长约 = 分镜数 × 单镜时长 ({local.secondsPerScene}s)。越多越烧 Token。
            </p>
          </section>

          <section>
            <label className="text-sm font-medium text-zinc-200 mb-1.5 block">
              单镜时长：<span className="text-emerald-400">{local.secondsPerScene}s</span>
            </label>
            <input
              type="range"
              min={3}
              max={8}
              value={local.secondsPerScene}
              onChange={(e) =>
                update("secondsPerScene", parseInt(e.target.value, 10))
              }
              className="w-full accent-emerald-500"
            />
          </section>

          <section>
            <label className="text-sm font-medium text-zinc-200 mb-1.5 block">
              TTS 音色
            </label>
            <select
              value={local.voice}
              onChange={(e) => update("voice", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-zinc-600"
            >
              {TTS_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </section>

          <section>
            <label className="text-sm font-medium text-zinc-200 mb-1.5 block">
              视频模型
            </label>
            <select
              value={local.videoModel}
              onChange={(e) => update("videoModel", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-zinc-600"
            >
              {VIDEO_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </section>

          <section>
            <label className="text-sm font-medium text-zinc-200 mb-1.5 block">
              画面方向
            </label>
            <select
              value={local.imageSize}
              onChange={(e) => update("imageSize", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-zinc-600"
            >
              {IMAGE_SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </section>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                onSave(local);
                onClose();
              }}
              className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium rounded-lg transition"
            >
              保存
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-900 rounded-lg transition"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
