"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink, KeyRound, Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_STORYBOARD_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_SIZES,
  TTS_VOICES,
  VIDEO_MODELS,
  type UserSettings,
} from "@/lib/types";

interface Props {
  settings: UserSettings;
  onChange: (s: UserSettings) => void;
  disabled?: boolean;
}

// 单个模型字段：label + 用途说明 + 默认值占位
interface ModelField {
  key: "storyboardModel" | "imageModel" | "videoModel" | "ttsModel";
  label: string;
  purpose: string;
  defaultValue: string;
}

const MODEL_FIELDS: ModelField[] = [
  {
    key: "storyboardModel",
    label: "分镜（文本生成）",
    purpose: "拆分镜、写旁白",
    defaultValue: DEFAULT_STORYBOARD_MODEL,
  },
  {
    key: "imageModel",
    label: "文生图",
    purpose: "生成每个分镜的关键帧",
    defaultValue: DEFAULT_IMAGE_MODEL,
  },
  {
    key: "videoModel",
    label: "图生视频",
    purpose: "把关键帧动起来",
    defaultValue: DEFAULT_VIDEO_MODEL,
  },
  {
    key: "ttsModel",
    label: "TTS 语音合成",
    purpose: "把旁白读出来",
    defaultValue: DEFAULT_TTS_MODEL,
  },
];

export function SettingsPanel({ settings, onChange, disabled }: Props) {
  const [modelsOpen, setModelsOpen] = useState(false);

  function update<K extends keyof UserSettings>(k: K, v: UserSettings[K]) {
    onChange({ ...settings, [k]: v });
  }

  // 有任何模型字段被用户改过（与默认值不同）时显示"已改"角标
  const overriddenCount = MODEL_FIELDS.reduce((n, f) => {
    const v = (settings[f.key] || "").trim();
    return v && v !== f.defaultValue ? n + 1 : n;
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="apiKey">API Key</Label>
          <div className="relative">
            <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="apiKey"
              type="password"
              value={settings.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="sk-… 留空使用共享 key"
              disabled={disabled}
              className="pl-8 font-mono text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <a
              href="https://bailian.console.aliyun.com/?tab=model#/api-key"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
            >
              阿里云百炼 <ExternalLink className="size-3" />
            </a>
            ，仅存浏览器 localStorage。
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiBaseUrl">API URL</Label>
          <div className="relative">
            <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="apiBaseUrl"
              type="url"
              value={settings.apiBaseUrl}
              onChange={(e) => update("apiBaseUrl", e.target.value)}
              placeholder={`留空使用默认 ${DEFAULT_API_BASE_URL}`}
              disabled={disabled}
              className="pl-8 font-mono text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            需配合自带 API Key 使用，兼容 OpenAI 协议的端点。
          </p>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Label>分镜数</Label>
          <span className="text-sm tabular-nums text-foreground">
            {settings.numScenes}
          </span>
        </div>
        <Slider
          min={3}
          max={10}
          step={1}
          value={[settings.numScenes]}
          onValueChange={([v]) => update("numScenes", v)}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          视频总时长 ≈ {settings.numScenes * settings.secondsPerScene}s
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Label>单镜时长</Label>
          <span className="text-sm tabular-nums text-foreground">
            {settings.secondsPerScene}s
          </span>
        </div>
        <Slider
          min={3}
          max={8}
          step={1}
          value={[settings.secondsPerScene]}
          onValueChange={([v]) => update("secondsPerScene", v)}
          disabled={disabled}
        />
      </section>

      <Separator />

      <section className="space-y-2">
        <Label>TTS 音色</Label>
        <Select
          value={settings.voice}
          onValueChange={(v) => update("voice", v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue>{settings.voice}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TTS_VOICES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-2">
        <Label>画面方向</Label>
        <Select
          value={settings.imageSize}
          onValueChange={(v) => update("imageSize", v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue>
              {IMAGE_SIZES.find((s) => s.id === settings.imageSize)?.label ??
                settings.imageSize}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {IMAGE_SIZES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <Separator />

      {/* 模型配置 —— 默认折叠 */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setModelsOpen((o) => !o)}
          aria-expanded={modelsOpen}
          aria-controls="model-config"
          className="w-full flex items-center gap-2 text-left group"
        >
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              modelsOpen && "rotate-90",
            )}
          />
          <span className="text-sm font-medium">模型配置</span>
          {overriddenCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm border border-border text-muted-foreground tabular-nums">
              {overriddenCount} 项已改
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {modelsOpen ? "收起" : "展开"}
          </span>
        </button>

        {modelsOpen && (
          <div id="model-config" className="space-y-4 pt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              留空即用默认值。需要满足所选 API URL 端点支持。
            </p>

            {MODEL_FIELDS.map((f) => {
              // 图生视频保留 Select（有 curated label）+ 自定义文本输入
              if (f.key === "videoModel") {
                const isPreset = VIDEO_MODELS.some(
                  (m) => m.id === settings.videoModel,
                );
                return (
                  <div key={f.key} className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor={f.key}>{f.label}</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {f.purpose}
                      </span>
                    </div>
                    <Select
                      value={isPreset ? settings.videoModel : "__custom__"}
                      onValueChange={(v) => {
                        if (v === "__custom__") {
                          // 切到自定义但保留当前值（若已是 preset，清空让用户输入）
                          update(
                            "videoModel",
                            isPreset ? "" : settings.videoModel,
                          );
                        } else {
                          update("videoModel", v);
                        }
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {isPreset
                            ? VIDEO_MODELS.find(
                                (m) => m.id === settings.videoModel,
                              )?.label
                            : "自定义…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">自定义…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!isPreset && (
                      <Input
                        id={f.key}
                        value={settings.videoModel}
                        onChange={(e) =>
                          update("videoModel", e.target.value)
                        }
                        placeholder={f.defaultValue}
                        disabled={disabled}
                        className="font-mono text-xs"
                      />
                    )}
                  </div>
                );
              }

              return (
                <div key={f.key} className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {f.purpose}
                    </span>
                  </div>
                  <Input
                    id={f.key}
                    value={settings[f.key]}
                    onChange={(e) => update(f.key, e.target.value)}
                    placeholder={f.defaultValue}
                    disabled={disabled}
                    className="font-mono text-xs"
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
