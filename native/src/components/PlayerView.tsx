import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";

/**
 * Native ExoPlayer host component.
 *
 * Renders a placeholder `<div>` whose bounding rect is reported to the native
 * plugin so the ExoPlayer `PlayerView` overlay can be positioned on top of it.
 * All playback control (play / pause / seek / speed / load) is delegated to
 * the `*` Tauri commands, which call ExoPlayer's
 * `setPlayWhenReady` / `setPlaybackParameters` directly via JNI.
 *
 * **THE FIX for the Obereg play/pause bug**: play/pause never touches
 * JavaScript in a WebView — `setPlayWhenReady(true/false)` is a native
 * ExoPlayer method, called synchronously from Rust.
 *
 * On non-Android (web/desktop dev), the plugin commands are no-ops and the
 * parent component should render an HTML5 `<video>` fallback instead.
 */
export interface PlayerViewHandle {
  load: (url: string, headers: Record<string, string>, audioUrl?: string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  getPosition: () => Promise<number>;
  getDuration: () => Promise<number>;
  release: () => Promise<void>;
}

interface PlayerViewProps {
  /** Unique DOM id for the placeholder div. Defaults to "lookon-player-host". */
  id?: string;
  /** Optional className applied to the placeholder div. */
  className?: string;
  /** Called once the player has been initialised (after `player_init` resolves). */
  onReady?: () => void;
  /** Called when the native player fails to initialise (e.g. on web/desktop). */
  onError?: (err: string) => void;
}

const PLAYER_PREFIX = "";

/** True when we're running inside Tauri on Android (ExoPlayer available). */
function isAndroidPlayerAvailable(): boolean {
  if (typeof window === "undefined") return false;
  // The `__TAURI_INTERNALS__` global is set by Tauri 2 on every platform; the
  // Android-only check uses the user-agent (set by the Tauri WebView).
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  return !!((window as any).__TAURI_INTERNALS__) && /android/i.test(ua);
}

export function PlayerView({
  id = "lookon-player-host",
  className = "",
  onReady,
  onError,
}: PlayerViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // ---------- viewport reporting ----------
  //
  // The native PlayerView overlay is positioned in device pixels relative to
  // the Activity's content view. We measure the placeholder div with
  // getBoundingClientRect and report (x, y, width, height) on mount, on
  // resize, and on scroll. The device-pixel ratio is applied so the values
  // match Android's pixel coordinate system.

  const reportViewport = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    void invoke(`${PLAYER_PREFIX}player_set_viewport`, {
      x: rect.left * dpr,
      y: rect.top * dpr,
      width: rect.width * dpr,
      height: rect.height * dpr,
    }).catch(() => {
      /* non-Android: command is a no-op */
    });
  }, []);

  // ---------- lifecycle ----------

  useEffect(() => {
    if (!isAndroidPlayerAvailable()) {
      onError?.("ExoPlayer not available on this platform (web/desktop)");
      return;
    }
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) setLoading(true); });
    invoke(`${PLAYER_PREFIX}player_init`)
      .then(() => {
        if (cancelled) return;
        setReady(true);
        setLoading(false);
        reportViewport();
        onReady?.();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoading(false);
        onError?.(String(e));
      });

    // Resize listener — re-reports the viewport when the layout changes.
    const ro = new ResizeObserver(() => reportViewport());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", reportViewport);
    window.addEventListener("scroll", reportViewport, true);

    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener("resize", reportViewport);
      window.removeEventListener("scroll", reportViewport, true);
      void invoke(`${PLAYER_PREFIX}player_release`).catch(() => {});
    };
  }, []);

  // Re-report the viewport whenever `ready` flips (the native side needs to
  // attach the overlay first; the first report might have been dropped).
  useEffect(() => {
    if (ready) reportViewport();
  }, [ready, reportViewport]);

  return (
    <div
      ref={containerRef}
      id={id}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {/* The native PlayerView overlay renders ON TOP of this div.
          The placeholder just reserves the space + shows a loader. */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-black pointer-events-none">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Initialising player…
        </div>
      )}
    </div>
  );
}

/**
 * Hook that exposes the imperative player API. Pass a ref to a `<PlayerView>`
 * and call `load()`, `play()`, `pause()`, `seekTo()`, `setSpeed()`.
 *
 * All methods are thin wrappers around `invoke("*")`. The
 * commands are no-ops on non-Android, so callers can call them unconditionally
 * and fall back to an HTML5 `<video>` element when `isAndroidPlayerAvailable()`
 * returns false.
 */
export function usePlayerCommands() {
  const load = useCallback(
    async (url: string, headers: Record<string, string>, audioUrl?: string) => {
      await invoke(`${PLAYER_PREFIX}player_load`, { url, headers, audioUrl: audioUrl ?? null });
    },
    [],
  );
  const play = useCallback(async () => {
    await invoke(`${PLAYER_PREFIX}player_play`);
  }, []);
  const pause = useCallback(async () => {
    await invoke(`${PLAYER_PREFIX}player_pause`);
  }, []);
  const seekTo = useCallback(async (positionMs: number) => {
    await invoke(`${PLAYER_PREFIX}player_seek_to`, { positionMs });
  }, []);
  const setSpeed = useCallback(async (speed: number) => {
    await invoke(`${PLAYER_PREFIX}player_set_speed`, { speed });
  }, []);
  const getPosition = useCallback(async (): Promise<number> => {
    return await invoke<number>(`${PLAYER_PREFIX}player_get_position`);
  }, []);
  const getDuration = useCallback(async (): Promise<number> => {
    return await invoke<number>(`${PLAYER_PREFIX}player_get_duration`);
  }, []);
  const release = useCallback(async () => {
    await invoke(`${PLAYER_PREFIX}player_release`);
  }, []);

  return { load, play, pause, seekTo, setSpeed, getPosition, getDuration, release };
}
