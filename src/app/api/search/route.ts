import { NextRequest, NextResponse } from "next/server";
import { searchInvidious } from "@/lib/invidious";
import { fetchSearch } from "@/lib/video-search";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ items: [] });
  try {
    let items = await searchInvidious(q.trim()).catch(() => []);
    if (items.length === 0) {
      items = await fetchSearch(q.trim()).catch(() => []);
    }
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
