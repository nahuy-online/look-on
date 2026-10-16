import { NextRequest, NextResponse } from "next/server";
import { fetchTrendingInvidious } from "@/lib/invidious";
import { fetchTrending } from "@/lib/video-search";
import { db } from "@/lib/db";
import type { VideoItem, Category } from "@/lib/types";
import { CURATED_VIDEOS } from "@/lib/videos";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

// Recommendations engine:
// - Always: Invidious /popular (global popular feed) as a base
// - Without login: blend popular + trending + category-based from watch history
// - With login (userId present): weight by the user's most-watched categories (computed from local history which is "synced")
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "12"), 24);

  try {
    // 1. Fetch global popular from Invidious
    let popular: VideoItem[] = [];
    try {
      const { fetchFromInvidiousPublic } = await import("@/lib/invidious-public");
      popular = await fetchFromInvidiousPublic<VideoItem[]>("/api/v1/popular", "All");
    } catch {
      popular = [];
    }

    // 2. Compute user's top categories from history (works for both anon + logged-in,
    //    since history is stored locally either way)
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

    // 3. Fetch videos from top categories (personalized signal)
    let personalized: VideoItem[] = [];
    if (topCats.length > 0) {
      const sets = await Promise.all(
        topCats.slice(0, 2).map((c) =>
          fetchTrendingInvidious(c as Category).catch(() => [])
        )
      );
      personalized = sets.flat();
    }

    // 4. Also pull trending as filler
    const trending = await fetchTrendingInvidious("All").catch(() =>
      fetchTrending("All").catch(() => CURATED_VIDEOS)
    );

    // 5. Merge: personalized first (if any), then popular, then trending
    const seen = new Set<string>();
    const merged: VideoItem[] = [];
    const pushUnique = (arr: VideoItem[]) => {
      for (const v of arr) {
        if (v && !seen.has(v.youtubeId)) {
          seen.add(v.youtubeId);
          merged.push(v);
        }
      }
    };
    if (userId) {
      // logged-in: prioritize personalized
      pushUnique(personalized);
    }
    pushUnique(popular);
    pushUnique(trending);
    pushUnique(personalized);
    pushUnique(CURATED_VIDEOS);

    const result = merged.slice(0, limit);
    return NextResponse.json({
      items: result,
      personalized: topCats.length > 0,
      topCategories: topCats,
      loggedIn: !!userId,
    });
  } catch (e) {
    return NextResponse.json(
      { items: CURATED_VIDEOS.slice(0, 8), personalized: false, error: (e as Error).message },
      { status: 200 }
    );
  }
}
