import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const playlists = await db.playlist.findMany({
    orderBy: { updatedAt: "desc" },
    include: { items: { orderBy: { addedAt: "desc" } } },
  });
  return NextResponse.json({
    items: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      videoIds: p.items.map((i) => i.youtubeId),
      videos: p.items.map((i) => ({
        id: i.youtubeId,
        youtubeId: i.youtubeId,
        title: i.title,
        channel: i.channel,
        thumbnail: i.thumbnail,
        duration: i.duration,
        category: "All",
        views: 0,
        likes: 0,
        publishedAt: i.addedAt.toISOString(),
        description: "",
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action || "create";

  if (action === "create") {
    const item = await db.playlist.create({
      data: { name: body.name || "New Playlist", description: body.description || "" },
    });
    return NextResponse.json({ item: { ...item, videoIds: [], videos: [], createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() } });
  }

  if (action === "addVideo") {
    const existing = await db.playlistItem.findFirst({
      where: { playlistId: body.playlistId, youtubeId: body.youtubeId },
    });
    if (existing) return NextResponse.json({ ok: true, exists: true });
    await db.playlistItem.create({
      data: {
        playlistId: body.playlistId,
        youtubeId: body.youtubeId,
        title: body.title || "Untitled",
        channel: body.channel || "Unknown",
        thumbnail: body.thumbnail || "",
        duration: body.duration || 0,
      },
    });
    await db.playlist.update({ where: { id: body.playlistId }, data: { updatedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  if (action === "removeVideo") {
    await db.playlistItem.deleteMany({ where: { playlistId: body.playlistId, youtubeId: body.youtubeId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    await db.playlist.delete({ where: { id } }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
