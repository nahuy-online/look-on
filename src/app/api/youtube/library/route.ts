import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import {
  getLikedVideos,
  getPlaylists,
  YouTubeApiError,
} from "@/lib/youtube-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/library
 *
 * Returns the authenticated user's liked videos + playlists, fetched live
 * from the YouTube Data API using their OAuth access token.
 *
 * Response shape:
 *   200 — { liked: VideoItem[], playlists: YouTubePlaylist[], source: "youtube" }
 *   401 — not authenticated (no NextAuth session / no access token)
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
    // Run both fetches in parallel; degrade gracefully if either fails.
    const [liked, playlists] = await Promise.all([
      getLikedVideos(session.accessToken).catch((e) => {
        if (e instanceof YouTubeApiError && e.status === 401) throw e;
        return [];
      }),
      getPlaylists(session.accessToken).catch((e) => {
        if (e instanceof YouTubeApiError && e.status === 401) throw e;
        return [];
      }),
    ]);

    return NextResponse.json({
      liked,
      playlists,
      source: "youtube",
    });
  } catch (e: unknown) {
    if (e instanceof YouTubeApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Failed to sync library";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
