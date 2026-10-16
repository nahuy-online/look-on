import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { thumbnailUrl } from "@/lib/format";
import type { VideoItem, Category } from "@/lib/types";
import { CURATED_VIDEOS, curatedByCategory } from "@/lib/videos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cat = (req.nextUrl.searchParams.get("category") || "All") as Category;
  try {
    // Use curated content as the base (instant, always works, no network calls).
    // Invidious + web-search are available in the search/recommendations routes.
    let items: VideoItem[] = curatedByCategory(cat);

    // Inject promoted videos at their configured positions.
    const promotedRows = await db.promotedVideo
      .findMany({
        where: { active: true, OR: [{ category: "All" }, ...(cat !== "All" ? [{ category: cat }] : [])] },
        orderBy: { position: "asc" },
      })
      .catch(() => []);

    if (promotedRows.length > 0) {
      const promotedItems: VideoItem[] = promotedRows.map((r) => ({
        id: r.youtubeId,
        youtubeId: r.youtubeId,
        title: r.title,
        channel: r.channel,
        thumbnail: r.thumbnail || thumbnailUrl(r.youtubeId),
        duration: r.duration,
        views: 0,
        likes: 0,
        publishedAt: r.createdAt.toISOString(),
        category: cat,
        description: "",
        promoted: true,
        promotedLabel: r.label,
      }));

      // remove promoted youtubeIds already present in the organic feed (avoid dupes)
      const promotedIds = new Set(promotedItems.map((p) => p.youtubeId));
      let feed = items.filter((v) => !promotedIds.has(v.youtubeId));

      // insert each promoted video at its position (1-indexed), shifting the rest down
      for (const p of promotedItems) {
        const pos = Math.max(1, Math.min(promotedRows.find((r) => r.youtubeId === p.youtubeId)?.position ?? 3, feed.length + 1));
        feed.splice(pos - 1, 0, p);
      }
      items = feed;
    }

    return NextResponse.json({ items, source: "curated" });
  } catch (e) {
    return NextResponse.json({ items: CURATED_VIDEOS.slice(0, 8), error: (e as Error).message }, { status: 200 });
  }
}
