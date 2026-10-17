import { NextRequest, NextResponse } from "next/server";
import { relatedInvidious } from "@/lib/invidious";
import { fetchRelated } from "@/lib/video-search";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET(req: NextRequest) {
  const youtubeId = req.nextUrl.searchParams.get("youtubeId") || "";
  const title = req.nextUrl.searchParams.get("title") || "";
  const category = (req.nextUrl.searchParams.get("category") || "All") as Category;
  if (!youtubeId) return NextResponse.json({ items: [] });
  try {
    let items = await relatedInvidious(youtubeId, category).catch(() => []);
    if (items.length === 0) {
      items = await fetchRelated({ youtubeId, title, category }).catch(() => []);
    }
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
