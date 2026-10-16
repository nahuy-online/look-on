import { NextRequest, NextResponse } from "next/server";
import { fetchTrendingInvidious } from "@/lib/invidious";
import { fetchTrending } from "@/lib/video-search";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET(req: NextRequest) {
  const cat = (req.nextUrl.searchParams.get("category") || "All") as Category;
  try {
    // try Invidious first (real ad-free data), fall back to web-search + curated
    let items = await fetchTrendingInvidious(cat).catch(() => []);
    if (items.length === 0) {
      items = await fetchTrending(cat).catch(() => []);
    }
    return NextResponse.json({ items, source: items.length > 0 ? "invidious" : "curated" });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
