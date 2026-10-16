"use client";

import { VideoCard } from "./video-card";
import type { VideoItem } from "@/lib/types";
import { VideoCardSkeleton } from "./skeletons";

interface VideoGridProps {
  items: VideoItem[];
  loading?: boolean;
  skeletonCount?: number;
  onMore?: (v: VideoItem) => void;
  emptyMessage?: string;
}

export function VideoGrid({ items, loading, skeletonCount = 8, onMore, emptyMessage }: VideoGridProps) {
  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <VideoCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center mb-4">
          <span className="text-2xl">🎬</span>
        </div>
        <p className="text-muted-foreground">{emptyMessage || "No videos found"}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
      {items.map((v) => (
        <VideoCard key={v.youtubeId} video={v} onMore={onMore} />
      ))}
    </div>
  );
}
