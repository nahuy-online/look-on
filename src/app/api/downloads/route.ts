import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await db.download.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const existing = await db.download.findFirst({ where: { youtubeId: body.youtubeId } });
  if (existing) {
    return NextResponse.json({ item: existing });
  }
  const item = await db.download.create({
    data: {
      youtubeId: body.youtubeId,
      title: body.title || "Untitled",
      channel: body.channel || "Unknown",
      thumbnail: body.thumbnail || "",
      duration: body.duration || 0,
      quality: body.quality || "1080p",
      sizeMb: body.sizeMb || 0,
      progress: 0,
      status: "queued",
    },
  });
  return NextResponse.json({ item });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const item = await db.download.update({
    where: { id },
    data: {
      progress: body.progress,
      status: body.status,
      sizeMb: body.sizeMb,
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id === "all") {
    await db.download.deleteMany({});
    return NextResponse.json({ ok: true });
  }
  if (id) {
    await db.download.delete({ where: { id } }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
