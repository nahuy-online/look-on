import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { getRecommendedVideos, YouTubeApiError } from "@/lib/youtube-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/recommendations
 *
 * Returns recent uploads from the channels the user is subscribed to, fetched
 * via the YouTube Data API activities endpoint. Used to power the
 * "Recommended for you" section on the home view with real, personalized data
 * when the user is signed in.
 *
 * Response shape:
 *   200 — { items: VideoItem[], source: "youtube", personalized: true }
 *   401 — not authenticated
 *   4xx/5xx — { error: string }
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.accessToken) {
    return NextResponse.json(
      { error: "Unauthorized — sign in with YouTube first." },
      { status: 401 }
    );
  }

  try {
    const items = await getRecommendedVideos(session.accessToken, 12);
    return NextResponse.json({
      items,
      source: "youtube",
      personalized: true,
    });
  } catch (e: unknown) {
    if (e instanceof YouTubeApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Failed to fetch recommendations";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
