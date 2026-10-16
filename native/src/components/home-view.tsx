import { useEffect, useState } from "react";
import { useAppStore } from "@/store/use-app-store";
import { useLibraryStore } from "@/store/use-library-store";
import { fetchTrending, searchVideos } from "@/lib/invidious";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { VideoItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle } from "lucide-react";

export function HomeView({ search = false }: { search?: boolean }) {
  const category = useAppStore((s) => s.activeCategory);
  const query = useAppStore((s) => s.searchQuery);
  const watch = useAppStore((s) => s.watch);
  const addHistory = useLibraryStore((s) => s.addHistory);
  const [items, setItems] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // defer state reset to avoid cascading renders in effect body
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });
    (async () => {
      const result = search
        ? await searchVideos(query)
        : await fetchTrending(category);
      if (cancelled) return;
      setItems(result);
      setError(result.length === 0 ? "No results. Try another instance or category." : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [category, query, search]);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold">
          {search ? `Search: “${query}”` : `Trending ${category !== "All" ? `· ${category}` : ""}`}
        </h1>
        <p className="text-xs text-muted-foreground">
          Data from Invidious via Rust backend · 5-min cache
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading from Invidious…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((v) => (
            <VideoCard
              key={v.youtubeId}
              video={v}
              onClick={() => {
                watch(v);
                void addHistory(v);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoCard({ video, onClick }: { video: VideoItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group text-left rounded-xl overflow-hidden bg-[rgb(var(--card))] border border-border",
        "hover:border-primary/60 hover:shadow-lg hover:shadow-emerald-500/10 transition-all"
      )}
    >
      <div className="relative aspect-video bg-black/40 overflow-hidden">
        <img
          src={video.thumbnail}
          alt={video.title}
          loading="lazy"
          className="h-full w-full object-cover group-hover:scale-105 transition-transform"
        />
        <span className="absolute bottom-1 right-1 rounded bg-black/80 text-white text-xs px-1.5 py-0.5">
          {formatDuration(video.duration)}
        </span>
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-sm font-semibold leading-snug">
          {video.title}
        </div>
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {video.channel}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {formatViews(video.views)} views · {timeAgo(video.publishedAt)}
        </div>
      </div>
    </button>
  );
}
