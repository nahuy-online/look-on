import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft, ThumbsUp, ThumbsDown, Download, ListVideo, Share2, Gauge,
  Loader2, Shield, Eye, Clock, Hash, Check, Play, Pause,
} from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useLibraryStore } from "@/store/use-library-store";
import { useQueueStore } from "@/store/use-queue-store";
import { fetchRelated } from "@/lib/invidious";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { VideoItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PlayerView } from "@/components/PlayerView";

// Speed control — ExoPlayer supports up to 3.0× via `setPlaybackParameters`.
// (The Obereg IFrame path capped at 2.0× because YouTube's IFrame API
// doesn't allow higher; ExoPlayer has no such limit.)
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

// Tauri command prefix for the player plugin. All ExoPlayer commands are
// dispatched through this prefix; the attestation command lives in the same
// plugin. The `yt_extract` command lives at the app level (no prefix) — see
// `src-tauri/src/lib.rs`.
// Player bridge is accessed via window.lookonPlayer (registered by MainActivity)

// Stream HTTP headers — YouTube's googlevideo URLs are bound to the client
// that requested them. Sending a browser-like UA + the YouTube Referer/Origin
// keeps the CDN from returning 403.
const STREAM_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  Referer: "https://www.youtube.com/",
  Origin: "https://www.youtube.com",
  "Accept-Language": "en-US,en;q=0.9",
};

// Tagged-union shape of the `yt_extract` response (see
// `src-tauri/src/youtube/extract.rs` for the Rust definition).
interface StreamFormat {
  itag: number;
  mimeType: string;
  url: string;
  qualityLabel?: string;
  bitrate: number;
  hasAudio: boolean;
  hasVideo: boolean;
}
type ExtractOutcome =
  | { status: "success"; format: StreamFormat; total: number }
  | { status: "separate_streams"; video: StreamFormat; audio: StreamFormat; total: number }
  | { status: "no_muxed_stream"; adaptive: number }
  | { status: "refused"; reason: string }
  | { status: "malformed"; reason: string };

// Deterministic comment generator
const COMMENT_AUTHORS = [
  "Alex Rivera", "Jamie Chen", "Sam Okafor", "Priya Nair", "Marco Rossi",
  "Yuki Tanaka", "Emma Schmidt", "Liam Walsh", "Noor Haddad", "Sofia Garcia",
];
const COMMENT_TEMPLATES = [
  "This hits different at 2am",
  "No ads with Look On — amazing!",
  "Who's here in 2026? Still a masterpiece.",
  "The quality is insane. Thank you!",
  "Can't believe this is free with no ads.",
  "Played this on loop all day",
  "Background play while working = productivity unlocked.",
  "Downloaded for my flight. Offline mode is a lifesaver",
  "The algorithm finally did something right.",
  "This deserves way more views.",
  "My whole playlist is just this on repeat lol",
  "VPN + ad-free = the only way to watch.",
  "0:47 is my favorite part, anyone else?",
  "This deserves way more views. Sharing with everyone.",
];

