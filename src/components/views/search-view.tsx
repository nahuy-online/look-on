"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useT } from "@/store/use-i18n-store";
import { useApi } from "@/hooks/use-api";
import { VideoGrid } from "@/components/video-grid";
import type { VideoItem } from "@/lib/types";

export function SearchView() {
  const t = useT();
  const query = useAppStore((s) => s.searchQuery);
  const setSearch = useAppStore((s) => s.setSearch);
  const [q, setQ] = React.useState(query);

  React.useEffect(() => { setQ(query); }, [query]);

  const url = query ? `/api/search?q=${encodeURIComponent(query)}` : null;
  const { data, loading } = useApi<{ items: VideoItem[] }>(url, [query]);

  return (
    <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <Search className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">
            {query ? <>{t("common.resultsFor")} <span className="text-emerald-600 dark:text-emerald-400">“{query}”</span></> : t("common.searchTitle")}
          </h1>
          <p className="text-xs text-muted-foreground">{data?.items?.length ?? 0} {t("common.videosFound")}</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) setSearch(q.trim()); }}
        className="flex items-center h-10 rounded-full border border-border bg-muted/60 focus-within:border-emerald-500/60 px-4 mb-5 max-w-xl"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.searchAgain")}
          className="flex-1 bg-transparent outline-none px-3 text-sm"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      <VideoGrid items={data?.items ?? []} loading={loading} emptyMessage={`${t("common.noResults")} “${query}”`} />
    </div>
  );
}
