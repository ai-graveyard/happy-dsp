"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink, KeyRound, Server } from "lucide-react";
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
  IMAGE_SIZES,
  PROVIDERS,
  TTS_VOICES,
  getProviderMeta,
  isProviderId,
  type ProviderMeta,
  type UserSettings,
} from "@/lib/types";

interface Props {
  settings: UserSettings;
  onChange: (s: UserSettings) => void;
  disabled?: boolean;
}

// 模型字段元信息 —— 实际默认值随 provider 走
interface ModelField {
  key: "storyboardModel" | "imageModel" | "videoModel" | "ttsModel";
  label: string;
  purpose: string;
  defaultKey: keyof ProviderMeta["defaults"];
}

const MODEL_FIELDS: ModelField[] = [
  {
    key: "storyboardModel",
    label: "分镜（文本生成）",
    purpose: "拆分镜、写旁白",
    defaultKey: "storyboardModel",
  },
  {
    key: "imageModel",
    label: "文生图",
    purpose: "生成每个分镜的关键帧",
    defaultKey: "imageModel",
  },
  {
    key: "videoModel",
    label: "图生视频",
    purpose: "把关键帧动起来",
    defaultKey: "videoModel",
  },
  {
    key: "ttsModel",
    label: "TTS 语音合成",
    purpose: "把旁白读出来",
    defaultKey: "ttsModel",
  },
];

export function SettingsPanel({ settings, onChange, disabled }: Props) {
  const [modelsOpen, setModelsOpen] = useState(false);
  const provider = getProviderMeta(settings.provider);

  function update<K extends keyof UserSettings>(k: K, v: UserSettings[K]) {
    onChange({ ...settings, [k]: v });
  }

  // 有任何模型字段被填了非空值时显示"已改"角标（与 provider 默认对比）
  const overriddenCount = MODEL_FIELDS.reduce((n, f) => {
    const v = (settings[f.key] || "").trim();
    return v && v !== provider.defaults[f.defaultKey] ? n + 1 : n;
  }, 0);

  return (
    <div className="flex flex-col gap-6">
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
          {!settings.apiKey && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm border border-border text-muted-foreground">
              共享 key
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {modelsOpen ? "收起" : "展开"}
          </span>
        </button>

        {modelsOpen && (
          <div id="model-config" className="space-y-4 pt-1">
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
              <Label htmlFor="provider">API 端点</Label>
              <div className="relative">
                <Server className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground z-10 pointer-events-none" />
                <Select
                  value={
                    isProviderId(settings.provider)
                      ? settings.provider
                      : provider.id
                  }
                  onValueChange={(v) => {
                    if (!isProviderId(v) || v === settings.provider) return;
                    // 切 provider 时清掉所有模型覆盖：不同 provider 模型命名规则不同
                    // （比如 aliyun-edu 用 `qwen/...`，dashscope 用裸名），保留旧值
                    // 会让 DashScope 返回 "Model not exist"。
                    onChange({
                      ...settings,
                      provider: v,
                      storyboardModel: "",
                      imageModel: "",
                      videoModel: "",
                      ttsModel: "",
                    });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id="provider" className="pl-8">
                    <SelectValue>{provider.short}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex flex-col gap-0.5">
                          <span>{p.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {p.baseUrl}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed font-mono">
                {provider.baseUrl}
              </p>
            </div>

            <Separator />

            <p className="text-xs text-muted-foreground leading-relaxed">
              留空 = 用 {provider.short} 的默认模型。命名规则随 provider 不同，
              切换 provider 后留空字段会按对应默认值生效。
            </p>

            {MODEL_FIELDS.map((f) => {
              const defaultValue = provider.defaults[f.defaultKey];

              // 图生视频：保留 curated Select + 自定义文本输入
              if (f.key === "videoModel") {
                const isPreset = provider.videoModels.some(
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
                            ? provider.videoModels.find(
                                (m) => m.id === settings.videoModel,
                              )?.label
                            : "自定义…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {provider.videoModels.map((m) => (
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
                        placeholder={defaultValue}
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
                    placeholder={defaultValue}
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
