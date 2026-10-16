import { NextRequest, NextResponse } from "next/server";
import { fetchRelated } from "@/lib/video-search";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const youtubeId = req.nextUrl.searchParams.get("youtubeId") || "";
  const title = req.nextUrl.searchParams.get("title") || "";
  const category = (req.nextUrl.searchParams.get("category") || "All") as Category;
  if (!youtubeId) return NextResponse.json({ items: [] });
  try {
    const items = await fetchRelated({ youtubeId, title, category });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
