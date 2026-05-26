"use client";

import type { HistoryItem } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onLoad: (item: HistoryItem) => void;
  onRemove: (runId: string) => void;
}

export function HistoryDrawer({ open, onClose, items, onLoad, onRemove }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">
            历史作品 ({items.length})
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            还没有作品。生成一个试试 ✨
          </div>
        ) : (
          <div className="p-4 grid gap-3">
            {items.map((it) => {
              const thumb = it.assets.find((a) => a.imageUrl)?.imageUrl;
              return (
                <div
                  key={it.runId}
                  className="group rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden hover:border-zinc-700 transition"
                >
                  <div
                    onClick={() => onLoad(it)}
                    className="cursor-pointer"
                  >
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={it.topic}
                        className="w-full aspect-video object-cover"
                      />
                    )}
                    <div className="p-3">
                      <div className="text-sm font-medium text-zinc-100 truncate">
                        {it.storyboard.title || it.topic}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                        {it.topic}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {new Date(it.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(it.runId)}
                    className="w-full px-3 py-1.5 text-xs text-zinc-500 hover:text-red-400 border-t border-zinc-800 transition"
                  >
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
