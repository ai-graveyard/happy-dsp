// localStorage 工具（仅浏览器侧）
"use client";

import {
  DEFAULT_SETTINGS,
  type HistoryItem,
  type UserSettings,
} from "./types";

const SETTINGS_KEY = "svf:settings:v1";
const HISTORY_KEY = "svf:history:v1";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<UserSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: UserSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function pushHistory(item: HistoryItem) {
  if (typeof window === "undefined") return;
  const all = loadHistory();
  // 同 runId 去重 + 限制 20 条
  const next = [item, ...all.filter((x) => x.runId !== item.runId)].slice(0, 20);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

export function removeHistory(runId: string) {
  if (typeof window === "undefined") return;
  const all = loadHistory().filter((x) => x.runId !== runId);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
}
