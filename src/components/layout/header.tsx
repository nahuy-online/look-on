"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Search, Menu, Sun, Moon, Shield, ShieldCheck, X, Mic, ListVideo, LogIn, User } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useVpnStore } from "@/store/use-vpn-store";
import { useQueueStore } from "@/store/use-queue-store";
import { useT } from "@/store/use-i18n-store";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function Header({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const t = useT();
  const setMobileOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const setSearch = useAppStore((s) => s.setSearch);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const { user } = useAuth();
  const [q, setQ] = React.useState(searchQuery);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) setSearch(q.trim());
  };

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-border bg-background/85 backdrop-blur-xl flex items-center gap-2 px-3 sm:px-4">
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden h-10 w-10 rounded-full flex items-center justify-center hover:bg-accent"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <form onSubmit={submit} className="flex-1 max-w-2xl mx-auto flex items-center">
        <div className="flex-1 flex items-center h-10 rounded-full border border-border bg-muted/60 focus-within:bg-background focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/20 transition px-4">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("header.search")}
            className="flex-1 bg-transparent outline-none px-3 text-sm placeholder:text-muted-foreground"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="ml-2 hidden sm:flex h-10 w-10 rounded-full bg-muted/60 items-center justify-center hover:bg-accent"
          aria-label={t("header.voiceSearch")}
          onClick={() => toast.info(t("header.voiceSearch"), { description: t("header.voiceSearchDesc") })}
        >
          <Mic className="h-4 w-4" />
        </button>
      </form>

      <div className="flex items-center gap-1.5">
        <VpnPill />
        <QueueButton />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label={t("header.toggleTheme")}
        >
          {mounted && theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        {user ? (
          <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-emerald-500/40 shrink-0" title={user.name}>
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <button
            onClick={() => onOpenLogin?.()}
            className="h-9 px-3 rounded-full flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0"
            aria-label={t("header.signIn")}
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">{t("header.signIn")}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function VpnPill() {
  const t = useT();
  const vpnStatus = useVpnStore((s) => s.status);
  const vpnServer = useVpnStore((s) => s.server);
  const setView = useAppStore((s) => s.setView);

  const connected = vpnStatus === "connected";
  const connecting = vpnStatus === "connecting";

  return (
    <button
      onClick={() => setView("vpn")}
      className={cn(
        "flex items-center gap-2 h-9 px-3 rounded-full border text-xs font-semibold transition-all",
        connected
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : connecting
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-border bg-muted/60 text-muted-foreground hover:bg-accent"
      )}
      title={t("nav.vpn")}
    >
      {connecting ? (
        <span className="relative inline-flex">
          <Shield className="h-4 w-4" />
        </span>
      ) : connected ? (
        <ShieldCheck className="h-4 w-4" />
      ) : (
        <Shield className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {connecting ? t("header.connecting") : connected ? `${vpnServer.flag} ${vpnServer.city}` : t("header.vpnOff")}
      </span>
      {connecting && (
        <span className="hidden sm:inline h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
      {connected && <span className="hidden sm:inline h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
    </button>
  );
}

function QueueButton() {
  const t = useT();
  const toggleOpen = useQueueStore((s) => s.toggleOpen);
  const queueSize = useQueueStore((s) => s.queue.length);
  return (
    <button
      onClick={() => toggleOpen()}
      className="relative h-10 w-10 rounded-full flex items-center justify-center hover:bg-accent"
      aria-label={t("header.openQueue")}
    >
      <ListVideo className="h-5 w-5" />
      {queueSize > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
          {queueSize > 9 ? "9+" : queueSize}
        </span>
      )}
    </button>
  );
}
