"use client";

import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { HistoryItem } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: HistoryItem[];
  onLoad: (item: HistoryItem) => void;
  onRemove: (runId: string) => void;
}

export function HistoryDrawer({
  open,
  onOpenChange,
  items,
  onLoad,
  onRemove,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>历史作品 · {items.length}</SheetTitle>
          <SheetDescription className="sr-only">
            最近 20 条本地保存的生成作品
          </SheetDescription>
        </SheetHeader>

        <div className="h-[calc(100%-3.5rem)] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              还没有作品。生成一个试试。
            </div>
          ) : (
            <div className="p-4 grid gap-3">
              {items.map((it) => {
                const thumb = it.assets.find((a) => a.imageUrl)?.imageUrl;
                return (
                  <div
                    key={it.runId}
                    className="group rounded-md border border-border bg-card overflow-hidden hover:border-foreground/30 transition"
                  >
                    <button
                      onClick={() => onLoad(it)}
                      className="block w-full text-left"
                    >
                      {thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={it.topic}
                          className="w-full aspect-video object-cover"
                        />
                      )}
                      <div className="p-3 space-y-1">
                        <div className="text-sm font-medium text-foreground truncate">
                          {it.storyboard.title || it.topic}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {it.topic}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                          {new Date(it.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </button>
                    <div className="border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemove(it.runId)}
                        className="w-full rounded-none text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
