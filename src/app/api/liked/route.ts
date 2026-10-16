import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await db.likedVideo.findMany({ orderBy: { likedAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const existing = await db.likedVideo.findUnique({ where: { youtubeId: body.youtubeId } });
  if (existing) return NextResponse.json({ item: existing, liked: true });
  const item = await db.likedVideo.create({
    data: {
      youtubeId: body.youtubeId,
      title: body.title || "Untitled",
      channel: body.channel || "Unknown",
      thumbnail: body.thumbnail || "",
      duration: body.duration || 0,
      category: body.category || "All",
    },
  });
  return NextResponse.json({ item, liked: true });
}

export async function DELETE(req: NextRequest) {
  const youtubeId = req.nextUrl.searchParams.get("youtubeId");
  if (youtubeId) {
    await db.likedVideo.delete({ where: { youtubeId } }).catch(() => {});
  }
  return NextResponse.json({ ok: true, liked: false });
}
