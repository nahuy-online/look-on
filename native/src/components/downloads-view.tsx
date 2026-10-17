import { useEffect, useState } from "react";
import {
  Download as DownloadIcon,
  Trash2,
  Play,
  Pause,
  History as HistoryIcon,
  ThumbsUp,
  ListVideo,
  Loader2,
} from "lucide-react";
import { useLibraryStore } from "@/store/use-library-store";
import { useAppStore } from "@/store/use-app-store";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { DownloadItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DownloadsView({
  historyMode = false,
  likedMode = false,
  playlistsMode = false,
}: {
  historyMode?: boolean;
  likedMode?: boolean;
  playlistsMode?: boolean;
}) {
  const downloads = useLibraryStore((s) => s.downloads);
  const history = useLibraryStore((s) => s.history);
  const liked = useLibraryStore((s) => s.liked);
  const playlists = useLibraryStore((s) => s.playlists);
  const updateDownload = useLibraryStore((s) => s.updateDownload);
  const removeDownload = useLibraryStore((s) => s.removeDownload);
  const clearDownloads = useLibraryStore((s) => s.clearDownloads);
  const clearHistory = useLibraryStore((s) => s.clearHistory);
  const watch = useAppStore((s) => s.watch);

  // Simulate active download progress while a download is in "downloading" state.
  useEffect(() => {
    const active = downloads.find((d) => d.status === "downloading");
    if (!active) return;
    const h = window.setInterval(() => {
      const next = Math.min(100, active.progress + Math.random() * 12 + 4);
      void updateDownload(active.id, {
        progress: next,
        status: next >= 100 ? "completed" : "downloading",
      });
    }, 1500);
    return () => window.clearInterval(h);
  }, [downloads, updateDownload]);

  const title = historyMode
    ? "History"
    : likedMode
    ? "Liked Videos"
    : playlistsMode
    ? "Playlists"
    : "Downloads";

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        {historyMode ? (
          <HistoryIcon className="h-5 w-5 text-emerald-400" />
        ) : likedMode ? (
          <ThumbsUp className="h-5 w-5 text-emerald-400" />
        ) : playlistsMode ? (
          <ListVideo className="h-5 w-5 text-emerald-400" />
        ) : (
          <DownloadIcon className="h-5 w-5 text-emerald-400" />
        )}
        <h1 className="text-xl font-bold">{title}</h1>
        {!playlistsMode && (
          <button
            onClick={() =>
              historyMode ? void clearHistory() : void clearDownloads()
            }
            className="ml-auto flex items-center gap-1 text-xs text-destructive hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>

      {/* Downloads */}
      {!historyMode && !likedMode && !playlistsMode && (
        <>
          {downloads.length === 0 && (
            <EmptyState text="No downloads yet. Tap Download on any video." />
          )}
          <div className="space-y-2">
            {downloads.map((d) => (
              <DownloadRow
                key={d.id}
                item={d}
                onPlay={() => watch(toVideo(d))}
                onPause={() =>
                  void updateDownload(d.id, {
                    status: d.status === "paused" ? "downloading" : "paused",
                  })
                }
                onRemove={() => void removeDownload(d.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* History */}
      {historyMode && (
        <>
          {history.length === 0 && <EmptyState text="Nothing watched yet." />}
          <div className="space-y-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() =>
                  watch({
                    id: h.youtubeId,
                    youtubeId: h.youtubeId,
                    title: h.title,
                    channel: h.channel,
                    thumbnail: h.thumbnail,
                    duration: h.duration,
                    views: 0,
                    likes: 0,
                    publishedAt: h.watchedAt,
                    category: h.category as any,
                    description: "",
                  })
                }
                className="flex gap-3 w-full text-left rounded-lg p-2 hover:bg-accent/60"
              >
                <img
                  src={h.thumbnail}
                  className="h-16 w-28 rounded object-cover bg-black/40"
                  alt=""
                />
                <div className="flex-1 min-w-0">
                  <div className="line-clamp-2 text-sm font-medium">{h.title}</div>
                  <div className="text-xs text-muted-foreground">{h.channel}</div>
                  <div className="text-xs text-muted-foreground">
                    {timeAgo(h.watchedAt)} · {formatDuration(h.duration)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Liked */}
      {likedMode && (
        <>
          {Object.keys(liked).length === 0 && <EmptyState text="No likes yet." />}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.values(liked).map((v) => (
              <button
                key={v.youtubeId}
                onClick={() => watch(v)}
                className="text-left rounded-lg overflow-hidden bg-[rgb(var(--card))] border border-border hover:border-primary/60"
              >
                <img src={v.thumbnail} alt="" className="w-full aspect-video object-cover" />
                <div className="p-2">
                  <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {v.channel} · {formatViews(v.views)} views
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Playlists */}
      {playlistsMode && (
        <>
          {playlists.length === 0 && (
            <EmptyState text="No playlists yet. Create one from a video’s Save button." />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {playlists.map((p) => (
              <div
                key={p.id}
                className="rounded-lg bg-[rgb(var(--card))] border border-border p-3"
              >
                <div className="text-sm font-semibold">{p.name}</div>
                {p.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {p.description}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {p.videoIds.length} video(s) · created {timeAgo(p.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DownloadRow({
  item,
  onPlay,
  onPause,
  onRemove,
}: {
  item: DownloadItem;
  onPlay: () => void;
  onPause: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[rgb(var(--card))] border border-border p-2">
      <img
        src={item.thumbnail}
        alt=""
        className="h-16 w-28 rounded object-cover bg-black/40"
      />
      <div className="flex-1 min-w-0">
        <div className="line-clamp-1 text-sm font-medium">{item.title}</div>
        <div className="text-xs text-muted-foreground">{item.channel}</div>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {item.quality} · {item.sizeMb}MB
          </span>
          {item.status === "completed" ? (
            <span className="text-emerald-400">✓ Completed</span>
          ) : item.status === "paused" ? (
            <span className="text-amber-400">Paused</span>
          ) : item.status === "downloading" ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              {Math.floor(item.progress)}%
            </span>
          ) : (
            <span className="text-muted-foreground">Queued</span>
          )}
        </div>
        {(item.status === "downloading" || item.status === "paused") && (
          <div className="mt-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {item.status === "completed" ? (
          <button onClick={onPlay} className="p-2 rounded-md hover:bg-accent">
            <Play className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={onPause} className="p-2 rounded-md hover:bg-accent">
            {item.status === "paused" ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-2 rounded-md hover:bg-accent text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground text-sm">{text}</div>
  );
}

function toVideo(d: DownloadItem) {
  return {
    id: d.youtubeId,
    youtubeId: d.youtubeId,
    title: d.title,
    channel: d.channel,
    thumbnail: d.thumbnail,
    duration: d.duration,
    views: 0,
    likes: 0,
    publishedAt: d.createdAt,
    category: "All" as const,
    description: "",
  };
}
