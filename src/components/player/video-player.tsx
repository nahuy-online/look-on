"use client";

import * as React from "react";
import { Shield, ShieldOff, Volume2, PictureInPicture2, Loader2 } from "lucide-react";
import { useVpnStore } from "@/store/use-vpn-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VideoPlayerProps {
  youtubeId: string;
  title: string;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export function VideoPlayer({ youtubeId, title, onProgress, onEnded }: VideoPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<any>(null);
  const [ready, setReady] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const vpnStatus = useVpnStore((s) => s.status);
  const adBlock = useVpnStore((s) => s.settings.adBlock);

  React.useEffect(() => {
    let mounted = true;
    let progressTimer: ReturnType<typeof setInterval> | undefined;
    setReady(false);
    loadYouTubeAPI().then(() => {
      if (!mounted || !containerRef.current) return;
      // clear any previous player
      containerRef.current.innerHTML = "";
      const div = document.createElement("div");
      containerRef.current.appendChild(div);
      try {
        playerRef.current = new window.YT.Player(div, {
          videoId: youtubeId,
          playerVars: {
            autoplay: 1,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: any) => {
              setReady(true);
              try { e.target.playVideo(); } catch {}
            },
            onStateChange: (e: any) => {
              if (e.data === 0) onEnded?.();
            },
            onError: () => {
              setBlocked(true);
            },
          },
        });
      } catch {
        setBlocked(true);
      }
      progressTimer = setInterval(() => {
        try {
          if (playerRef.current?.getCurrentTime) {
            onProgress?.(Math.floor(playerRef.current.getCurrentTime()));
          }
        } catch {}
      }, 3000);
    });
    return () => {
      mounted = false;
      if (progressTimer) clearInterval(progressTimer);
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
    };
  }, [youtubeId]);

  const handlePiP = async () => {
    try {
      const iframe = containerRef.current?.querySelector("iframe");
      if (iframe && (document as any).pictureInPictureEnabled) {
        const video = iframe.contentWindow?.document.querySelector("video");
        if (video) {
          await (video as any).requestPictureInPicture();
          return;
        }
      }
      toast.info("Picture-in-Picture", { description: "Starting PiP via the player controls (use the ▭ button in the video)." });
    } catch {
      toast.info("Picture-in-Picture", { description: "Use the ▭ button inside the video player." });
    }
  };

  const handleBg = () => {
    try {
      const v = playerRef.current;
      if (!v) return;
      if (v.getPlayerState?.() === 1) v.pauseVideo();
      else v.playVideo();
    } catch {}
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden group">
      {/* ad-free + VPN banner */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="flex items-center gap-1 bg-emerald-600 text-white text-[11px] font-semibold px-2 py-1 rounded-md shadow">
          <Shield className="h-3 w-3" /> Ad-free
        </span>
        {vpnStatus === "connected" ? (
          <span className="flex items-center gap-1 bg-black/60 backdrop-blur text-emerald-300 text-[11px] font-semibold px-2 py-1 rounded-md">
            <Shield className="h-3 w-3" /> VPN
          </span>
        ) : (
          <span className="flex items-center gap-1 bg-amber-500/90 text-white text-[11px] font-semibold px-2 py-1 rounded-md">
            <ShieldOff className="h-3 w-3" /> No VPN
          </span>
        )}
      </div>

      {/* player actions (PiP / bg-play) */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleBg}
          className="h-8 w-8 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center hover:bg-black/80"
          title="Background play"
        >
          <Volume2 className="h-4 w-4" />
        </button>
        <button
          onClick={handlePiP}
          className="h-8 w-8 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center hover:bg-black/80"
          title="Picture-in-picture"
        >
          <PictureInPicture2 className="h-4 w-4" />
        </button>
      </div>

      {!ready && !blocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      )}

      {blocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 text-center px-6">
          <ShieldOff className="h-10 w-10 text-amber-400 mb-3" />
          <p className="text-white font-semibold">This video is restricted in your region</p>
          <p className="text-white/60 text-sm mt-1 max-w-sm">
            Connect the built-in VPN to a different country server to unblock this content.
          </p>
        </div>
      )}

      <div ref={containerRef} className={cn("w-full h-full", blocked && "hidden")} />
    </div>
  );
}
