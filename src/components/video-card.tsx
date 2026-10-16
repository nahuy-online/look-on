"use client";

import * as React from "react";
import { CheckCircle2, MoreVertical, Shield } from "lucide-react";
import type { VideoItem } from "@/lib/types";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import { useAppStore } from "@/store/use-app-store";
import { cn } from "@/lib/utils";

interface VideoCardProps {
  video: VideoItem;
  variant?: "grid" | "list" | "compact";
  onMore?: (v: VideoItem) => void;
  className?: string;
}

export function VideoCard({ video, variant = "grid", onMore, className }: VideoCardProps) {
  const watch = useAppStore((s) => s.watch);
  const channelAvatar = video.channelAvatar ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(video.channel)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`;

  if (variant === "list") {
    return (
      <div
        className={cn("group flex gap-3 cursor-pointer p-2 rounded-xl hover:bg-accent/60 transition-colors", className)}
        onClick={() => watch(video)}
      >
        <div className="relative w-40 sm:w-44 shrink-0 aspect-video rounded-lg overflow-hidden bg-muted">
          <Thumb src={video.thumbnail} alt={video.title} />
          <DurationBadge seconds={video.duration} />
        </div>
        <div className="flex-1 min-w-0 py-1">
          <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">{video.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {video.channel}
            <CheckCircle2 className="h-3 w-3 text-muted-foreground/70" />
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatViews(video.views)} views · {timeAgo(video.publishedAt)}
          </p>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn("group flex gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-accent/60 transition-colors", className)}
        onClick={() => watch(video)}
      >
        <div className="relative w-36 shrink-0 aspect-video rounded-md overflow-hidden bg-muted">
          <Thumb src={video.thumbnail} alt={video.title} />
          <DurationBadge seconds={video.duration} className="text-[10px] px-1 py-0.5" />
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="font-medium text-[13px] leading-snug line-clamp-2 group-hover:text-primary transition-colors">{video.title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{video.channel}</p>
          <p className="text-[11px] text-muted-foreground">{formatViews(video.views)} views</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group cursor-pointer", className)} onClick={() => watch(video)}>
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted shimmer">
        <Thumb src={video.thumbnail} alt={video.title} />
        <DurationBadge seconds={video.duration} />
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-600/90 backdrop-blur text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
          <Shield className="h-3 w-3" /> Ad-free
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>
      <div className="flex gap-3 mt-3">
        <img
          src={channelAvatar}
          alt={video.channel}
          width={36}
          height={36}
          className="h-9 w-9 rounded-full bg-muted shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">{video.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {video.channel}
            <CheckCircle2 className="h-3 w-3 text-muted-foreground/70" />
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatViews(video.views)} views · {timeAgo(video.publishedAt)}
          </p>
        </div>
        {onMore && (
          <button
            onClick={(e) => { e.stopPropagation(); onMore(video); }}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition"
            aria-label="More options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Thumb({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = React.useState(false);
  return (
    <>
      {!loaded && <div className="absolute inset-0 bg-muted" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/placeholder/hqdefault.jpg`;
        }}
        className={cn("w-full h-full object-cover transition-opacity", loaded ? "opacity-100" : "opacity-0")}
      />
    </>
  );
}

function DurationBadge({ seconds, className }: { seconds: number; className?: string }) {
  return (
    <span className={cn("absolute bottom-1.5 right-1.5 bg-black/85 text-white text-xs font-medium px-1.5 py-0.5 rounded", className)}>
      {formatDuration(seconds)}
    </span>
  );
}
