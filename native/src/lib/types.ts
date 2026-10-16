// Shared domain types for PureTuber VPN (Tauri native client).
// Mirrors /home/z/my-project/src/lib/types.ts.

export type Category =
  | "All"
  | "Music"
  | "Gaming"
  | "Tech"
  | "News"
  | "Sports"
  | "Education"
  | "Entertainment"
  | "Travel"
  | "Cooking";

export const CATEGORIES: Category[] = [
  "All",
  "Music",
  "Gaming",
  "Tech",
  "News",
  "Sports",
  "Education",
  "Entertainment",
  "Travel",
  "Cooking",
];

export interface VideoItem {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  thumbnail: string;
  duration: number;
  views: number;
  likes: number;
  publishedAt: string;
  category: Category;
  description: string;
  curated?: boolean;
}

export interface StreamFormat {
  url: string;
  quality: string; // qualityLabel or audioQuality
  mimeType: string;
  container: string;
  bitrate: number;
  /** "video" | "audio" */
  kind: "video" | "audio";
}

export interface StreamInfo {
  youtubeId: string;
  title: string;
  duration: number;
  thumbnail: string;
  formats: StreamFormat[];
  /** Best combined (muxed) URL for the native <video> player, if available. */
  bestStreamUrl: string | null;
  /** Optional hls playlist URL (Invidious sometimes provides one). */
  hlsUrl: string | null;
}

export interface DownloadItem {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  quality: string;
  sizeMb: number;
  progress: number;
  status: "queued" | "downloading" | "paused" | "completed" | "failed";
  createdAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  videoIds: string[];
  videos: VideoItem[];
  createdAt: string;
  updatedAt: string;
}

export type View =
  | "home"
  | "watch"
  | "search"
  | "vpn"
  | "downloads"
  | "history"
  | "liked"
  | "playlists"
  | "settings";

export interface VpnServer {
  id: string;
  country: string;
  countryCode: string;
  city: string;
  flag: string;
  ping: number;
  load: number;
  premium: boolean;
  servers: number;
}

export type VpnProtocol = "WireGuard" | "OpenVPN" | "IKEv2";

export type VpnStatus = "disconnected" | "connecting" | "connected";

export interface VpnLiveStats {
  downloadSpeed: number; // bytes/s
  uploadSpeed: number; // bytes/s
  dataDownloaded: number; // bytes
  dataUploaded: number; // bytes
  sessionStart: number | null; // ms epoch
  exitIp: string;
}

export interface VpnStatusResponse {
  status: VpnStatus;
  serverId: string | null;
  exitIp: string;
  downloadSpeed: number;
  uploadSpeed: number;
  dataDownloaded: number;
  dataUploaded: number;
  sessionStart: number | null;
  /** True when the underlying VPN backend is the Android VpnService (real) vs simulated. */
  real: boolean;
}

export interface VpnSettings {
  autoConnect: boolean;
  killSwitch: boolean;
  splitTunneling: boolean;
  protocol: VpnProtocol;
  adBlock: boolean;
  trackerBlock: boolean;
}
