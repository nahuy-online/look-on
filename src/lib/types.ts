// Shared domain types for PureTuber VPN

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
  id: string; // internal id (== youtubeId for fetched)
  youtubeId: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  thumbnail: string;
  duration: number; // seconds
  views: number;
  likes: number;
  publishedAt: string; // ISO
  category: Category;
  description: string;
  /** marks curated/seed content */
  curated?: boolean;
  /** marks a promoted/editorial pick injected into the feed */
  promoted?: boolean;
  promotedLabel?: string;
}

export interface Comment {
  id: string;
  author: string;
  avatar: string;
  text: string;
  likes: number;
  timeAgo: string;
  pinned?: boolean;
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
  progress: number; // 0..100
  status: "queued" | "downloading" | "paused" | "completed" | "failed";
  createdAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  videoIds: string[];
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
  countryCode: string; // ISO 2-letter for flag emoji
  city: string;
  flag: string; // emoji
  ping: number; // ms
  load: number; // 0..100
  premium: boolean;
  servers: number;
}

export type VpnProtocol = "WireGuard" | "OpenVPN" | "IKEv2";

export type VpnStatus = "disconnected" | "connecting" | "connected";

export interface VpnSettings {
  autoConnect: boolean;
  killSwitch: boolean;
  splitTunneling: boolean;
  protocol: VpnProtocol;
  adBlock: boolean;
  trackerBlock: boolean;
}
