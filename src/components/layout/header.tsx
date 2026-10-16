"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Search, Menu, Sun, Moon, Shield, ShieldCheck, X, Mic } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useVpnStore } from "@/store/use-vpn-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function Header() {
  const setMobileOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const setSearch = useAppStore((s) => s.setSearch);
  const setView = useAppStore((s) => s.setView);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const vpnStatus = useVpnStore((s) => s.status);
  const vpnServer = useVpnStore((s) => s.server);
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
            placeholder="Search videos, channels…"
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
          aria-label="Voice search"
          onClick={() => toast.info("Voice search", { description: "Microphone access coming soon." })}
        >
          <Mic className="h-4 w-4" />
        </button>
      </form>

      <div className="flex items-center gap-1.5">
        <VpnPill />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label="Toggle theme"
        >
          {mounted && theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
          Z
        </div>
      </div>
    </header>
  );
}

function VpnPill() {
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
      title="VPN status"
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
        {connecting ? "Connecting…" : connected ? `${vpnServer.flag} ${vpnServer.city}` : "VPN Off"}
      </span>
      {connecting && (
        <span className="hidden sm:inline h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      )}
      {connected && <span className="hidden sm:inline h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
    </button>
  );
}
