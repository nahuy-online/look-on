import "server-only";
import ZAI from "z-ai-web-dev-sdk";
import type { VideoItem, Category } from "./types";
import { seededRand, thumbnailUrl } from "./format";
import { CURATED_VIDEOS } from "./videos";

interface CacheEntry {
  items: VideoItem[];
  ts: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const CATEGORY_QUERIES: Record<Exclude<Category, "All">, string> = {
  Music: "official music video popular songs",
  Gaming: "gaming gameplay walkthrough highlights",
  Tech: "technology review gadget tutorial",
  News: "breaking news world news today",
  Sports: "sports highlights best moments",
  Education: "educational documentary science explained",
  Entertainment: "viral entertainment trending video",
  Travel: "travel vlog destination guide",
  Cooking: "cooking recipe food tutorial",
};

const CHANNEL_POOL = [
  "PrimeTube", "NovaStream", "Echo Media", "Vertex", "Lumina", "PulseDaily",
  "Orbit", "Zenith", "Cresta", "Mosaic", "Aurora Hub", "Brightside",
  "The Daily Frame", "Kinetic", "Studio K", "Vivid", "MintChannel", "Skyline",
];

function synthesize(youtubeId: string, title: string, category: Category): VideoItem {
  const rand = seededRand(youtubeId + title);
  const views = Math.floor(10_000 + rand() * 80_000_000);
  const likes = Math.floor(views * (0.02 + rand() * 0.06));
  const duration = Math.floor(180 + rand() * 1200); // 3–23 min
  const daysAgo = Math.floor(rand() * 1200);
  const published = new Date(Date.now() - daysAgo * 86400000).toISOString();
  const channel = CHANNEL_POOL[Math.floor(rand() * CHANNEL_POOL.length)];
  return {
    id: youtubeId,
    youtubeId,
    title: title.replace(/\s*\|\s*YouTube\s*$/i, "").replace(/^\s*-\s*/, "").trim(),
    channel,
    channelAvatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(channel)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`,
    thumbnail: thumbnailUrl(youtubeId),
    duration,
    views,
    likes,
    publishedAt: published,
    category,
    description: `${title} — streamed ad-free on PureTuber VPN.`,
  };
}

async function runSearch(query: string, num: number): Promise<VideoItem[]> {
  let zai: Awaited<ReturnType<typeof ZAI.create>>;
  try {
    zai = await ZAI.create();
  } catch {
    return [];
  }
  const results = await zai.functions.invoke("web_search", { query, num });
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const items: VideoItem[] = [];
  for (const r of results) {
    const url: string = r.url || "";
    const m = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/
    );
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = (r.name || "Untitled video").toString();
    items.push(synthesize(id, title, "All"));
    if (items.length >= num) break;
  }
  return items;
}

export async function fetchTrending(category: Category): Promise<VideoItem[]> {
  const key = `trending:${category}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.items;

  const curated = category === "All" ? CURATED_VIDEOS : CURATED_VIDEOS.filter((v) => v.category === category);
  let fetched: VideoItem[] = [];
  if (category === "All") {
    // search across a few popular queries for a varied feed
    const queries = ["trending music video official", "popular gaming highlights", "tech review new"];
    const sets = await Promise.all(queries.map((q) => runSearch(q, 8).catch(() => [])));
    fetched = sets.flat();
  } else {
    fetched = await runSearch(CATEGORY_QUERIES[category] + " youtube", 14).catch(() => []);
  }

  // de-dup by id, curated first then fetched
  const seen = new Set<string>();
  const merged: VideoItem[] = [];
  for (const v of [...curated, ...fetched]) {
    if (seen.has(v.youtubeId)) continue;
    seen.add(v.youtubeId);
    merged.push({ ...v, category });
  }
  const result = merged.slice(0, 24);
  CACHE.set(key, { items: result, ts: Date.now() });
  return result;
}

export async function fetchSearch(q: string): Promise<VideoItem[]> {
  const key = `search:${q}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.items;
  const fetched = await runSearch(`${q} youtube`, 18).catch(() => []);
  const result = fetched.length > 0 ? fetched : CURATED_VIDEOS.slice(0, 8);
  CACHE.set(key, { items: result, ts: Date.now() });
  return result;
}

export async function fetchRelated(video: { youtubeId: string; title: string; category: Category }): Promise<VideoItem[]> {
  const key = `related:${video.youtubeId}`;
  const cached = CACHE.get(key);
  if (deepFresh(cached)) {
    return cached!.items;
  }
  const q = `${video.title.split(" - ")[0]} ${video.category.toLowerCase()} youtube`;
  const fetched = await runSearch(q, 12).catch(() => []);
  // exclude the current video
  const filtered = fetched.filter((v) => v.youtubeId !== video.youtubeId);
  const result = filtered.length > 0 ? filtered : CURATED_VIDEOS.filter((v) => v.youtubeId !== video.youtubeId).slice(0, 10);
  CACHE.set(key, { items: result, ts: Date.now() });
  return result;
}

function deepFresh(entry?: CacheEntry): boolean {
  return !!entry && Date.now() - entry.ts < CACHE_TTL;
}
