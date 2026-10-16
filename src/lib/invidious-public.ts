import "server-only";
import type { VideoItem, Category } from "./types";
import { thumbnailUrl } from "./format";

// Public Invidious fetch helper (shared by route handlers).
// Mirrors the logic in invidious.ts but exposes fetchFromInvidiousPublic for import.

const INV_INSTANCES = [
  "https://invidious.fdn.fr",
  "https://inv.tux.pizza",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://iv.ggtyler.dev",
];

export async function fetchFromInvidiousPublic<T>(path: string, _category: Category = "All"): Promise<T> {
  for (const inst of INV_INSTANCES) {
    const url = `${inst}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "PureTuberVPN/1.0" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      // map array of Invidious video objects → VideoItem[]
      if (Array.isArray(data)) {
        return data
          .map((v: any) => mapInvidious(v, _category))
          .filter(Boolean) as unknown as T;
      }
      return data as T;
    } catch {
      continue;
    } finally {
      clearTimeout(t);
    }
  }
  return [] as unknown as T;
}

function mapInvidious(v: any, category: Category = "All"): VideoItem | null {
  if (!v || !v.videoId) return null;
  const id = v.videoId as string;
  const published = v.published ? v.published * 1000 : Date.now();
  return {
    id,
    youtubeId: id,
    title: (v.title || "Untitled").toString(),
    channel: v.author || "Unknown",
    channelAvatar: v.authorThumbnails?.[0]?.url
      ? (v.authorThumbnails[0].url.startsWith("http") ? v.authorThumbnails[0].url : `${INV_INSTANCES[0]}${v.authorThumbnails[0].url}`)
      : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(v.author || "Unknown")}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`,
    thumbnail: v.videoThumbnails?.[0]?.url || thumbnailUrl(id),
    duration: v.lengthSeconds || 0,
    views: v.viewCount || 0,
    likes: v.likeCount || 0,
    publishedAt: new Date(published).toISOString(),
    category,
    description: v.description || "",
    curated: false,
  };
}
