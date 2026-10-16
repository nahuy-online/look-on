"use client";

import * as React from "react";
import { Clock, Trash2, History as HistoryIcon } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useApi } from "@/hooks/use-api";
import { VideoCard } from "@/components/video-card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { VideoItem } from "@/lib/types";

interface HistoryRow {
  id: string; youtubeId: string; title: string; channel: string;
  thumbnail: string; duration: number; category: string; progress: number; watchedAt: string;
}

export function HistoryView() {
  const watch = useAppStore((s) => s.watch);
  const { data, loading, refetch } = useApi<{ items: HistoryRow[] }>("/api/history", []);
  const items = data?.items ?? [];

  const asVideo = (h: HistoryRow): VideoItem => ({
    id: h.youtubeId, youtubeId: h.youtubeId, title: h.title, channel: h.channel,
    thumbnail: h.thumbnail, duration: h.duration, category: h.category as any,
    views: 0, likes: 0, publishedAt: h.watchedAt, description: "",
  });

  const clearAll = async () => {
    await fetch("/api/history?id=all", { method: "DELETE" });
    toast("History cleared");
    refetch();
  };
  const removeOne = async (id: string) => {
    await fetch(`/api/history?id=${id}`, { method: "DELETE" });
    refetch();
  };

  return (
    <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Clock className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">History</h1>
            <p className="text-xs text-muted-foreground">{items.length} videos watched</p>
          </div>
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5" onClick={clearAll}>
            <Trash2 className="h-4 w-4" /> Clear all
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-video rounded-xl bg-muted" />
              <div className="h-3 bg-muted rounded w-3/4 mt-3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center mb-4">
            <HistoryIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium">No watch history yet</p>
          <p className="text-sm text-muted-foreground mt-1">Videos you watch will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
          {items.map((h) => (
            <div key={h.id} className="relative group">
              <VideoCard video={asVideo(h)} />
              {h.progress > 0 && h.progress < h.duration && (
                <div className="absolute bottom-[68px] left-2 right-2 h-1 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${Math.min(100, (h.progress / h.duration) * 100)}%` }} />
                </div>
              )}
              <button
                onClick={() => removeOne(h.id)}
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-black/80"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
