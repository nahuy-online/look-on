import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await db.history.findMany({ orderBy: { watchedAt: "desc" }, take: 200 });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // upsert by youtubeId — update watchedAt + progress
  const existing = await db.history.findFirst({ where: { youtubeId: body.youtubeId } });
  let item;
  if (existing) {
    item = await db.history.update({
      where: { id: existing.id },
      data: {
        title: body.title ?? existing.title,
        channel: body.channel ?? existing.channel,
        thumbnail: body.thumbnail ?? existing.thumbnail,
        duration: body.duration ?? existing.duration,
        category: body.category ?? existing.category,
        progress: body.progress ?? existing.progress,
        watchedAt: new Date(),
      },
    });
  } else {
    item = await db.history.create({
      data: {
        youtubeId: body.youtubeId,
        title: body.title || "Untitled",
        channel: body.channel || "Unknown",
        thumbnail: body.thumbnail || "",
        duration: body.duration || 0,
        category: body.category || "All",
        progress: body.progress || 0,
      },
    });
  }
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id === "all") {
    await db.history.deleteMany({});
    return NextResponse.json({ ok: true });
  }
  if (id) {
    await db.history.delete({ where: { id } });
  }
  return NextResponse.json({ ok: true });
}
