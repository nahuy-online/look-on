import type { Comment } from "./types";
import { seededRand } from "./format";

const AUTHORS = [
  "Alex Rivera", "Jamie Chen", "Sam Okafor", "Priya Nair", "Marco Rossi",
  "Yuki Tanaka", "Emma Schmidt", "Liam Walsh", "Noor Haddad", "Sofia Garcia",
  "Daniel Park", "Ava Müller", "Kofi Mensah", "Lena Novak", "Diego Costa",
  "Mei Lin", "Hassan Ali", "Clara Dubois", "Tom Becker", "Ravi Kumar",
];

const TEMPLATES = [
  "This hits different at 2am 😭🔥",
  "PureTuber's ad-free experience makes this so much better. No interruptions!",
  "Who's here in {year}? Still a masterpiece.",
  "The quality with VPN unlocked is insane. Thank you!",
  "Can't believe this is free with no ads. Subscribed.",
  "Played this on loop all day, can't stop 🎧",
  "Background play while working = productivity unlocked.",
  "Downloaded for my flight tomorrow. Offline mode is a lifesaver ✈️",
  "The algorithm finally did something right.",
  "Underrated comment, but the production here is top tier.",
  "My whole playlist is just this on repeat lol",
  "Came for the thumbnail, stayed for the masterpiece.",
  "0:47 is my favorite part, anyone else?",
  "VPN + ad-free = the only way to watch. Period.",
  "This deserves way more views. Sharing with everyone.",
];

export function generateComments(videoId: string): Comment[] {
  const rand = seededRand(videoId + "comments");
  const count = 6 + Math.floor(rand() * 5);
  const year = 2024 + Math.floor(rand() * 2);
  const out: Comment[] = [];
  for (let i = 0; i < count; i++) {
    const author = AUTHORS[Math.floor(rand() * AUTHORS.length)];
    const text = TEMPLATES[Math.floor(rand() * TEMPLATES.length)].replace("{year}", String(year));
    const mins = Math.floor(rand() * 59);
    const hrs = Math.floor(rand() * 23);
    const days = Math.floor(rand() * 30);
    const timeAgo = days > 0 ? `${days}d` : hrs > 0 ? `${hrs}h` : `${mins}m`;
    out.push({
      id: `${videoId}-c${i}`,
      author,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(author)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`,
      text,
      likes: Math.floor(rand() * 4200),
      timeAgo,
      pinned: i === 0,
    });
  }
  return out;
}
