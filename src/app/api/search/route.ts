import { NextRequest, NextResponse } from "next/server";
import { fetchSearch } from "@/lib/video-search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ items: [] });
  try {
    const items = await fetchSearch(q.trim());
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
