"use client";

import * as React from "react";
import { Flame, Shield, Download, Zap, Tv, Sparkles, RefreshCw, LogIn } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useVpnStore } from "@/store/use-vpn-store";
import { useT } from "@/store/use-i18n-store";
import { useAuthStore } from "@/store/use-auth-store";
import { useApi } from "@/hooks/use-api";
import { VideoGrid } from "@/components/video-grid";
import { VideoCard } from "@/components/video-card";
import { CATEGORIES, type Category, type VideoItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CURATED_VIDEOS } from "@/lib/videos";
import { Button } from "@/components/ui/button";

export function HomeView({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const t = useT();
  const category = useAppStore((s) => s.activeCategory);
  const setCategory = useAppStore((s) => s.setCategory);
  const vpnStatus = useVpnStore((s) => s.status);
  const setView = useAppStore((s) => s.setView);
  const user = useAuthStore((s) => s.user);

  const url = `/api/videos?category=${encodeURIComponent(category)}`;
  const { data, loading } = useApi<{ items: VideoItem[] }>(url, [category]);
  const items = data?.items ?? (loading ? CURATED_VIDEOS : []);

  // recommendations (separate fetch — uses Invidious Popular + history-based personalization)
  const recUrl = user ? `/api/recommendations?userId=${encodeURIComponent(user.id)}&limit=8` : `/api/recommendations?limit=8`;
  const { data: recData, loading: recLoading, refetch: refetchRecs } = useApi<{ items: VideoItem[]; personalized: boolean; topCategories: string[] }>(recUrl, [user?.id]);
  const recs = recData?.items ?? [];

  return (
    <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
      {/* hero banner */}
      <div className="relative overflow-hidden rounded-2xl mb-5 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 p-6 sm:p-8 text-white">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-20 bottom-0 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full text-[11px] font-semibold mb-3">
              <Flame className="h-3.5 w-3.5" /> {t("home.trending")}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{t("home.heroTitle")}</h1>
            <p className="text-white/80 text-sm mt-2">{t("home.heroDesc")}</p>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button
                onClick={() => setView("vpn")}
                className="inline-flex items-center gap-1.5 bg-white text-emerald-700 font-semibold text-sm px-4 h-9 rounded-full hover:bg-white/90 transition"
              >
                <Zap className="h-4 w-4" />
                {vpnStatus === "connected" ? t("home.vpnConnected") : t("home.enableVpn")}
              </button>
              <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur text-white text-xs font-medium px-3 h-9 rounded-full">
                <Shield className="h-3.5 w-3.5" /> {t("home.adBlockOn")}
              </span>
              <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur text-white text-xs font-medium px-3 h-9 rounded-full">
                <Download className="h-3.5 w-3.5" /> {t("home.offlineDownloads")}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex shrink-0">
            <div className="h-24 w-24 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Tv className="h-12 w-12" />
            </div>
          </div>
        </div>
      </div>

      {/* recommendations section */}
      <section className="mb-7">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-semibold">
              {user ? t("home.recommendedForYou") : t("home.popular")}
            </h2>
            {user && (
              <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                {t("home.synced")}
              </span>
            )}
            {!user && recData?.personalized && (
              <span className="text-[11px] text-muted-foreground">{t("home.basedOnHistory")}</span>
            )}
          </div>
          <button
            onClick={() => refetchRecs()}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-accent"
            title={t("home.updatingFeed")}
          >
            <RefreshCw className={cn("h-4 w-4", recLoading && "animate-spin")} />
          </button>
        </div>
        {recLoading && recs.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video rounded-xl bg-muted" />
                <div className="h-3 bg-muted rounded w-3/4 mt-2" />
              </div>
            ))}
          </div>
        ) : recs.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-5">
            {recs.slice(0, 8).map((v) => (
              <VideoCard key={v.youtubeId} video={v} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">{t("home.signInForRecs")}</p>
            {!user && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => onOpenLogin?.()}>
                <LogIn className="h-4 w-4" /> {t("header.signIn")}
              </Button>
            )}
          </div>
        )}
      </section>

      {/* category chips */}
      <div className="sticky top-16 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/85 backdrop-blur-xl mb-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "shrink-0 h-8 px-3.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                category === c
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {t("cat." + c)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">
          {category === "All" ? t("home.recommended") : t("cat." + category)}
        </h2>
        {loading && <span className="text-xs text-muted-foreground animate-pulse">{t("home.updatingFeed")}</span>}
      </div>

      <VideoGrid items={items} loading={loading && items.length === 0} />
    </div>
  );
}
