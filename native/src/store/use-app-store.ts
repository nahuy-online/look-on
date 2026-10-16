// SPA navigation state (no router — mirrors the web app's Zustand view-state pattern).

import { create } from "zustand";
import type { View, VideoItem, Category } from "@/lib/types";

interface AppState {
  view: View;
  activeVideo: VideoItem | null;
  searchQuery: string;
  activeCategory: Category;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;

  setView: (v: View) => void;
  watch: (v: VideoItem) => void;
  setSearch: (q: string) => void;
  setCategory: (c: Category) => void;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  goHome: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "home",
  activeVideo: null,
  searchQuery: "",
  activeCategory: "All",
  sidebarOpen: true,
  mobileSidebarOpen: false,

  setView: (v) => set({ view: v, mobileSidebarOpen: false }),
  watch: (v) => set({ view: "watch", activeVideo: v, mobileSidebarOpen: false }),
  setSearch: (q) => set({ searchQuery: q, view: "search", mobileSidebarOpen: false }),
  setCategory: (c) => set({ activeCategory: c }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  goHome: () => set({ view: "home", activeVideo: null, mobileSidebarOpen: false }),
}));
