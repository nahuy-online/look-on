import "server-only";
import type { Category, VideoItem } from "@/lib/types";

/**
 * YouTube Data API v3 client (server-only).
 *
 * Every function takes a user OAuth access token (issued by the Google
 * provider in src/lib/auth.ts and stored on the NextAuth session). All calls
 * happen server-side so the token never reaches the browser.
 *
 * Endpoints used:
 *   - /playlistItems (liked videos playlist = "LL")
 *   - /playlists?mine=true
 *   - /subscriptions?mine=true
 *   - /activities?mine=true (recent uploads from subscribed channels)
 *   - /channels?mine=true (user's own channel for avatar / sub count)
 *   - /videos (used to enrich playlist/activity items with duration & stats)
 *
 * Errors are normalised into YouTubeApiError so route handlers can map them
 * to clean HTTP responses (401 → token expired, 429 → quota, etc.).
 */

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubePlaylist {
  id: string;
  title: string;
  description: string;
  itemCount: number;
  thumbnail: string;
  videoIds: string[];
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  avatar: string;
  subscriberCount: number;
}

export interface YouTubeSubscription {
  channelId: string;
  title: string;
  thumbnail: string;
}

export class YouTubeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
  }
}

async function ytFetch(path: string, accessToken: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${YT_API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch (e: any) {
    throw new YouTubeApiError(502, `Network error reaching YouTube API: ${e?.message ?? e}`);
  }

  if (res.status === 401) {
    throw new YouTubeApiError(401, "YouTube access token expired or invalid");
  }
  if (res.status === 403) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    const reason: string | undefined = body?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
      throw new YouTubeApiError(429, "YouTube API quota exceeded — try again later");
    }
    if (reason === "accessNotConfigured") {
      throw new YouTubeApiError(403, "YouTube Data API v3 is not enabled for this Google project");
    }
    throw new YouTubeApiError(403, body?.error?.message ?? "YouTube API access forbidden");
  }
  if (res.status === 429) {
    throw new YouTubeApiError(429, "YouTube API rate limited — try again later");
  }
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new YouTubeApiError(
      res.status,
      body?.error?.message ?? `YouTube API error: ${res.status}`
    );
  }
  return res.json();
}

