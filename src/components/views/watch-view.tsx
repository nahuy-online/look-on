"use client";

import * as React from "react";
import {
  ThumbsUp, ThumbsDown, Download, Share2, ListPlus, Check, ChevronDown,
  ShieldCheck, Eye, Clock, Hash,
} from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useLibraryStore } from "@/store/use-library-store";
import { useApi } from "@/hooks/use-api";
import { VideoPlayer } from "@/components/player/video-player";
import { VideoCard } from "@/components/video-card";
import { DownloadDialog } from "@/components/download-dialog";
import { generateComments } from "@/lib/comments";
import { formatViews, timeAgo, formatDuration } from "@/lib/format";
import type { VideoItem } from "@/lib/types";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function WatchView() {
  const video = useAppStore((s) => s.activeVideo);
  const goHome = useAppStore((s) => s.goHome);
  const setView = useAppStore((s) => s.setView);
  const isLiked = useLibraryStore((s) => s.isLiked);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const playlists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const [dlOpen, setDlOpen] = React.useState(false);
  const [descOpen, setDescOpen] = React.useState(false);

  // record history
  const recordHistory = React.useCallback(
    (progress: number) => {
      if (!video) return;
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...video, progress }),
      }).catch(() => {});
    },
    [video]
  );
  React.useEffect(() => {
    if (video) recordHistory(0);
    window.scrollTo({ top: 0 });
  }, [video, recordHistory]);

  const relatedUrl = video ? `/api/related?youtubeId=${video.youtubeId}&title=${encodeURIComponent(video.title)}&category=${video.category}` : null;
  const { data: related } = useApi<{ items: VideoItem[] }>(relatedUrl, [video?.youtubeId]);
  const comments = React.useMemo(() => (video ? generateComments(video.youtubeId) : []), [video]);

  if (!video) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center px-4">
        <p className="text-muted-foreground">No video selected.</p>
        <Button onClick={goHome} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white">Back to home</Button>
      </div>
    );
  }

  const liked = isLiked(video.youtubeId);

  const handleShare = async () => {
    const url = `https://www.youtube.com/watch?v=${video.youtubeId}`;
    try {
      if (navigator.share) await navigator.share({ title: video.title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied to clipboard"); }
    } catch {}
  };

  const saveToPlaylist = async (playlistId: string) => {
    await addToPlaylist(playlistId, video);
    toast.success("Added to playlist");
  };
  const newPlaylist = async () => {
    const p = await createPlaylist("My Playlist " + (playlists.length + 1));
    if (p) { await addToPlaylist(p.id, video); toast.success("Created playlist & added video"); }
  };

  return (
    <div className="px-3 sm:px-6 py-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <VideoPlayer
            youtubeId={video.youtubeId}
            title={video.title}
            onProgress={recordHistory}
          />

          <h1 className="text-lg sm:text-xl font-bold mt-3 leading-snug">{video.title}</h1>

          {/* channel + actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div className="flex items-center gap-3">
              <img
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(video.channel)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`}
                alt={video.channel}
                className="h-10 w-10 rounded-full bg-muted"
              />
              <div>
                <div className="font-semibold text-sm flex items-center gap-1">
                  {video.channel}
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="text-xs text-muted-foreground">{formatViews(Math.floor(video.views * 0.4))} subscribers</div>
              </div>
              <Button
                size="sm"
                className="ml-2 bg-foreground text-background hover:bg-foreground/90 rounded-full h-9"
              >
                Subscribe
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-muted rounded-full h-9 overflow-hidden">
                <button
                  onClick={() => { toggleLike(video); toast.success(liked ? "Removed from Liked" : "Added to Liked"); }}
                  className={cn("flex items-center gap-1.5 px-3.5 h-full text-sm font-medium hover:bg-accent transition", liked && "text-emerald-600 dark:text-emerald-400")}
                >
                  <ThumbsUp className={cn("h-4 w-4", liked && "fill-current")} /> {formatViews(video.likes)}
                </button>
                <div className="w-px h-5 bg-border" />
                <button className="flex items-center px-3.5 h-full text-sm hover:bg-accent">
                  <ThumbsDown className="h-4 w-4" />
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-9 gap-1.5 bg-muted border-0 hover:bg-accent"
                onClick={() => setDlOpen(true)}
              >
                <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full h-9 gap-1.5 bg-muted border-0 hover:bg-accent">
                    <ListPlus className="h-4 w-4" /> <span className="hidden sm:inline">Save</span> <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Save to playlist</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {playlists.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">No playlists yet</div>
                  )}
                  {playlists.map((p) => {
                    const has = p.videoIds.includes(video.youtubeId);
                    return (
                      <DropdownMenuItem key={p.id} onClick={() => saveToPlaylist(p.id)}>
                        <span className="flex-1 truncate">{p.name}</span>
                        {has && <Check className="h-4 w-4 text-emerald-500" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={newPlaylist}>
                    <ListPlus className="h-4 w-4 mr-2" /> Create new playlist
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-9 gap-1.5 bg-muted border-0 hover:bg-accent"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Share</span>
              </Button>
            </div>
          </div>

          {/* description */}
          <div className="mt-4 rounded-xl bg-muted/50 p-3 sm:p-4 text-sm">
            <div className="flex items-center gap-4 flex-wrap text-xs font-medium text-muted-foreground mb-2">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {formatViews(video.views)} views</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeAgo(video.publishedAt)}</span>
              <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" /> {video.category}</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> Ad-free</span>
            </div>
            <p className={cn("text-muted-foreground whitespace-pre-line", !descOpen && "line-clamp-2")}>
              {video.description || `${video.title}\n\nStreamed ad-free on PureTuber VPN. ${formatViews(video.views)} views · ${timeAgo(video.publishedAt)}.\n\n#${video.category.toLowerCase()} #puretuber #vpn`}
            </p>
            <button onClick={() => setDescOpen((v) => !v)} className="text-xs font-semibold mt-2 hover:underline">
              {descOpen ? "Show less" : "Show more"}
            </button>
          </div>

          {/* comments */}
          <div className="mt-6">
            <h3 className="font-semibold text-sm mb-3">{comments.length} Comments</h3>
            <div className="flex gap-3 mb-5">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0 flex items-center justify-center text-white font-semibold text-sm">Z</div>
              <input
                placeholder="Add a comment…"
                className="flex-1 bg-transparent border-b border-border focus:border-emerald-500 outline-none py-1.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.target as HTMLInputElement).value) {
                    toast.success("Comment posted");
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <img src={c.avatar} alt={c.author} className="h-9 w-9 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    {c.pinned && <span className="text-[10px] text-muted-foreground mr-2">📌 Pinned</span>}
                    <span className="text-xs font-semibold mr-2">@{c.author.toLowerCase().replace(/\s/g, "")}</span>
                    <span className="text-xs text-muted-foreground">{c.timeAgo} ago</span>
                    <p className="text-sm mt-0.5">{c.text}</p>
                    <div className="flex items-center gap-3 mt-1 text-muted-foreground">
                      <button className="flex items-center gap-1 text-xs hover:text-foreground"><ThumbsUp className="h-3.5 w-3.5" /> {formatViews(c.likes)}</button>
                      <button className="hover:text-foreground"><ThumbsDown className="h-3.5 w-3.5" /></button>
                      <button className="text-xs font-medium hover:text-foreground">Reply</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* related */}
        <aside className="xl:w-[400px] shrink-0">
          <h3 className="font-semibold text-sm mb-3 xl:sticky xl:top-20">Up next</h3>
          <div className="space-y-1">
            {(related?.items ?? []).map((v) => (
              <VideoCard key={v.youtubeId} video={v} variant="compact" />
            ))}
          </div>
        </aside>
      </div>

      <DownloadDialog video={video} open={dlOpen} onOpenChange={setDlOpen} />
    </div>
  );
}
