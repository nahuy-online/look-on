"use client";

import * as React from "react";
import { ListVideo, Plus, Trash2, Play, ArrowLeft, ListPlus } from "lucide-react";
import { useLibraryStore } from "@/store/use-library-store";
import { useAppStore } from "@/store/use-app-store";
import { VideoCard } from "@/components/video-card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDuration, formatViews, timeAgo } from "@/lib/format";
import type { VideoItem } from "@/lib/types";

export function PlaylistsView() {
  const playlists = useLibraryStore((s) => s.playlists);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);
  const deletePlaylist = useLibraryStore((s) => s.deletePlaylist);
  const removeFromPlaylist = useLibraryStore((s) => s.removeFromPlaylist);
  const watch = useAppStore((s) => s.watch);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");

  const selected = playlists.find((p) => p.id === selectedId);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Give your playlist a name"); return; }
    await createPlaylist(name.trim(), desc.trim() || undefined);
    toast.success("Playlist created");
    setName(""); setDesc(""); setOpen(false);
  };

  if (selected) {
    return (
      <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> All playlists
        </button>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold">{selected.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selected.videos.length} videos · updated {timeAgo(selected.updatedAt)}
            </p>
            {selected.description && <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>}
          </div>
          {selected.videos.length > 0 && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={() => watch(selected.videos[0])}
            >
              <Play className="h-4 w-4 fill-current" /> Play all
            </Button>
          )}
        </div>

        {selected.videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center mb-3">
              <ListPlus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">This playlist is empty. Add videos from the Save menu.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {selected.videos.map((v, i) => (
              <div key={v.youtubeId} className="relative group">
                <div className="flex gap-3 items-center p-2 rounded-xl hover:bg-accent/60 cursor-pointer" onClick={() => watch(v)}>
                  <span className="w-6 text-center text-sm text-muted-foreground font-medium shrink-0">{i + 1}</span>
                  <div className="relative w-36 sm:w-40 shrink-0 aspect-video rounded-lg overflow-hidden bg-muted">
                    <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1 right-1 bg-black/85 text-white text-[10px] px-1 rounded">{formatDuration(v.duration)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium line-clamp-2">{v.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{v.channel}</p>
                    <p className="text-xs text-muted-foreground">{formatViews(v.views)} views</p>
                  </div>
                </div>
                <button
                  onClick={() => { removeFromPlaylist(selected.id, v.youtubeId); toast("Removed from playlist"); }}
                  className="absolute top-1/2 -translate-y-1/2 right-2 h-8 w-8 rounded-full bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <ListVideo className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Playlists</h1>
            <p className="text-xs text-muted-foreground">{playlists.length} playlists</p>
          </div>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New playlist
        </Button>
      </div>

      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center mb-4">
            <ListVideo className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium">No playlists yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create a playlist to organize your favorite videos.</p>
          <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Create your first playlist
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {playlists.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(p.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(p.id); } }}
              className="group text-left cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
                {p.videos.length > 0 ? (
                  <PlaylistCollage videos={p.videos} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ListVideo className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 flex items-end p-2">
                  <div className="text-white text-xs font-semibold flex items-center gap-1">
                    <Play className="h-3 w-3 fill-current" /> Play all
                  </div>
                </div>
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePlaylist(p.id); toast("Playlist deleted"); }}
                    className="h-7 w-7 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-black/80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <h3 className="font-medium text-sm mt-2 line-clamp-1 group-hover:text-primary">{p.name}</h3>
              <p className="text-xs text-muted-foreground">{p.videos.length} videos · {timeAgo(p.updatedAt)}</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pl-name">Name</Label>
              <Input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Playlist" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-desc">Description (optional)</Label>
              <Textarea id="pl-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's this playlist about?" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlaylistCollage({ videos }: { videos: VideoItem[] }) {
  const top = videos.slice(0, 4);
  if (top.length === 1) {
    return <img src={top[0].thumbnail} alt="" className="w-full h-full object-cover" />;
  }
  return (
    <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-px">
      {Array.from({ length: 4 }).map((_, i) => (
        top[i] ? (
          <img key={i} src={top[i].thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div key={i} className="w-full h-full bg-muted-foreground/10" />
        )
      ))}
    </div>
  );
}