function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  // ISO 8601 duration: PT#H#M#S (days/weeks not used by YouTube)
  const m = iso.match(/P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

function guessCategory(title: string, desc: string): Category {
  const text = `${title} ${desc}`.toLowerCase();
  if (/game|gaming|minecraft|fortnite|walkthrough|gameplay|lets play/.test(text)) return "Gaming";
  if (/music|song|album|cover|remix|lofi|beat|track|mv /.test(text)) return "Music";
  if (/tech|programming|code|software|gadget| ai |iphone|android|review/.test(text)) return "Tech";
  if (/news|breaking|report|headline/.test(text)) return "News";
  if (/sport|football|soccer|nba|nfl|ufc|match/.test(text)) return "Sports";
  if (/learn|tutorial|education|lecture|course|lesson|how to/.test(text)) return "Education";
  if (/travel|trip|vlog|country|city|tour/.test(text)) return "Travel";
  if (/recipe|cook|food|kitchen|bake|meal/.test(text)) return "Cooking";
  return "Entertainment";
}

function mapToVideoItem(
  snippet: any,
  id: string,
  contentDetails?: any,
  statistics?: any
): VideoItem {
  const duration = contentDetails ? parseIsoDuration(contentDetails.duration) : 0;
  const views = statistics ? parseInt(statistics.viewCount || "0", 10) : 0;
  const likes = statistics ? parseInt(statistics.likeCount || "0", 10) : 0;
  const channel =
    snippet?.videoOwnerChannelTitle || snippet?.channelTitle || "Unknown channel";
  return {
    id,
    youtubeId: id,
    title: snippet?.title || "Untitled",
    channel,
    channelAvatar: undefined,
    thumbnail:
      snippet?.thumbnails?.high?.url ||
      snippet?.thumbnails?.medium?.url ||
      snippet?.thumbnails?.default?.url ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration,
    views,
    likes,
    publishedAt: snippet?.publishedAt || new Date().toISOString(),
    category: guessCategory(snippet?.title || "", snippet?.description || ""),
    description: snippet?.description || "",
  };
}

/**
 * Fetch the user's liked videos. YouTube exposes these via the special "LL"
 * playlist id. We need a second /videos call to get durations & view counts
 * because playlistItems only returns snippet + contentDetails.videoId.
 */
export async function getLikedVideos(
  accessToken: string,
  maxResults = 50
): Promise<VideoItem[]> {
  const data = await ytFetch(
    `/playlistItems?part=snippet,contentDetails&playlistId=LL&maxResults=${Math.min(maxResults, 50)}`,
    accessToken
  );
  const items: any[] = data.items || [];
  if (items.length === 0) return [];

  const videoIds = items
    .map((i) => i.contentDetails?.videoId)
    .filter(Boolean)
    .slice(0, 50) as string[];
  if (videoIds.length === 0) {
    return items.map((i) =>
      mapToVideoItem(i.snippet, i.contentDetails?.videoId || i.id, i.contentDetails)
    );
  }

  const videosData = await ytFetch(
    `/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}`,
    accessToken
  );
  const videoMap = new Map<string, any>();
  for (const v of videosData.items || []) videoMap.set(v.id, v);

  return items
    .map((i) => {
      const vid = i.contentDetails?.videoId;
      const v = vid ? videoMap.get(vid) : undefined;
      if (v) return mapToVideoItem(v.snippet, v.id, v.contentDetails, v.statistics);
      return mapToVideoItem(i.snippet, vid || i.id, i.contentDetails);
    })
    .filter(Boolean) as VideoItem[];
}

/** Fetch the user's own playlists (NOT including the LL/likes pseudo-playlist). */
export async function getPlaylists(
  accessToken: string,
  maxResults = 50
): Promise<YouTubePlaylist[]> {
  const data = await ytFetch(
    `/playlists?part=snippet,contentDetails&mine=true&maxResults=${Math.min(maxResults, 50)}`,
    accessToken
  );
  return (data.items || []).map((p: any) => ({
    id: p.id,
    title: p.snippet?.title || "Untitled",
    description: p.snippet?.description || "",
    itemCount: p.contentDetails?.itemCount || 0,
    thumbnail:
      p.snippet?.thumbnails?.high?.url ||
      p.snippet?.thumbnails?.medium?.url ||
      p.snippet?.thumbnails?.default?.url ||
      "",
    videoIds: [],
  }));
}

/** Fetch the user's channel subscriptions (used for personalization signals). */
export async function getSubscriptions(
  accessToken: string,
  maxResults = 50
): Promise<YouTubeSubscription[]> {
  const data = await ytFetch(
    `/subscriptions?part=snippet&mine=true&maxResults=${Math.min(maxResults, 50)}`,
    accessToken
  );
  return (data.items || []).map((s: any) => ({
    channelId: s.snippet?.resourceId?.channelId || "",
    title: s.snippet?.title || "Unknown channel",
    thumbnail:
      s.snippet?.thumbnails?.high?.url ||
      s.snippet?.thumbnails?.default?.url ||
      "",
  }));
}

/**
 * Fetch recommendation-style videos based on the user's subscription feed.
 * Uses /activities?mine=true to pick up recent uploads from subscribed
 * channels, then enriches with /videos for duration + view counts.
 */
export async function getRecommendedVideos(
  accessToken: string,
  maxResults = 12
): Promise<VideoItem[]> {
  const activitiesData = await ytFetch(
    `/activities?part=snippet,contentDetails&mine=true&maxResults=${Math.min(maxResults * 3, 50)}`,
    accessToken
  );
  const videoIds: string[] = [];
  for (const a of activitiesData.items || []) {
    const vid = a.contentDetails?.upload?.videoId;
    if (vid) videoIds.push(vid);
  }
  const uniqueIds = Array.from(new Set(videoIds)).slice(0, 50);
  if (uniqueIds.length === 0) return [];

  const videosData = await ytFetch(
    `/videos?part=snippet,contentDetails,statistics&id=${uniqueIds.join(",")}`,
    accessToken
  );
  return (videosData.items || []).map((v: any) =>
    mapToVideoItem(v.snippet, v.id, v.contentDetails, v.statistics)
  );
}

/** Fetch the user's own YouTube channel info (avatar, subscriber count). */
export async function getChannelInfo(
  accessToken: string
): Promise<YouTubeChannelInfo | null> {
  const data = await ytFetch(
    `/channels?part=snippet,statistics&mine=true`,
    accessToken
  );
  const ch = data.items?.[0];
  if (!ch) return null;
  return {
    id: ch.id,
    title: ch.snippet?.title || "YouTube User",
    avatar:
      ch.snippet?.thumbnails?.high?.url ||
      ch.snippet?.thumbnails?.medium?.url ||
      ch.snippet?.thumbnails?.default?.url ||
      "",
    subscriberCount: parseInt(ch.statistics?.subscriberCount || "0", 10),
  };
}
