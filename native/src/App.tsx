import { useEffect } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { HomeView } from "@/components/home-view";
import { WatchView } from "@/components/watch-view";
import { VpnView } from "@/components/vpn-view";
import { DownloadsView } from "@/components/downloads-view";
import { SettingsView } from "@/components/settings-view";
import { useAppStore } from "@/store/use-app-store";
import { useLibraryStore } from "@/store/use-library-store";
import { useVpnStore } from "@/store/use-vpn-store";

export default function App() {
  const view = useAppStore((s) => s.view);
  const mobileSidebarOpen = useAppStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const loadAll = useLibraryStore((s) => s.loadAll);
  const refreshStatus = useVpnStore((s) => s.refreshStatus);

  // Hydrate library from SQLite on first mount.
  useEffect(() => {
    void loadAll();
    // Pull current VPN status once (in case it's already running from a previous session).
    void refreshStatus();
  }, [loadAll, refreshStatus]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-border bg-[rgb(var(--card))]/40">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {mobileSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setMobileSidebarOpen(false)}
        >
          <aside
            className="absolute left-0 top-0 h-full w-64 bg-[rgb(var(--card))] border-r border-border p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onNavigate={() => setMobileSidebarOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {view === "home" && <HomeView />}
          {view === "watch" && <WatchView />}
          {view === "search" && <HomeView search />}
          {view === "vpn" && <VpnView />}
          {view === "downloads" && <DownloadsView />}
          {view === "history" && <DownloadsView historyMode />}
          {view === "liked" && <DownloadsView likedMode />}
          {view === "playlists" && <DownloadsView playlistsMode />}
          {view === "settings" && <SettingsView />}
        </main>
      </div>

      <Toaster theme="dark" position="top-center" richColors />
    </div>
  );
}
