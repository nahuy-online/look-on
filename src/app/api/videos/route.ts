import { NextRequest, NextResponse } from "next/server";
import { fetchTrending } from "@/lib/video-search";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cat = (req.nextUrl.searchParams.get("category") || "All") as Category;
  try {
    const items = await fetchTrending(cat);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500 });
  }
}
