import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft, ThumbsUp, ThumbsDown, Download, ListVideo, Share2, Gauge,
  Loader2, Shield, Eye, Clock, Hash, Check,
} from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useLibraryStore } from "@/store/use-library-store";
import { useQueueStore } from "@/store/use-queue-store";
import { fetchRelated } from "@/lib/invidious";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { VideoItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [playerReady, setPlayerReady] = useState(false);

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

  // Load YouTube IFrame API once
  useEffect(() => {
    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }, []);

  // Create/destroy player when video changes
  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) setPlayerReady(false); });

    const createPlayer = () => {
      if (!video || !(window as any).YT?.Player || !playerContainerRef.current) return;
      // Clear previous player
      playerContainerRef.current.innerHTML = "";
      const div = document.createElement("div");
      playerContainerRef.current.appendChild(div);

      playerRef.current = new (window as any).YT.Player(div, {
        videoId: video.youtubeId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: (e: any) => {
            setPlayerReady(true);
            try {
              e.target.setPlaybackRate(speed);
              e.target.playVideo();
            } catch {}
          },
          onStateChange: (e: any) => {
            if (e.data === 0) {
              // Video ended — could auto-play next from queue
            }
          },
        },
      });
    };

    // If YT API is ready, create immediately; otherwise wait
    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      const check = setInterval(() => {
        if ((window as any).YT?.Player) {
          clearInterval(check);
          createPlayer();
        }
      }, 200);
      return () => clearInterval(check);
    }

    return () => {
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
    };
  }, [video?.youtubeId]);

  const applySpeed = (s: number) => {
    setSpeed(s);
    try { playerRef.current?.setPlaybackRate?.(s); } catch {}
    toast.success(`Speed: ${s}×`, { duration: 1000 });
  };

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

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      <button onClick={goHome} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          {/* Player — YouTube IFrame with explicit 100% sizing */}
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
            <div ref={playerContainerRef} className="absolute inset-0 w-full h-full">
              {/* YT.Player will insert iframe here with width=100% height=100% */}
            </div>
            {!playerReady && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none bg-black">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
              </div>
            )}
            {/* Ad-free badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-semibold px-2 py-1 rounded-md pointer-events-none z-10">
              <Shield className="h-3 w-3" /> Ad-free
            </div>
            {speed !== 1 && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-purple-600 text-white text-[10px] font-semibold px-2 py-1 rounded-md pointer-events-none z-10">
                <Gauge className="h-3 w-3" /> {speed}×
              </div>
            )}
          </div>

          {/* Speed bar */}
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto scrollbar-thin">
            <Gauge className="h-4 w-4 shrink-0" />
            <span className="shrink-0">Speed</span>
            <div className="flex gap-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => applySpeed(s)}
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
