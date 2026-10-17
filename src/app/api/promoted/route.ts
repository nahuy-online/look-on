import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { thumbnailUrl } from "@/lib/format";
import type { VideoItem, Category } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET — list all promoted videos (optionally filter by active + category)
export async function GET(req: NextRequest) {
  const onlyActive = req.nextUrl.searchParams.get("active") !== "false";
  const category = req.nextUrl.searchParams.get("category");
  const where: any = {};
  if (onlyActive) where.active = true;
  if (category) where.category = category;

  const rows = await db.promotedVideo.findMany({
    where,
    orderBy: { position: "asc" },
  });

  const items: VideoItem[] = rows.map((r) => ({
    id: r.youtubeId,
    youtubeId: r.youtubeId,
    title: r.title,
    channel: r.channel,
    thumbnail: r.thumbnail || thumbnailUrl(r.youtubeId),
    duration: r.duration,
    views: 0,
    likes: 0,
    publishedAt: r.createdAt.toISOString(),
    category: (r.category as Category) || "All",
    description: "",
    promoted: true,
    promotedLabel: r.label,
  }));

  // also return the raw rows for admin (includes id, position, active)
  return NextResponse.json({
    items,
    rows: rows.map((r) => ({
      id: r.id,
      youtubeId: r.youtubeId,
      title: r.title,
      channel: r.channel,
      thumbnail: r.thumbnail,
      duration: r.duration,
      position: r.position,
      label: r.label,
      category: r.category,
      active: r.active,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// POST — create a promoted video
export async function POST(req: NextRequest) {
  const body = await req.json();
  const youtubeId = (body.youtubeId || "").trim();
  if (!youtubeId) {
    return NextResponse.json({ error: "youtubeId required" }, { status: 400 });
  }

  // Use provided values; thumbnail defaults to YouTube's hqdefault
  const title = body.title || `Video ${youtubeId}`;
  const channel = body.channel || "Unknown channel";
  const thumbnail = body.thumbnail || thumbnailUrl(youtubeId);
  const duration = body.duration || 0;

  const row = await db.promotedVideo.create({
    data: {
      youtubeId,
      title,
      channel,
      thumbnail,
      duration,
      position: body.position ? parseInt(body.position) : 3,
      label: body.label || "Promoted",
      category: body.category || "All",
      active: body.active !== false,
    },
  });
  return NextResponse.json({ row });
}

// PATCH — update position/label/active
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: any = {};
  if (body.position !== undefined) data.position = parseInt(body.position);
  if (body.label !== undefined) data.label = body.label;
  if (body.category !== undefined) data.category = body.category;
  if (body.active !== undefined) data.active = !!body.active;
  const row = await db.promotedVideo.update({ where: { id }, data });
  return NextResponse.json({ row });
}

// DELETE — remove a promoted video
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id === "all") {
    await db.promotedVideo.deleteMany({});
    return NextResponse.json({ ok: true });
  }
  if (id) {
    await db.promotedVideo.delete({ where: { id } }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
