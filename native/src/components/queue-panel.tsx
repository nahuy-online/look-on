import * as React from "react";
import { ListVideo, X, Trash2, Play, ChevronUp, ChevronDown } from "lucide-react";
import { useQueueStore } from "@/store/use-queue-store";
import { useAppStore } from "@/store/use-app-store";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function QueuePanel() {
  const isOpen = useQueueStore((s) => s.isOpen);
  const toggleOpen = useQueueStore((s) => s.toggleOpen);
  const queue = useQueueStore((s) => s.queue);
  const current = useQueueStore((s) => s.current);
  const history = useQueueStore((s) => s.history);
  const removeFromQueue = useQueueStore((s) => s.removeFromQueue);
  const clearQueue = useQueueStore((s) => s.clearQueue);
  const jumpTo = useQueueStore((s) => s.jumpTo);
  const next = useQueueStore((s) => s.next);
  const previous = useQueueStore((s) => s.previous);
  const watch = useAppStore((s) => s.watch);

  const playItem = (index: number) => {
    const v = jumpTo(index);
    if (v) { watch(v); toast(`Playing: ${v.title.slice(0, 40)}`); }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => toggleOpen(false)} />
      <aside className="fixed md:absolute right-0 top-0 bottom-0 z-50 w-full sm:w-96 bg-[rgb(var(--card))] border-l border-border shadow-2xl flex flex-col">
        <header className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <ListVideo className="h-5 w-5 text-emerald-500" />
            <h2 className="font-semibold text-sm">Queue</h2>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{queue.length}</span>
          </div>
          <div className="flex items-center gap-1">
            {queue.length > 0 && (
              <button className="h-8 px-3 text-xs text-muted-foreground hover:bg-accent rounded-full flex items-center gap-1" onClick={() => { clearQueue(); toast("Queue cleared"); }}>
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
            )}
            <button onClick={() => toggleOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {current && (
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold mb-2 px-1">Now playing</div>
              <div className="flex gap-2.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="relative w-24 shrink-0 aspect-video rounded-md overflow-hidden bg-muted">
                  <img src={current.thumbnail} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                      <span className="h-0 w-0 border-y-4 border-y-transparent border-l-[6px] border-l-white ml-0.5" />
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-medium line-clamp-2">{current.title}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{current.channel}</p>
                </div>
              </div>
              <div className="flex gap-1 mt-2">
                <button className="flex-1 h-7 text-xs border border-border rounded-md flex items-center justify-center gap-1 hover:bg-accent disabled:opacity-40" onClick={() => { const v = previous(); if (v) { watch(v); toast("Previous"); } }} disabled={history.length === 0}>
                  <ChevronUp className="h-3.5 w-3.5" /> Prev
                </button>
                <button className="flex-1 h-7 text-xs border border-border rounded-md flex items-center justify-center gap-1 hover:bg-accent disabled:opacity-40" onClick={() => { const v = next(); if (v) { watch(v); toast("Next"); } }} disabled={queue.length === 0}>
                  <ChevronDown className="h-3.5 w-3.5" /> Next
                </button>
              </div>
            </div>
          )}

          {queue.length > 0 && (
            <div className="px-3 pb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">Up next ({queue.length})</div>
              <div className="space-y-0.5">
                {queue.map((v, i) => (
                  <div key={v.youtubeId} className="group flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/60">
                    <span className="w-5 text-center text-[11px] text-muted-foreground font-medium shrink-0">{i + 1}</span>
                    <button onClick={() => playItem(i)} className="relative w-20 shrink-0 aspect-video rounded-md overflow-hidden bg-muted">
                      <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                      <span className="absolute bottom-0.5 right-0.5 bg-black/85 text-white text-[9px] px-1 rounded">{formatDuration(v.duration)}</span>
                    </button>
                    <button onClick={() => playItem(i)} className="flex-1 min-w-0 text-left">
                      <h3 className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors">{v.title}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{v.channel}</p>
                    </button>
                    <button onClick={() => { removeFromQueue(v.youtubeId); toast("Removed from queue"); }} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="px-3 pb-6 border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 px-1">Recently played</div>
              <div className="space-y-0.5">
                {history.slice(0, 10).map((v, i) => (
                  <button key={i} onClick={() => watch(v)} className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/60 text-left">
                    <div className="relative w-16 shrink-0 aspect-video rounded-md overflow-hidden bg-muted">
                      <img src={v.thumbnail} alt="" className="w-full h-full object-cover opacity-70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[11px] font-medium line-clamp-1">{v.title}</h3>
                      <p className="text-[10px] text-muted-foreground">{v.channel}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {queue.length === 0 && !current && history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center mb-3">
                <ListVideo className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Queue is empty</p>
              <p className="text-xs text-muted-foreground mt-1">Tap "Add to queue" on any video to build your playlist.</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
