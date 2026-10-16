import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ThumbsUp,
  Download,
  ListVideo,
  Share2,
  Gauge,
  Loader2,
  AlertTriangle,
  Youtube,
} from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useLibraryStore } from "@/store/use-library-store";
import { fetchRelated } from "@/lib/invidious";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { VideoItem, StreamInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export function WatchView() {
  const video = useAppStore((s) => s.activeVideo);
  const goHome = useAppStore((s) => s.goHome);
  const category = useAppStore((s) => s.activeCategory);
  const watch = useAppStore((s) => s.watch);
  const liked = useLibraryStore((s) => s.liked);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const addDownload = useLibraryStore((s) => s.addDownload);
  const addHistory = useLibraryStore((s) => s.addHistory);

  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [loadingStream, setLoadingStream] = useState(true);
  const [related, setRelated] = useState<VideoItem[]>([]);
  const [speed, setSpeed] = useState(1);
  const [fallbackIframe, setFallbackIframe] = useState(false);
  const videoEl = useRef<HTMLVideoElement>(null);

  // Fetch direct stream URLs for native <video> playback (true ad-free + 3x speed).
  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    // defer state resets to avoid cascading renders in effect body
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadingStream(true);
      setFallbackIframe(false);
      setStream(null);
    });
    (async () => {
      const info = await invoke<StreamInfo | null>("video_streams", {
        youtubeId: video.youtubeId,
      });
      if (cancelled) return;
      setStream(info);
      setLoadingStream(false);
      if (!info || !info.bestStreamUrl) {
        // Fall back to YouTube IFrame (not ad-free, but still plays).
        setFallbackIframe(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [video]);

  // Related videos
  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    (async () => {
      const r = await fetchRelated(video.youtubeId, category);
      if (!cancelled) setRelated(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [video, category]);

  // Apply playback rate when it changes.
  useEffect(() => {
    if (videoEl.current) videoEl.current.playbackRate = speed;
  }, [speed]);

  if (!video) {
    return (
      <div className="p-6">
        <button onClick={goHome} className="text-sm text-emerald-400">
          ← Back
        </button>
        <p className="mt-4 text-muted-foreground">No video selected.</p>
      </div>
    );
  }

  const isLiked = !!liked[video.youtubeId];

  const handleDownload = async () => {
    // Size estimate based on duration and a 1080p bitrate (~3 Mbps).
    const sizeMb = Math.max(8, Math.round((video.duration * 3_000_000) / 8 / 1_000_000));
    await addDownload(video, "1080p", sizeMb);
  };

  const handleShare = async () => {
    const url = `https://youtu.be/${video.youtubeId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <button
        onClick={goHome}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          {/* Player */}
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-border">
            {loadingStream && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Resolving stream…
              </div>
            )}

            {!loadingStream && !fallbackIframe && stream?.bestStreamUrl && (
              <video
                ref={videoEl}
                src={stream.bestStreamUrl}
                controls
                playsInline
                autoPlay
                className="h-full w-full bg-black"
                onLoadedMetadata={(e) => {
                  (e.target as HTMLVideoElement).playbackRate = speed;
                }}
                onError={() => setFallbackIframe(true)}
              >
                Your WebView does not support the video tag.
              </video>
            )}

            {!loadingStream && fallbackIframe && (
              <>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&modestbranding=1&rel=0`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={video.title}
                />
                <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs px-2 py-1">
                  <AlertTriangle className="h-3 w-3" />
                  Fallback IFrame — direct stream unavailable
                </div>
              </>
            )}
          </div>

          {/* Speed bar — 3x max for true ad-free binge */}
          {!fallbackIframe && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Gauge className="h-4 w-4" />
              <span>Speed</span>
              <div className="flex gap-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={cn(
                      "px-2 py-1 rounded-md text-xs font-medium",
                      s === speed
                        ? "bg-emerald-600 text-white"
                        : "bg-[rgb(var(--secondary))] hover:bg-accent"
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <span className="ml-auto text-xs">
                Native player · true ad-free · up to 3×
              </span>
            </div>
          )}

          <h1 className="mt-3 text-lg font-bold leading-tight">{video.title}</h1>

          {/* Action bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void toggleLike(video)}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border",
                isLiked
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-border hover:bg-accent"
              )}
            >
              <ThumbsUp className="h-4 w-4" /> {isLiked ? "Liked" : "Like"}
            </button>
            <button
              onClick={() => void handleDownload()}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border border-border hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Download
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border border-border hover:bg-accent"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              onClick={() => void addHistory(video)}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border border-border hover:bg-accent"
            >
              <ListVideo className="h-4 w-4" /> Save
            </button>
          </div>

          {/* Channel */}
          <div className="mt-3 text-sm">
            <span className="font-semibold">{video.channel}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {formatViews(video.views)} views · {timeAgo(video.publishedAt)}
            </span>
          </div>

          {/* Description */}
          {video.description && (
            <div className="mt-3 rounded-lg bg-[rgb(var(--card))] border border-border p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto scrollbar-thin">
              {video.description}
            </div>
          )}
        </div>

        {/* Related column */}
        <aside className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Related
          </h3>
          {related.length === 0 && (
            <div className="text-xs text-muted-foreground">Loading related…</div>
          )}
          {related.map((r) => (
            <button
              key={r.youtubeId}
              onClick={() => watch(r)}
              className="flex gap-2 text-left w-full hover:bg-accent/60 rounded-lg p-1.5"
            >
              <div className="relative w-40 aspect-video shrink-0 rounded overflow-hidden bg-black/40">
                <img
                  src={r.thumbnail}
                  alt={r.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 text-white text-[10px] px-1">
                  {formatDuration(r.duration)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="line-clamp-2 text-xs font-semibold leading-tight">
                  {r.title}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                  {r.channel}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatViews(r.views)} views
                </div>
              </div>
            </button>
          ))}
        </aside>
      </div>

      {fallbackIframe && (
        <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-[rgb(var(--card))] border border-border rounded-lg p-3">
          <Youtube className="h-4 w-4 mt-0.5 text-red-500" />
          <p>
            Invidious did not return a direct stream URL for this video (some
            instances require signatures, or the video is region-locked). The
            YouTube IFrame is shown as a fallback so you can still watch — but
            it may show ads and won’t honour the 3× speed control. Run your own
            Invidious instance for reliable ad-free playback.
          </p>
        </div>
      )}
    </div>
  );
}
