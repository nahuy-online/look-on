"use client";

import * as React from "react";
import {
  Download, Trash2, Play, Pause, CheckCircle2, Loader2, Clock,
  HardDrive, MoreVertical, X,
} from "lucide-react";
import { useLibraryStore } from "@/store/use-library-store";
import { useAppStore } from "@/store/use-app-store";
import { formatDuration } from "@/lib/format";
import type { DownloadItem, VideoItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function DownloadsView() {
  const downloads = useLibraryStore((s) => s.downloads);
  const updateDownload = useLibraryStore((s) => s.updateDownload);
  const removeDownload = useLibraryStore((s) => s.removeDownload);
  const clearDownloads = useLibraryStore((s) => s.clearDownloads);
  const watch = useAppStore((s) => s.watch);

  // simulate progress for queued/downloading items
  React.useEffect(() => {
    const active = downloads.filter((d) => d.status === "queued" || d.status === "downloading");
    if (active.length === 0) return;
    const t = setInterval(() => {
      active.forEach((d) => {
        const next = Math.min(100, d.progress + Math.floor(3 + Math.random() * 9));
        if (next >= 100) {
          updateDownload(d.id, { progress: 100, status: "completed" });
        } else {
          updateDownload(d.id, { progress: next, status: "downloading" });
        }
      });
    }, 700);
    return () => clearInterval(t);
  }, [downloads, updateDownload]);

  const active = downloads.filter((d) => d.status !== "completed" && d.status !== "failed");
  const completed = downloads.filter((d) => d.status === "completed");
  const totalSize = downloads.reduce((acc, d) => acc + d.sizeMb, 0);

  const playDownloaded = (d: DownloadItem) => {
    const v: VideoItem = {
      id: d.youtubeId, youtubeId: d.youtubeId, title: d.title, channel: d.channel,
      thumbnail: d.thumbnail, duration: d.duration, category: "All", views: 0, likes: 0,
      publishedAt: d.createdAt, description: "",
    };
    watch(v);
  };

  return (
    <div className="px-4 sm:px-6 py-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Download className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Downloads</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-3">
              <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {downloads.length} videos</span>
              <span>~{(totalSize / 1024).toFixed(2)} GB</span>
            </p>
          </div>
        </div>
        {downloads.length > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5" onClick={() => { clearDownloads(); toast("Cleared all downloads"); }}>
            <Trash2 className="h-4 w-4" /> Clear all
          </Button>
        )}
      </div>

      {downloads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center mb-4">
            <Download className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium">No downloads yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Tap the Download button on any video to save it for offline viewing — ad-free.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> Downloading ({active.length})
              </h2>
              <div className="space-y-2">
                {active.map((d) => <DownloadRow key={d.id} d={d} onPlay={() => playDownloaded(d)} onPause={() => updateDownload(d.id, { status: d.status === "paused" ? "downloading" : "paused" })} onRemove={() => removeDownload(d.id)} />)}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Completed ({completed.length})
              </h2>
              <div className="space-y-2">
                {completed.map((d) => <DownloadRow key={d.id} d={d} onPlay={() => playDownloaded(d)} onPause={() => {}} onRemove={() => removeDownload(d.id)} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function DownloadRow({ d, onPlay, onPause, onRemove }: {
  d: DownloadItem; onPlay: () => void; onPause: () => void; onRemove: () => void;
}) {
  const done = d.status === "completed";
  const paused = d.status === "paused";
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-card hover:bg-accent/40 transition">
      <div className="relative w-28 sm:w-36 shrink-0 aspect-video rounded-lg overflow-hidden bg-muted">
        <img src={d.thumbnail} alt={d.title} className="w-full h-full object-cover" />
        <div className="absolute bottom-1 right-1 bg-black/85 text-white text-[10px] px-1 rounded">{formatDuration(d.duration)}</div>
        {done && (
          <div className="absolute inset-0 bg-emerald-600/20 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-white drop-shadow" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium line-clamp-1">{d.title}</h3>
        <p className="text-xs text-muted-foreground">{d.channel} · {d.quality}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-xs">
            <div className={cn("h-full rounded-full transition-all", done ? "bg-emerald-500" : "bg-emerald-500/70")} style={{ width: `${d.progress}%` }} />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums w-16 text-right">
            {done ? `${d.sizeMb} MB` : `${d.progress}% · ${Math.round((d.sizeMb * d.progress) / 100)} MB`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {done ? (
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-full" onClick={onPlay} title="Play">
            <Play className="h-4 w-4 text-emerald-500" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-full" onClick={onPause} title={paused ? "Resume" : "Pause"}>
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-full"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRemove} className="text-red-500 focus:text-red-500">
              <Trash2 className="h-4 w-4 mr-2" /> Remove download
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
