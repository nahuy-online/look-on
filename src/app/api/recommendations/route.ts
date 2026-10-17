import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { VideoItem, Category } from "@/lib/types";
import { CURATED_VIDEOS } from "@/lib/videos";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

// Recommendations engine — lightweight version (no Invidious calls to avoid timeouts).
// Uses curated content + history-based personalization.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "8"), 12);

  try {
    // Compute user's top categories from local history
    const history = await db.history.findMany({ take: 50, orderBy: { watchedAt: "desc" } }).catch(() => []);
    const catCounts: Record<string, number> = {};
    for (const h of history) {
      const c = h.category || "All";
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
    const topCats = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([c]) => c)
      .filter((c) => c && c !== "All");

    // Build recommendations from curated content
    let items: VideoItem[] = [...CURATED_VIDEOS];

    // If user has watched certain categories, prioritize those
    if (topCats.length > 0) {
      const prioritized = items.filter((v) => topCats.includes(v.category));
      const rest = items.filter((v) => !topCats.includes(v.category));
      items = [...prioritized, ...rest];
    }

    // Shuffle slightly for variety when logged in
    if (userId) {
      // deterministic shuffle based on userId + date
      const seed = (userId + new Date().toDateString()).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      items = items.sort((a, b) => {
        const ha = (a.youtubeId.charCodeAt(0) + seed) % 7;
        const hb = (b.youtubeId.charCodeAt(0) + seed) % 7;
        return ha - hb;
      });
    }

    const result = items.slice(0, limit);
    return NextResponse.json({
      items: result,
      personalized: topCats.length > 0,
      topCategories: topCats,
      loggedIn: !!userId,
    });
  } catch (e) {
    return NextResponse.json(
      { items: CURATED_VIDEOS.slice(0, 6), personalized: false, error: (e as Error).message },
      { status: 200 }
    );
  }
}
