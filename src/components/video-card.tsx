"use client";

import * as React from "react";
import {
  CheckCircle2, MoreVertical, Shield, ListPlus, Play, Download, Share2, ThumbsUp, Sparkles,
} from "lucide-react";
import type { VideoItem } from "@/lib/types";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import { useAppStore } from "@/store/use-app-store";
import { useQueueStore } from "@/store/use-queue-store";
import { useLibraryStore } from "@/store/use-library-store";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VideoCardProps {
  video: VideoItem;
  variant?: "grid" | "list" | "compact";
  className?: string;
  /** Override the default click (watch) behavior */
  onClick?: (v: VideoItem) => void;
  /** Hide the more menu entirely */
  hideMore?: boolean;
}

export function VideoCard({ video, variant = "grid", className, onClick, hideMore }: VideoCardProps) {
  const watch = useAppStore((s) => s.watch);
  const addToQueue = useQueueStore((s) => s.addToQueue);
  const playNext = useQueueStore((s) => s.playNext);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const isLiked = useLibraryStore((s) => s.isLiked);
  const channelAvatar = video.channelAvatar ?? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(video.channel)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`;

  const handleClick = () => (onClick ? onClick(video) : watch(video));

  const moreMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const MoreButton = hideMore ? null : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={moreMenu}
          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition"
          aria-label="More options"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => { addToQueue(video); toast.success("Added to queue"); }}>
          <ListPlus className="h-4 w-4 mr-2" /> Add to queue
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { playNext(video); toast.success("Playing next"); }}>
          <Play className="h-4 w-4 mr-2" /> Play next
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { toggleLike(video); toast.success(isLiked(video.youtubeId) ? "Removed from Liked" : "Added to Liked"); }}>
          <ThumbsUp className="h-4 w-4 mr-2" /> {isLiked(video.youtubeId) ? "Remove from Liked" : "Add to Liked"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          const url = `https://www.youtube.com/watch?v=${video.youtubeId}`;
          navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"));
        }}>
          <Share2 className="h-4 w-4 mr-2" /> Copy link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (variant === "list") {
    return (
      <div
        className={cn("group flex gap-3 cursor-pointer p-2 rounded-xl hover:bg-accent/60 transition-colors", className)}
        onClick={handleClick}
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
        <div className="flex items-start pt-1">{MoreButton}</div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn("group flex gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-accent/60 transition-colors", className)}
        onClick={handleClick}
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
        <div className="flex items-start pt-0.5 opacity-0 group-hover:opacity-100 transition">{MoreButton}</div>
      </div>
    );
  }

  return (
    <div className={cn("group cursor-pointer", className)} onClick={handleClick}>
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted shimmer">
        <Thumb src={video.thumbnail} alt={video.title} />
        <DurationBadge seconds={video.duration} />
        {video.promoted ? (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow">
            <Sparkles className="h-3 w-3" /> {video.promotedLabel || "Promoted"}
          </div>
        ) : (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-600/90 backdrop-blur text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            <Shield className="h-3 w-3" /> Ad-free
          </div>
        )}
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
        <div className="flex items-start pt-0.5">{MoreButton}</div>
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
