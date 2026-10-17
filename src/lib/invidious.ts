import "server-only";
import type { VideoItem, Category } from "./types";
import { seededRand, thumbnailUrl } from "./format";
import { CURATED_VIDEOS } from "./videos";

// Invidious API client with multi-instance fallback.
// Public instances are often rate-limited/down, so we try several and fall back
// to web-search + curated content.

const INV_INSTANCES = [
  "https://invidious.fdn.fr",
  "https://inv.tux.pizza",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://iv.ggtyler.dev",
];

interface CacheEntry {
  items: VideoItem[];
  ts: number;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

async function tryInstance(instance: string, path: string): Promise<any | null> {
  const url = `${instance}${path}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "PureTuberVPN/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchFromInvidious<T>(path: string): Promise<T | null> {
  // Try at most 2 instances to bound total latency (~7s max)
  for (const inst of INV_INSTANCES.slice(0, 2)) {
    const data = await tryInstance(inst, path);
    if (data) return data as T;
  }
  return null;
}

// Map Invidious video object → our VideoItem
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
      ? (v.authorThumbnails[0].url.startsWith("http") ? v.authorThumbnails[0].url : `${getInst(v.authorThumbnails[0].url)}${v.authorThumbnails[0].url}`)
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

function getInst(url: string): string {
  if (url.startsWith("http")) return "";
  return INV_INSTANCES[0];
}

const CATEGORY_MAP: Record<Exclude<Category, "All">, string> = {
  Music: "music",
  Gaming: "gaming",
  Tech: "technology",
  News: "news",
  Sports: "sports",
  Education: "education",
  Entertainment: "entertainment",
  Travel: "travel",
  Cooking: "cooking",
};

export async function fetchTrendingInvidious(category: Category): Promise<VideoItem[]> {
  const key = `inv:trending:${category}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.items;

  let items: VideoItem[] = [];

  if (category === "All") {
    // trending (popular) feed
    const data = await fetchFromInvidious<any[]>("/api/v1/trending?region=US");
    if (Array.isArray(data)) {
      items = data.map((v) => mapInvidious(v, "All")).filter(Boolean) as VideoItem[];
    }
  } else {
    // category-specific trending via search sort by view count
    const q = encodeURIComponent(CATEGORY_MAP[category]);
    const data = await fetchFromInvidious<any>(`/api/v1/search?q=${q}&sort_by=view_count&type=video`);
    if (data && Array.isArray(data.videos)) {
      items = data.videos.map((v: any) => mapInvidious(v, category)).filter(Boolean) as VideoItem[];
    } else if (Array.isArray(data)) {
      items = data.map((v: any) => mapInvidious(v, category)).filter(Boolean) as VideoItem[];
    }
  }

  // merge with curated for stability (curated first so user always sees content)
  const seen = new Set<string>();
  const merged: VideoItem[] = [];
  const curated = category === "All" ? CURATED_VIDEOS : CURATED_VIDEOS.filter((v) => v.category === category);
  for (const v of curated) {
    if (!seen.has(v.youtubeId)) { seen.add(v.youtubeId); merged.push(v); }
  }
  for (const v of items) {
    if (!seen.has(v.youtubeId)) { seen.add(v.youtubeId); merged.push(v); }
  }

  const result = merged.slice(0, 24);
  CACHE.set(key, { items: result, ts: Date.now() });
  return result;
}

export async function searchInvidious(q: string): Promise<VideoItem[]> {
  const key = `inv:search:${q}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.items;

  const data = await fetchFromInvidious<any>(`/api/v1/search?q=${encodeURIComponent(q)}&sort_by=relevance&type=video`);
  let items: VideoItem[] = [];
  if (data && Array.isArray(data.videos)) {
    items = data.videos.map((v: any) => mapInvidious(v, "All")).filter(Boolean) as VideoItem[];
  } else if (Array.isArray(data)) {
    items = data.map((v: any) => mapInvidious(v, "All")).filter(Boolean) as VideoItem[];
  }

  if (items.length === 0) {
    // fallback: filter curated by title
    const lc = q.toLowerCase();
    items = CURATED_VIDEOS.filter((v) => v.title.toLowerCase().includes(lc) || v.channel.toLowerCase().includes(lc));
  }
  const result = items.slice(0, 20);
  CACHE.set(key, { items: result, ts: Date.now() });
  return result;
}

export async function relatedInvidious(youtubeId: string, category: Category): Promise<VideoItem[]> {
  const key = `inv:related:${youtubeId}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.items;

  // Invidious removed /api/v1/videos/:id/recommendations in newer versions;
  // use the video title for a search-based fallback.
  const videoData = await fetchFromInvidious<any>(`/api/v1/videos/${youtubeId}`);
  const title = videoData?.title || "";
  const q = title ? encodeURIComponent(title.split(" - ")[0].slice(0, 40)) : "";
  let items: VideoItem[] = [];
  if (q) {
    const data = await fetchFromInvidious<any>(`/api/v1/search?q=${q}&sort_by=relevance&type=video`);
    if (data && Array.isArray(data.videos)) {
      items = data.videos.map((v: any) => mapInvidious(v, category)).filter(Boolean) as VideoItem[];
    } else if (Array.isArray(data)) {
      items = data.map((v: any) => mapInvidious(v, category)).filter(Boolean) as VideoItem[];
    }
  }
  // exclude current
  items = items.filter((v) => v.youtubeId !== youtubeId);
  if (items.length === 0) {
    items = CURATED_VIDEOS.filter((v) => v.youtubeId !== youtubeId).slice(0, 10);
  }
  const result = items.slice(0, 12);
  CACHE.set(key, { items: result, ts: Date.now() });
  return result;
}

// Fetch direct stream URLs for a video (used by native Tauri player for true ad-free).
// In the web demo we keep the IFrame player, but expose this for the queue/speed UI metadata.
export async function getVideoStreams(youtubeId: string): Promise<{ title: string; streams: any[] } | null> {
  const data = await fetchFromInvidious<any>(`/api/v1/videos/${youtubeId}`);
  if (!data) return null;
  return {
    title: data.title || "",
    streams: (data.adaptiveFormats || []).map((f: any) => ({
      url: f.url,
      quality: f.qualityLabel || f.audioQuality || "",
      type: f.type,
      container: f.container,
    })),
  };
}
