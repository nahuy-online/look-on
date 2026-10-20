import * as React from "react";

/**
 * PlayerView — placeholder div for the native ExoPlayer overlay.
 *
 * The actual ExoPlayer PlayerView is a native Android View overlaid on top
 * of the WebView by PlayerBridge.kt. This component just reports its
 * viewport (position + size) to the bridge so the overlay can track it.
 *
 * The bridge is accessed via window.lookonPlayer (registered by MainActivity).
 */

interface PlayerViewProps {
  onReady?: () => void;
  onError?: (msg: string) => void;
}

export function PlayerView({ onReady, onError }: PlayerViewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [ready, setReady] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const reportViewport = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    try {
      const bridge = (window as any).lookonPlayer;
      if (bridge) {
        bridge.setViewport(
          Math.round(rect.x * dpr),
          Math.round(rect.y * dpr),
          Math.round(rect.width * dpr),
          Math.round(rect.height * dpr)
        );
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    const bridge = (window as any).lookonPlayer;
    if (!bridge) {
      onError?.("Player bridge not available");
      return;
    }
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) setLoading(true); });
    try {
      bridge.init();
      if (!cancelled) {
        setReady(true);
        setLoading(false);
        reportViewport();
        onReady?.();
      }
    } catch (e) {
      if (!cancelled) onError?.(String(e));
    }
    return () => {
      cancelled = true;
    };
  }, [onReady, onError, reportViewport]);

  // Re-report viewport on resize/scroll
  React.useEffect(() => {
    if (!ready) return;
    const ro = new ResizeObserver(() => reportViewport());
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", reportViewport);
    window.addEventListener("scroll", reportViewport, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", reportViewport);
      window.removeEventListener("scroll", reportViewport, true);
    };
  }, [ready, reportViewport]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full bg-black"
      style={{ minHeight: "200px" }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
          Loading player…
        </div>
      )}
    </div>
  );
}
