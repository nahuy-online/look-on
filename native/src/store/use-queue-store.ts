// Queue store — identical to the web app (no IPC needed; pure client state).

import { create } from "zustand";
import type { VideoItem } from "@/lib/types";

interface QueueState {
  queue: VideoItem[];
  current: VideoItem | null;
  history: VideoItem[];
  isOpen: boolean;

  addToQueue: (v: VideoItem) => void;
  playNext: (v: VideoItem) => void;
  playNow: (v: VideoItem) => void;
  removeFromQueue: (youtubeId: string) => void;
  clearQueue: () => void;
  jumpTo: (index: number) => VideoItem | null;
  next: () => VideoItem | null;
  previous: () => VideoItem | null;
  toggleOpen: (v?: boolean) => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  current: null,
  history: [],
  isOpen: false,

  addToQueue: (v) => {
    if (get().queue.some((q) => q.youtubeId === v.youtubeId)) return;
    if (get().current?.youtubeId === v.youtubeId) return;
    set({ queue: [...get().queue, v] });
  },
  playNext: (v) => {
    if (get().queue.some((q) => q.youtubeId === v.youtubeId)) {
      set({ queue: get().queue.filter((q) => q.youtubeId !== v.youtubeId) });
    }
    if (get().current?.youtubeId === v.youtubeId) return;
    set({ queue: [v, ...get().queue] });
  },
  playNow: (v) => {
    const cur = get().current;
    const newHistory = cur ? [cur, ...get().history].slice(0, 50) : get().history;
    set({
      current: v,
      history: newHistory,
      queue: get().queue.filter((q) => q.youtubeId !== v.youtubeId),
    });
  },
  removeFromQueue: (youtubeId) => {
    set({ queue: get().queue.filter((q) => q.youtubeId !== youtubeId) });
  },
  clearQueue: () => set({ queue: [] }),
  jumpTo: (index) => {
    const q = get().queue;
    if (index < 0 || index >= q.length) return null;
    const cur = get().current;
    const target = q[index];
    const rest = q.filter((_, i) => i !== index);
    const newHistory = cur ? [cur, ...get().history].slice(0, 50) : get().history;
    set({ current: target, history: newHistory, queue: rest });
    return target;
  },
  next: () => {
    const q = get().queue;
    if (q.length === 0) return null;
    return get().jumpTo(0);
  },
  previous: () => {
    const h = get().history;
    if (h.length === 0) return null;
    const cur = get().current;
    const prev = h[0];
    const newQueue = cur ? [cur, ...get().queue] : get().queue;
    set({ current: prev, history: h.slice(1), queue: newQueue });
    return prev;
  },
  toggleOpen: (v) => set({ isOpen: v === undefined ? !get().isOpen : v }),
}));