function seededRand(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function generateComments(videoId: string) {
  const rand = seededRand(videoId + "comments");
  const count = 6 + Math.floor(rand() * 5);
  const out = [];
  for (let i = 0; i < count; i++) {
    const author = COMMENT_AUTHORS[Math.floor(rand() * COMMENT_AUTHORS.length)];
    const text = COMMENT_TEMPLATES[Math.floor(rand() * COMMENT_TEMPLATES.length)];
    const mins = Math.floor(rand() * 59);
    const hrs = Math.floor(rand() * 23);
    const days = Math.floor(rand() * 30);
    const timeAgo = days > 0 ? `${days}d` : hrs > 0 ? `${hrs}h` : `${mins}m`;
    out.push({ author, text, likes: Math.floor(rand() * 4200), timeAgo, avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(author)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff` });
  }
  return out;
}

// Curated fallback for related videos (unique IDs only)
const CURATED_RELATED: VideoItem[] = [
  { id: "dQw4w9WgXcQ", youtubeId: "dQw4w9WgXcQ", title: "Rick Astley - Never Gonna Give You Up", channel: "Rick Astley", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: 213, views: 1540000000, likes: 17800000, publishedAt: "2009-10-25T06:57:33Z", category: "Music", description: "" },
  { id: "9bZkp7q19f0", youtubeId: "9bZkp7q19f0", title: "PSY - GANGNAM STYLE", channel: "officialpsy", thumbnail: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg", duration: 252, views: 5030000000, likes: 28900000, publishedAt: "2012-07-15T07:14:09Z", category: "Music", description: "" },
  { id: "kJQP7kiw5Fk", youtubeId: "kJQP7kiw5Fk", title: "Luis Fonsi - Despacito ft. Daddy Yankee", channel: "LuisFonsiVEVO", thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", duration: 282, views: 8600000000, likes: 52000000, publishedAt: "2017-01-12T21:00:10Z", category: "Music", description: "" },
  { id: "OPf0YbXqDm0", youtubeId: "OPf0YbXqDm0", title: "Mark Ronson - Uptown Funk ft. Bruno Mars", channel: "Mark Ronson", thumbnail: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg", duration: 270, views: 5200000000, likes: 26000000, publishedAt: "2014-11-19T05:00:00Z", category: "Music", description: "" },
  { id: "JGwWNGJdvx8", youtubeId: "JGwWNGJdvx8", title: "Ed Sheeran - Shape of You", channel: "Ed Sheeran", thumbnail: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg", duration: 234, views: 6200000000, likes: 32000000, publishedAt: "2017-01-30T05:00:00Z", category: "Music", description: "" },
  { id: "RgKAFK5djSk", youtubeId: "RgKAFK5djSk", title: "Wiz Khalifa - See You Again ft. Charlie Puth", channel: "Wiz Khalifa", thumbnail: "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg", duration: 239, views: 6400000000, likes: 39000000, publishedAt: "2015-04-06T04:00:00Z", category: "Music", description: "" },
  { id: "60ItHLz5WEA", youtubeId: "60ItHLz5WEA", title: "Alan Walker - Faded", channel: "Alan Walker", thumbnail: "https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg", duration: 212, views: 3900000000, likes: 35000000, publishedAt: "2015-12-03T05:00:00Z", category: "Music", description: "" },
  { id: "fJ9rUzIMcZQ", youtubeId: "fJ9rUzIMcZQ", title: "Queen – Bohemian Rhapsody", channel: "Queen Official", thumbnail: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg", duration: 354, views: 1800000000, likes: 16000000, publishedAt: "2008-08-01T06:00:07Z", category: "Music", description: "" },
];

export function WatchView() {
  const video = useAppStore((s) => s.activeVideo);
  const goHome = useAppStore((s) => s.goHome);
  const watch = useAppStore((s) => s.watch);
  const liked = useLibraryStore((s) => s.liked);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const addDownload = useLibraryStore((s) => s.addDownload);
  const addHistory = useLibraryStore((s) => s.addHistory);
  const addToQueue = useQueueStore((s) => s.addToQueue);

  const [related, setRelated] = useState<VideoItem[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [descOpen, setDescOpen] = useState(false);

  // Player state
  const [playerReady, setPlayerReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // Refs to keep the polling interval + current speed in sync without
  // re-running the load effect.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef(speed);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Record history on video change
  useEffect(() => {
    if (video) {
      void addHistory(video);
      window.scrollTo(0, 0);
    }
  }, [video, addHistory]);

  // Related videos (with fallback to curated)
  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) setRelatedLoading(true); });
    (async () => {
      const r = await fetchRelated(video.youtubeId, video.category);
      if (cancelled) return;
      if (r.length > 0) {
        setRelated(r);
      } else {
        setRelated(CURATED_RELATED.filter((v) => v.youtubeId !== video.youtubeId));
      }
      setRelatedLoading(false);
    })();
    return () => { cancelled = true; };
  }, [video]);

  // ---------- ExoPlayer load path (replaces the YouTube IFrame API) ----------
  //
  // On video change:
  //   1. attestation_get_token(videoId) — hidden WebView extracts the YouTube
  //      INNERTUBE_API_KEY + VISITOR_DATA (+ optional PO token).
  //   2. yt_extract(youtubeId, poToken) — Rust core fetches the YouTube player
  //      response and extracts a muxed stream URL (or separate video+audio).
  //   3. player_load(url, headers, audioUrl?) — hands the URL(s) to ExoPlayer.
  //   4. player_play() — **THE FIX**: calls `setPlayWhenReady(true)` directly
  //      via JNI. No JavaScript in the play/pause path.
  //
  // The `attestation_get_token` call is best-effort — if it fails (e.g. on
  // desktop), we pass `poToken: null` and the Rust `yt_extract` falls back to
  // the VISIONOS client profile which works without a PO token.

  const loadVideoIntoExo = useCallback(async (youtubeId: string) => {
    setLoading(true);
    setPlayerError(null);
    setPositionMs(0);
    setDurationMs(0);
    try {
      // 0. Init ExoPlayer via JS bridge (window.lookonPlayer registered by MainActivity)
      const bridge = (window as any).lookonPlayer;
      if (!bridge) {
        throw new Error("Player bridge not available (window.lookonPlayer not found)");
      }
      bridge.init();

      // 1. Attestation (best-effort)
      let poToken: string | null = null;
      try {
        const attJson = bridge.getToken(youtubeId);
        const att = JSON.parse(attJson);
        poToken = att.poToken || null;
      } catch (e) {
        console.warn("attestation failed (non-fatal):", e);
      }

      // 2. Extract stream URLs via the Rust core
      const outcome = await invoke<ExtractOutcome>("yt_extract", {
        youtubeId,
        poToken,
      });

      let url: string | null = null;
      let audioUrl: string | null = null;
      if (outcome.status === "success") {
        url = outcome.format.url;
      } else if (outcome.status === "separate_streams") {
        url = outcome.video.url;
        audioUrl = outcome.audio.url;
      } else if (outcome.status === "no_muxed_stream") {
        throw new Error(`No muxed stream available (${outcome.adaptive} adaptive only)`);
      } else if (outcome.status === "refused") {
        throw new Error(`YouTube refused: ${outcome.reason}`);
      } else {
        throw new Error(`Malformed response: ${(outcome as { reason: string }).reason}`);
      }
      if (!url) throw new Error("no stream URL resolved");

      // 3. Load into ExoPlayer via JS bridge
      const loadResult = JSON.parse(bridge.load(JSON.stringify({
        url,
        headers: STREAM_HEADERS,
        audioUrl: audioUrl ?? null,
      })));
      if (!loadResult.ok) throw new Error(loadResult.error || "load failed");

      // 4. Start playback + restore speed
      bridge.setSpeed(speedRef.current);
      bridge.play();
      setIsPlaying(true);
      setPlayerReady(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("ExoPlayer load failed:", msg);
      setPlayerError(msg);
      setPlayerReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the active video changes
  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    setPlayerReady(false);
    (async () => {
      if (!cancelled) await loadVideoIntoExo(video.youtubeId);
    })();
    return () => { cancelled = true; };
  }, [video?.youtubeId, loadVideoIntoExo]);

  // ---------- position polling ----------
  //
  // Every 500 ms we ask ExoPlayer for its current position + duration so the
  // seek bar tracks playback. This is a single round-trip JNI call → very
  // cheap. The interval is cleared when the component unmounts.

  useEffect(() => {
    if (!playerReady) return;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      try {
        const bridge = (window as any).lookonPlayer;
        if (!bridge) return;
        const pos = bridge.getPosition();
        const dur = bridge.getDuration();
        setPositionMs(pos);
        setDurationMs(dur);
      } catch {
        /* player may have been released */
      }
    }, 500);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [playerReady]);

  // ---------- controls ----------

  const applySpeed = (s: number) => {
    setSpeed(s);
    try { (window as any).lookonPlayer?.setSpeed(s); } catch {}
    toast.success(`Speed: ${s}×`, { duration: 1000 });
  };

  const togglePlay = () => {
    try {
      const bridge = (window as any).lookonPlayer;
      if (!bridge) return;
      if (isPlaying) {
        bridge.pause(); // THE FIX: setPlayWhenReady(false) — synchronous, reliable
        setIsPlaying(false);
      } else {
        bridge.play(); // THE FIX: setPlayWhenReady(true)
        setIsPlaying(true);
      }
    } catch (e) {
      toast.error(`Playback control failed: ${String(e)}`);
    }
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const target = Math.max(0, Math.min(1, ratio)) * durationMs;
    try {
      (window as any).lookonPlayer?.seekTo(Math.round(target));
      setPositionMs(target);
    } catch {}
  };

  // ---------- early returns ----------

  if (!video) {
    return (
      <div className="p-6">
        <button onClick={goHome} className="text-sm text-emerald-400">← Back</button>
        <p className="mt-4 text-muted-foreground">No video selected.</p>
      </div>
    );
  }

  const isLiked = !!liked[video.youtubeId];
  const comments = generateComments(video.youtubeId);
  const channelAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(video.channel)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`;

  const handleDownload = async () => {
    const sizeMb = Math.max(8, Math.round((video.duration * 3_000_000) / 8 / 1_000_000));
    await addDownload(video, "1080p", sizeMb);
    toast.success("Download queued");
  };

  const handleShare = async () => {
    const url = `https://youtu.be/${video.youtubeId}`;
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch {}
  };

  const handleQueue = () => {
    addToQueue(video);
    toast.success("Added to queue");
  };

  const progressPct = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      <button onClick={goHome} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          {/* Player — native ExoPlayer overlay (THE FIX) */}
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
            <PlayerView
              className="absolute inset-0 w-full h-full"
              onReady={() => setPlayerReady(true)}
              onError={(e) => setPlayerError(e)}
            />
            {/* Loading spinner */}
            {(loading || !playerReady) && !playerError && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none bg-black/60">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                {loading ? "Fetching stream…" : "Loading player…"}
              </div>
            )}
            {/* Error overlay */}
            {playerError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 bg-black/80 pointer-events-auto">
                <p className="text-sm text-red-400 mb-2">Playback failed</p>
                <p className="text-xs text-muted-foreground mb-3 max-w-md">{playerError}</p>
                <button
                  onClick={() => void loadVideoIntoExo(video.youtubeId)}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500"
                >
                  Retry
                </button>
              </div>
            )}
            {/* Play/pause button (centered) — THE FIX: drives setPlayWhenReady directly */}
            {playerReady && !loading && !playerError && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center group"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                <span className={cn(
                  "h-14 w-14 rounded-full bg-black/60 flex items-center justify-center transition-opacity",
                  isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                )}>
                  {isPlaying ? <Pause className="h-6 w-6 text-white" /> : <Play className="h-6 w-6 text-white ml-0.5" />}
                </span>
              </button>
            )}
            {/* Ad-free badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-semibold px-2 py-1 rounded-md pointer-events-none z-10">
              <Shield className="h-3 w-3" /> Ad-free · ExoPlayer
            </div>
            {speed !== 1 && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-purple-600 text-white text-[10px] font-semibold px-2 py-1 rounded-md pointer-events-none z-10">
                <Gauge className="h-3 w-3" /> {speed}×
              </div>
            )}
            {/* Seek bar */}
            {playerReady && durationMs > 0 && (
              <div
                onClick={onSeek}
                className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 cursor-pointer z-10"
              >
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Time + speed bar */}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono shrink-0">
              {formatDuration(Math.floor(positionMs / 1000))} / {formatDuration(Math.floor(durationMs / 1000))}
            </span>
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin flex-1">
              <Gauge className="h-4 w-4 shrink-0" />
              <span className="shrink-0">Speed</span>
              <div className="flex gap-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void applySpeed(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium shrink-0",
                      s === speed ? "bg-emerald-600 text-white" : "bg-[rgb(var(--secondary))] hover:bg-accent"
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          <h1 className="mt-3 text-base md:text-lg font-bold leading-tight">{video.title}</h1>

          {/* Action bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[rgb(var(--secondary))] rounded-full h-9 overflow-hidden">
              <button
                onClick={() => void toggleLike(video)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 h-full text-sm font-medium hover:bg-accent transition",
                  isLiked && "text-emerald-400"
                )}
              >
                <ThumbsUp className={cn("h-4 w-4", isLiked && "fill-current")} /> {formatViews(video.likes)}
              </button>
              <div className="w-px h-5 bg-border" />
              <button className="flex items-center px-3.5 h-full text-sm hover:bg-accent">
                <ThumbsDown className="h-4 w-4" />
              </button>
            </div>
            <button onClick={() => void handleDownload()} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border border-border hover:bg-accent">
              <Download className="h-4 w-4" /> Download
            </button>
            <button onClick={handleQueue} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border border-border hover:bg-accent">
              <ListVideo className="h-4 w-4" /> Queue
            </button>
            <button onClick={handleShare} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border border-border hover:bg-accent">
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>

          {/* Channel + stats */}
          <div className="mt-3 rounded-lg bg-[rgb(var(--card))] border border-border p-3 text-sm">
            <div className="flex items-center gap-3 mb-2">
              <img src={channelAvatar} alt={video.channel} className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm flex items-center gap-1">
                  {video.channel}
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="text-xs text-muted-foreground">{formatViews(Math.floor(video.views * 0.4))} subscribers</div>
              </div>
              <button className="bg-foreground text-background rounded-full px-4 h-8 text-xs font-semibold">
                Subscribe
              </button>
            </div>
            <div className="flex items-center gap-4 flex-wrap text-xs font-medium text-muted-foreground border-t border-border pt-2">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {formatViews(video.views)} views</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeAgo(video.publishedAt)}</span>
              <span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" /> {video.category}</span>
              <span className="flex items-center gap-1 text-emerald-400"><Shield className="h-3.5 w-3.5" /> Ad-free</span>
            </div>
            {video.description && (
              <p className={cn("text-muted-foreground whitespace-pre-line mt-2", !descOpen && "line-clamp-2")}>
                {video.description}
              </p>
            )}
            {video.description && (
              <button onClick={() => setDescOpen((v) => !v)} className="text-xs font-semibold mt-1 hover:underline">
                {descOpen ? "Show less" : "Show more"}
              </button>
            )}
          </div>

          {/* Comments */}
          <div className="mt-5">
            <h3 className="font-semibold text-sm mb-3">{comments.length} Comments</h3>
            <div className="space-y-3">
              {comments.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <img src={c.avatar} alt={c.author} className="h-9 w-9 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold mr-2">@{c.author.toLowerCase().replace(/\s/g, "")}</span>
                    <span className="text-xs text-muted-foreground">{c.timeAgo} ago</span>
                    <p className="text-sm mt-0.5">{c.text}</p>
                    <div className="flex items-center gap-3 mt-1 text-muted-foreground">
                      <button className="flex items-center gap-1 text-xs hover:text-foreground">
                        <ThumbsUp className="h-3.5 w-3.5" /> {formatViews(c.likes)}
                      </button>
                      <button className="text-xs font-medium hover:text-foreground">Reply</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Related column */}
        <aside className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Up next</h3>
          {relatedLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
          {related.map((r) => (
            <button
              key={r.youtubeId}
              onClick={() => watch(r)}
              className="flex gap-2 text-left w-full hover:bg-accent/60 rounded-lg p-1.5"
            >
              <div className="relative w-40 aspect-video shrink-0 rounded overflow-hidden bg-black/40">
                <img src={r.thumbnail} alt={r.title} loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 text-white text-[10px] px-1">
                  {formatDuration(r.duration)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="line-clamp-2 text-xs font-semibold leading-tight">{r.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{r.channel}</div>
                <div className="text-[11px] text-muted-foreground">{formatViews(r.views)} views</div>
              </div>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
