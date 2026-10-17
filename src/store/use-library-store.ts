"use client";

import { create } from "zustand";
import type { VideoItem, DownloadItem } from "@/lib/types";

interface PlaylistLite {
  id: string;
  name: string;
  description?: string;
  videoIds: string[];
  videos: VideoItem[];
  createdAt: string;
  updatedAt: string;
}

interface LibraryState {
  liked: Record<string, VideoItem>;
  downloads: DownloadItem[];
  playlists: PlaylistLite[];
  loaded: boolean;

  loadAll: () => Promise<void>;
  toggleLike: (v: VideoItem) => Promise<void>;
  isLiked: (youtubeId: string) => boolean;
  addDownload: (v: VideoItem, quality: string, sizeMb: number) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  updateDownload: (id: string, patch: Partial<DownloadItem>) => Promise<void>;
  clearDownloads: () => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<PlaylistLite | null>;
  addToPlaylist: (playlistId: string, v: VideoItem) => Promise<void>;
  removeFromPlaylist: (playlistId: string, youtubeId: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  liked: {},
  downloads: [],
  playlists: [],
  loaded: false,

  loadAll: async () => {
    if (get().loaded) return;
    try {
      const [likedRes, dlRes, plRes] = await Promise.all([
        fetch("/api/liked").then((r) => r.json()),
        fetch("/api/downloads").then((r) => r.json()),
        fetch("/api/playlists").then((r) => r.json()),
      ]);
      const likedMap: Record<string, VideoItem> = {};
      for (const l of likedRes.items || []) {
        likedMap[l.youtubeId] = {
          id: l.youtubeId,
          youtubeId: l.youtubeId,
          title: l.title,
          channel: l.channel,
          thumbnail: l.thumbnail,
          duration: l.duration,
          category: l.category,
          views: 0,
          likes: 0,
          publishedAt: l.likedAt,
          description: "",
        };
      }
      const downloads: DownloadItem[] = (dlRes.items || []).map((d: any) => ({
        id: d.id,
        youtubeId: d.youtubeId,
        title: d.title,
        channel: d.channel,
        thumbnail: d.thumbnail,
        duration: d.duration,
        quality: d.quality,
        sizeMb: d.sizeMb,
        progress: d.progress,
        status: d.status,
        createdAt: d.createdAt,
      }));
      const playlists: PlaylistLite[] = (plRes.items || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        videoIds: p.videoIds,
        videos: p.videos,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      set({ liked: likedMap, downloads, playlists, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  toggleLike: async (v) => {
    const liked = { ...get().liked };
    if (liked[v.youtubeId]) {
      delete liked[v.youtubeId];
      set({ liked });
      await fetch(`/api/liked?youtubeId=${v.youtubeId}`, { method: "DELETE" });
    } else {
      liked[v.youtubeId] = v;
      set({ liked });
      await fetch("/api/liked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
    }
  },

  isLiked: (youtubeId) => !!get().liked[youtubeId],

  addDownload: async (v, quality, sizeMb) => {
    if (get().downloads.some((d) => d.youtubeId === v.youtubeId)) return;
    const res = await fetch("/api/downloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...v, quality, sizeMb }),
    }).then((r) => r.json());
    if (res.item) {
      set({ downloads: [res.item, ...get().downloads] });
    }
  },

  removeDownload: async (id) => {
    set({ downloads: get().downloads.filter((d) => d.id !== id) });
    await fetch(`/api/downloads?id=${id}`, { method: "DELETE" });
  },

  updateDownload: async (id, patch) => {
    set({
      downloads: get().downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
    await fetch("/api/downloads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  },

  clearDownloads: async () => {
    set({ downloads: [] });
    await fetch("/api/downloads?id=all", { method: "DELETE" });
  },

  createPlaylist: async (name, description) => {
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name, description }),
    }).then((r) => r.json());
    if (res.item) {
      const pl: PlaylistLite = {
        id: res.item.id,
        name: res.item.name,
        description: res.item.description,
        videoIds: [],
        videos: [],
        createdAt: res.item.createdAt,
        updatedAt: res.item.updatedAt,
      };
      set({ playlists: [pl, ...get().playlists] });
      return pl;
    }
    return null;
  },

  addToPlaylist: async (playlistId, v) => {
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "addVideo", playlistId, ...v }),
    });
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId && !p.videoIds.includes(v.youtubeId)
          ? {
              ...p,
              videoIds: [v.youtubeId, ...p.videoIds],
              videos: [v, ...p.videos],
              updatedAt: new Date().toISOString(),
            }
          : p
      ),
    });
  },

  removeFromPlaylist: async (playlistId, youtubeId) => {
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "removeVideo", playlistId, youtubeId }),
    });
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId
          ? { ...p, videoIds: p.videoIds.filter((x) => x !== youtubeId), videos: p.videos.filter((x) => x.youtubeId !== youtubeId) }
          : p
      ),
    });
  },

  deletePlaylist: async (id) => {
    set({ playlists: get().playlists.filter((p) => p.id !== id) });
    await fetch(`/api/playlists?id=${id}`, { method: "DELETE" });
  },
}));
