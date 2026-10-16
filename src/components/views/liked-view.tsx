"use client";

import * as React from "react";
import { ThumbsUp, Trash2 } from "lucide-react";
import { useLibraryStore } from "@/store/use-library-store";
import { useAppStore } from "@/store/use-app-store";
import { VideoCard } from "@/components/video-card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function LikedView() {
  const liked = useLibraryStore((s) => s.liked);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const items = Object.values(liked);

  return (
    <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <ThumbsUp className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Liked videos</h1>
          <p className="text-xs text-muted-foreground">{items.length} videos</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center mb-4">
            <ThumbsUp className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium">No liked videos yet</p>
          <p className="text-sm text-muted-foreground mt-1">Tap the 👍 on any video to save it here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((v) => (
            <div key={v.youtubeId} className="relative group">
              <VideoCard video={v} variant="list" />
              <button
                onClick={() => { toggleLike(v); toast("Removed from Liked"); }}
                className="absolute top-1/2 -translate-y-1/2 right-2 h-8 w-8 rounded-full bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-accent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
