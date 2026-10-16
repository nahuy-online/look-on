// Formatting helpers — copied from the web app and kept client-safe.
// Source: /home/z/my-project/src/lib/format.ts

export function formatViews(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const week = Math.floor(day / 7);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);
  if (year >= 1) return `${year} year${year > 1 ? "s" : ""} ago`;
  if (month >= 1) return `${month} month${month > 1 ? "s" : ""} ago`;
  if (week >= 1) return `${week} week${week > 1 ? "s" : ""} ago`;
  if (day >= 1) return `${day} day${day > 1 ? "s" : ""} ago`;
  if (hr >= 1) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  if (min >= 1) return `${min} minute${min > 1 ? "s" : ""} ago`;
  return "just now";
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1_000_000) return (bytesPerSec / 1_000_000).toFixed(1) + " MB/s";
  if (bytesPerSec >= 1_000) return (bytesPerSec / 1_000).toFixed(0) + " KB/s";
  return bytesPerSec.toFixed(0) + " B/s";
}

export function formatData(bytes: number): string {
  if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(2) + " GB";
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
  if (bytes >= 1_000) return (bytes / 1_000).toFixed(0) + " KB";
  return bytes + " B";
}

export function formatSession(ms: number | null): string {
  if (!ms) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function seededRand(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function thumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

export function channelAvatar(seed: string): string {
  const encoded = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encoded}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`;
}

export function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/
  );
  return m ? m[1] : null;
}
