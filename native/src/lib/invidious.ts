// Invidious CLIENT for the Tauri native app.
// Unlike the web app (server-only fetch), here we delegate ALL network I/O to
// Rust commands via Tauri `invoke`. The Rust side does the multi-instance
// fallback + 5-min cache (see src-tauri/src/invidious.rs).
//
// This mirrors the web app's invidious.ts contract so the rest of the
// frontend (stores, views) is portable.

import { invoke } from "@tauri-apps/api/core";
import type { VideoItem, StreamInfo, Category } from "./types";

export async function fetchTrending(category: Category): Promise<VideoItem[]> {
  try {
    const items = await invoke<VideoItem[]>("trending", { category });
    return items ?? [];
  } catch (err) {
    console.error("[invidious] trending failed:", err);
    return [];
  }
}

export async function searchVideos(q: string): Promise<VideoItem[]> {
  if (!q.trim()) return [];
  try {
    const items = await invoke<VideoItem[]>("search", { q });
    return items ?? [];
  } catch (err) {
    console.error("[invidious] search failed:", err);
    return [];
  }
}

export async function fetchRelated(
  youtubeId: string,
  category: Category
): Promise<VideoItem[]> {
  try {
    const items = await invoke<VideoItem[]>("related", { youtubeId, category });
    return items ?? [];
  } catch (err) {
    console.error("[invidious] related failed:", err);
    return [];
  }
}

export async function getVideoStreams(youtubeId: string): Promise<StreamInfo | null> {
  try {
    const info = await invoke<StreamInfo>("video_streams", { youtubeId });
    return info ?? null;
  } catch (err) {
    console.error("[invidious] video_streams failed:", err);
    return null;
  }
}
