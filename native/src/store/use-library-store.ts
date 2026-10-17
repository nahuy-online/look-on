// Library store for the Tauri native app.
// Mirrors the web app's API surface, but every persistence call goes through
// Rust `db_*` commands instead of fetch + /api routes.

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
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

interface HistoryItem {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  category: string;
  progress: number;
  watchedAt: string;
}

interface LibraryState {
  liked: Record<string, VideoItem>;
  downloads: DownloadItem[];
  playlists: PlaylistLite[];
  history: HistoryItem[];
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
  addHistory: (v: VideoItem) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  liked: {},
  downloads: [],
  playlists: [],
  history: [],
  loaded: false,

  loadAll: async () => {
    if (get().loaded) return;
    try {
      const [likedArr, dlArr, plArr, histArr] = await Promise.all([
        invoke<VideoItem[]>("db_get_liked").catch(() => []),
        invoke<DownloadItem[]>("db_get_downloads").catch(() => []),
        invoke<PlaylistLite[]>("db_get_playlists").catch(() => []),
        invoke<HistoryItem[]>("db_get_history").catch(() => []),
      ]);
      const likedMap: Record<string, VideoItem> = {};
      for (const l of likedArr) likedMap[l.youtubeId] = l;
      set({
        liked: likedMap,
        downloads: dlArr,
        playlists: plArr,
        history: histArr,
        loaded: true,
      });
    } catch (err) {
      console.error("[library] loadAll failed:", err);
      set({ loaded: true });
    }
  },

  toggleLike: async (v) => {
    const liked = { ...get().liked };
    if (liked[v.youtubeId]) {
      delete liked[v.youtubeId];
      set({ liked });
      await invoke("db_toggle_like", { item: v }).catch((e) =>
        console.error("[library] toggle_like failed:", e)
      );
    } else {
      liked[v.youtubeId] = v;
      set({ liked });
      await invoke("db_toggle_like", { item: v }).catch((e) =>
        console.error("[library] toggle_like failed:", e)
      );
    }
  },

  isLiked: (youtubeId) => !!get().liked[youtubeId],

  addDownload: async (v, quality, sizeMb) => {
    if (get().downloads.some((d) => d.youtubeId === v.youtubeId)) return;
    const item = await invoke<DownloadItem>("db_add_download", {
      item: { ...v, quality, sizeMb },
    }).catch((e) => {
      console.error("[library] add_download failed:", e);
      return null;
    });
    if (item) set({ downloads: [item, ...get().downloads] });
  },

  removeDownload: async (id) => {
    set({ downloads: get().downloads.filter((d) => d.id !== id) });
    await invoke("db_remove_download", { id }).catch((e) =>
      console.error("[library] remove_download failed:", e)
    );
  },

  updateDownload: async (id, patch) => {
    set({
      downloads: get().downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
    await invoke("db_update_download", { id, patch }).catch((e) =>
      console.error("[library] update_download failed:", e)
    );
  },

  clearDownloads: async () => {
    set({ downloads: [] });
    await invoke("db_clear_downloads").catch((e) =>
      console.error("[library] clear_downloads failed:", e)
    );
  },

  createPlaylist: async (name, description) => {
    const pl = await invoke<PlaylistLite | null>("db_create_playlist", {
      name,
      desc: description ?? "",
    }).catch((e) => {
      console.error("[library] create_playlist failed:", e);
      return null;
    });
    if (pl) {
      set({ playlists: [pl, ...get().playlists] });
      return pl;
    }
    return null;
  },

  addToPlaylist: async (playlistId, v) => {
    await invoke("db_add_to_playlist", { playlistId, item: v }).catch((e) =>
      console.error("[library] add_to_playlist failed:", e)
    );
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
    set({
      playlists: get().playlists.map((p) =>
        p.id === playlistId
          ? {
              ...p,
              videoIds: p.videoIds.filter((x) => x !== youtubeId),
              videos: p.videos.filter((x) => x.youtubeId !== youtubeId),
            }
          : p
      ),
    });
    // No dedicated Rust command; rebuild is rare. Could be added if needed.
  },

  deletePlaylist: async (id) => {
    set({ playlists: get().playlists.filter((p) => p.id !== id) });
    await invoke("db_delete_playlist", { id }).catch((e) =>
      console.error("[library] delete_playlist failed:", e)
    );
  },

  addHistory: async (v) => {
    await invoke("db_add_history", { item: v }).catch((e) =>
      console.error("[library] add_history failed:", e)
    );
  },

  clearHistory: async () => {
    set({ history: [] });
    await invoke("db_clear_history").catch((e) =>
      console.error("[library] clear_history failed:", e)
    );
  },
}));
