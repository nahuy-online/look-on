"use client";

import * as React from "react";
import {
  Shield, ShieldOff, Volume2, PictureInPicture2, Loader2, Gauge, SkipForward,
} from "lucide-react";
import { useVpnStore } from "@/store/use-vpn-store";
import { useQueueStore } from "@/store/use-queue-store";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export function VideoPlayer({ youtubeId, title, onProgress, onEnded }: VideoPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<any>(null);
  const [ready, setReady] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const [availableRates, setAvailableRates] = React.useState<number[]>([]);
  const vpnStatus = useVpnStore((s) => s.status);
  const queueNext = useQueueStore((s) => s.next);
  const queueSize = useQueueStore((s) => s.queue.length);
  const onEndedRef = React.useRef(onEnded);
  React.useEffect(() => { onEndedRef.current = onEnded; });

  React.useEffect(() => {
    let mounted = true;
    let progressTimer: ReturnType<typeof setInterval> | undefined;
    setReady(false);
    setBlocked(false);
    loadYouTubeAPI().then(() => {
      if (!mounted || !containerRef.current) return;
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
              try {
                const rates = e.target.getAvailablePlaybackRates?.();
                if (Array.isArray(rates) && rates.length) setAvailableRates(rates);
                e.target.setPlaybackRate(speed);
                e.target.playVideo();
              } catch {}
            },
            onStateChange: (e: any) => {
              if (e.data === 0) {
                // auto-advance queue if present, else onEnded
                if (queueSize > 0) queueNext();
                else onEndedRef.current?.();
              }
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

  // apply speed when changed
  const applySpeed = (rate: number) => {
    setSpeed(rate);
    try {
      playerRef.current?.setPlaybackRate?.(rate);
      toast.success(`Speed: ${rate}×`, { duration: 1200 });
    } catch {}
  };

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
      toast.info("Picture-in-Picture", { description: "Use the ▭ button inside the video player." });
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

  const handleSkipNext = () => {
    if (queueSize > 0) {
      queueNext();
      toast("Playing next from queue");
    }
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
        {speed !== 1 && (
          <span className="flex items-center gap-1 bg-purple-600 text-white text-[11px] font-semibold px-2 py-1 rounded-md shadow">
            <Gauge className="h-3 w-3" /> {speed}×
          </span>
        )}
      </div>

      {/* player actions (speed / PiP / bg-play / skip) */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {queueSize > 0 && (
          <button
            onClick={handleSkipNext}
            className="h-8 w-8 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center hover:bg-black/80"
            title="Play next in queue"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-8 px-2.5 min-w-[3rem] rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center gap-1 hover:bg-black/80 text-xs font-semibold"
              title="Playback speed"
            >
              <Gauge className="h-4 w-4" /> {speed}×
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuLabel className="text-xs">Playback speed</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SPEEDS.map((r) => (
              <DropdownMenuItem
                key={r}
                onClick={() => applySpeed(r)}
                className={cn("justify-between", r === speed && "bg-accent text-emerald-600 dark:text-emerald-400 font-semibold")}
              >
                <span>{r}×</span>
                {r === speed && <span className="text-[10px]">●</span>}
                {availableRates.length > 0 && !availableRates.includes(r) && r > 2 && (
                  <span className="text-[9px] text-amber-500" title="Available in native app">▲</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
