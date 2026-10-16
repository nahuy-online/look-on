"use client";

import * as React from "react";
import { Sidebar } from "./layout/sidebar";
import { Header } from "./layout/header";
import { QueuePanel } from "./queue-panel";
import { LoginDialog } from "./login-dialog";
import { useAppStore } from "@/store/use-app-store";
import { useLibraryStore } from "@/store/use-library-store";
import { useVpnStore } from "@/store/use-vpn-store";
import { useT } from "@/store/use-i18n-store";
import { HomeView } from "./views/home-view";
import { WatchView } from "./views/watch-view";
import { SearchView } from "./views/search-view";
import { VpnView } from "./views/vpn-view";
import { DownloadsView } from "./views/downloads-view";
import { HistoryView } from "./views/history-view";
import { LikedView } from "./views/liked-view";
import { PlaylistsView } from "./views/playlists-view";
import { SettingsView } from "./views/settings-view";

export function AppShell() {
  const t = useT();
  const view = useAppStore((s) => s.view);
  const loadAll = useLibraryStore((s) => s.loadAll);
  const vpnTick = useVpnStore((s) => s.tick);
  const vpnStatus = useVpnStore((s) => s.status);
  const [loginOpen, setLoginOpen] = React.useState(false);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  React.useEffect(() => {
    if (vpnStatus !== "connected") return;
    const t = setInterval(() => vpnTick(), 1000);
    return () => clearInterval(t);
  }, [vpnStatus, vpnTick]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1 w-full">
        <Sidebar />
        <div className="flex-1 min-w-0 lg:pl-60 flex flex-col">
          <Header onOpenLogin={() => setLoginOpen(true)} />
          <main className="flex-1 w-full relative">
            {view === "home" && <HomeView onOpenLogin={() => setLoginOpen(true)} />}
            {view === "watch" && <WatchView />}
            {view === "search" && <SearchView />}
            {view === "vpn" && <VpnView />}
            {view === "downloads" && <DownloadsView />}
            {view === "history" && <HistoryView />}
            {view === "liked" && <LikedView />}
            {view === "playlists" && <PlaylistsView />}
            {view === "settings" && <SettingsView onOpenLogin={() => setLoginOpen(true)} />}
            <QueuePanel />
          </main>
          <Footer />
        </div>
      </div>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

function Footer() {
  const t = useT();
  return (
    <footer className="mt-auto border-t border-border bg-sidebar/40">
      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-white"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" /></svg>
            </div>
            <span className="font-semibold text-foreground">PureTuber VPN</span>
            <span className="text-muted-foreground/60">·</span>
            <span>{t("home.adBlockOn")} · VPN · {t("home.offlineDownloads")}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("home.adBlockOn")}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("watch.backgroundPlay")}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("login.stayAnonymous")}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-4 text-center sm:text-left">
          © {new Date().getFullYear()} PureTuber VPN. {t("common.youTubeEmbedNote")}
        </p>
      </div>
    </footer>
  );
}
