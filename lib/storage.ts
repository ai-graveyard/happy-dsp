// localStorage 工具（仅浏览器侧）
"use client";

import {
  DEFAULT_SETTINGS,
  type HistoryItem,
  type UserSettings,
} from "./types";

const SETTINGS_KEY = "svf:settings:v1";
const HISTORY_KEY = "svf:history:v1";

const settingsListeners = new Set<() => void>();
const historyListeners = new Set<() => void>();

function emit(set: Set<() => void>) {
  set.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SETTINGS_KEY) emit(settingsListeners);
    if (e.key === HISTORY_KEY) emit(historyListeners);
  });
}

// useSyncExternalStore 要求 getSnapshot 在底层数据未变时返回相同引用。
// 这里按 raw 字符串缓存，避免每次都返回新对象触发无限重渲染。
let settingsRaw: string | null | undefined;
let settingsCache: UserSettings = DEFAULT_SETTINGS;

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw === settingsRaw) return settingsCache;
    settingsRaw = raw;
    settingsCache = raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<UserSettings>) }
      : DEFAULT_SETTINGS;
    return settingsCache;
  } catch {
    settingsRaw = null;
    settingsCache = DEFAULT_SETTINGS;
    return settingsCache;
  }
}

export function saveSettings(s: UserSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  // 让缓存失效，下次 loadSettings 重新解析
  settingsRaw = undefined;
  emit(settingsListeners);
}

export function subscribeSettings(cb: () => void): () => void {
  settingsListeners.add(cb);
  return () => {
    settingsListeners.delete(cb);
  };
}

const EMPTY_HISTORY: HistoryItem[] = [];
let historyRaw: string | null | undefined;
let historyCache: HistoryItem[] = EMPTY_HISTORY;

export function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return EMPTY_HISTORY;
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (raw === historyRaw) return historyCache;
    historyRaw = raw;
    if (!raw) {
      historyCache = EMPTY_HISTORY;
      return historyCache;
    }
    const arr = JSON.parse(raw) as HistoryItem[];
    historyCache = Array.isArray(arr) ? arr : EMPTY_HISTORY;
    return historyCache;
  } catch {
    historyRaw = null;
    historyCache = EMPTY_HISTORY;
    return historyCache;
  }
}

export function pushHistory(item: HistoryItem) {
  if (typeof window === "undefined") return;
  const all = loadHistory();
  // 同 runId 去重 + 限制 20 条
  const next = [item, ...all.filter((x) => x.runId !== item.runId)].slice(0, 20);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  historyRaw = undefined;
  emit(historyListeners);
}

export function removeHistory(runId: string) {
  if (typeof window === "undefined") return;
  const all = loadHistory().filter((x) => x.runId !== runId);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  historyRaw = undefined;
  emit(historyListeners);
}

export function subscribeHistory(cb: () => void): () => void {
  historyListeners.add(cb);
  return () => {
    historyListeners.delete(cb);
  };
}
