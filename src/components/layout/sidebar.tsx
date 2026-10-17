"use client";

import * as React from "react";
import {
  Home, Shield, Download, Clock, ThumbsUp, ListVideo, Settings,
  ShieldCheck, Music, Gamepad2, Cpu, Newspaper, Trophy, GraduationCap,
  Plane, UtensilsCrossed, Film, X, Zap,
} from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useVpnStore } from "@/store/use-vpn-store";
import { useLibraryStore } from "@/store/use-library-store";
import { useT } from "@/store/use-i18n-store";
import { CATEGORIES, type Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV = [
  { id: "home", key: "nav.home", icon: Home },
  { id: "vpn", key: "nav.vpn", icon: Shield },
  { id: "downloads", key: "nav.downloads", icon: Download },
  { id: "history", key: "nav.history", icon: Clock },
  { id: "liked", key: "nav.liked", icon: ThumbsUp },
  { id: "playlists", key: "nav.playlists", icon: ListVideo },
  { id: "settings", key: "nav.settings", icon: Settings },
] as const;

const CATEGORY_ICONS: Record<Category, any> = {
  All: Film, Music: Music, Gaming: Gamepad2, Tech: Cpu, News: Newspaper,
  Sports: Trophy, Education: GraduationCap, Entertainment: Film,
  Travel: Plane, Cooking: UtensilsCrossed,
};

export function Sidebar() {
  const t = useT();
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const activeCategory = useAppStore((s) => s.activeCategory);
  const setCategory = useAppStore((s) => s.setCategory);
  const goHome = useAppStore((s) => s.goHome);
  const mobileOpen = useAppStore((s) => s.mobileSidebarOpen);
  const setMobileOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const vpnStatus = useVpnStore((s) => s.status);
  const downloadsCount = useLibraryStore((s) => s.downloads.length);
  const likedCount = Object.keys(useLibraryStore((s) => s.liked)).length;

  const selectCategory = (c: Category) => {
    setCategory(c);
    goHome();
    setMobileOpen(false);
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* brand */}
      <button
        onClick={goHome}
        className="flex items-center gap-2.5 px-4 h-16 shrink-0"
      >
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <PlayIcon className="h-5 w-5 text-white" />
        </div>
        <div className="text-left leading-none">
          <div className="font-bold text-[15px] tracking-tight">PureTuber</div>
          <div className="text-[10px] text-emerald-500 font-semibold tracking-wider">VPN BUILT-IN</div>
        </div>
      </button>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 space-y-0.5">
        {NAV.map((item) => {
          const active = view === item.id;
          const Icon = item.icon;
          const badge =
            item.id === "downloads" ? downloadsCount :
            item.id === "liked" ? likedCount : 0;
          return (
            <button
              key={item.id}
              onClick={() => { setView(item.id as any); setMobileOpen(false); }}
              className={cn(
                "w-full flex items-center gap-4 px-3 h-10 rounded-lg text-sm transition-colors",
                active
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 text-left">{t(item.key)}</span>
              {item.id === "vpn" && vpnStatus === "connected" && (
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
              )}
              {badge > 0 && (
                <span className="text-[10px] bg-muted-foreground/15 text-muted-foreground rounded-full px-1.5 py-0.5 min-w-5 text-center">
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="pt-4 pb-1 px-3 text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          {t("nav.categories")}
        </div>
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c];
          const active = activeCategory === c;
          return (
            <button
              key={c}
              onClick={() => selectCategory(c)}
              className={cn(
                "w-full flex items-center gap-4 px-3 h-9 rounded-lg text-sm transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 text-left">{t("cat." + c)}</span>
            </button>
          );
        })}

        <div className="pt-4 px-3">
          <button
            onClick={() => { setView("vpn"); setMobileOpen(false); }}
            className="w-full rounded-xl p-3 bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-left shadow-lg shadow-emerald-500/20 hover:opacity-95 transition"
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Zap className="h-4 w-4" /> {t("nav.quickConnect")}
            </div>
            <p className="text-[11px] text-white/80 mt-1">
              {vpnStatus === "connected" ? t("nav.quickConnectProtected") : t("nav.quickConnectDesc")}
            </p>
          </button>
        </div>
      </nav>
    </div>
  );

  return (
    <>
      {/* desktop */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-border bg-sidebar flex-col fixed inset-y-0 left-0 z-30">
        {content}
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-sidebar border-r border-border shadow-2xl flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 h-9 w-9 rounded-full flex items-center justify-center hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}
