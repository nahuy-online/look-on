import { useState } from "react";
import { Search, Menu, ShieldCheck, ShieldAlert } from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useVpnStore } from "@/store/use-vpn-store";
import { cn } from "@/lib/utils";

export function Header() {
  const setSearch = useAppStore((s) => s.setSearch);
  const setMobileSidebarOpen = useAppStore((s) => s.setMobileSidebarOpen);
  const setView = useAppStore((s) => s.setView);
  const vpnStatus = useVpnStore((s) => s.status);
  const vpnServer = useVpnStore((s) => s.server);
  const exitIp = useVpnStore((s) => s.exitIp);
  const [q, setQ] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setSearch(q.trim());
  };

  return (
    <header className="flex items-center gap-2 px-3 py-2 border-b border-border bg-[rgb(var(--card))]/40 backdrop-blur"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
      <button
        className="md:hidden p-2 rounded-md hover:bg-accent"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        onClick={() => setView("home")}
        className="flex items-center gap-2 font-bold text-emerald-400"
      >
        <span className="text-lg">▶</span>
        <span className="hidden sm:inline">PureTuber VPN</span>
      </button>

      <form onSubmit={submit} className="flex-1 max-w-2xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search videos…"
            className="w-full rounded-full bg-[rgb(var(--secondary))] border border-border pl-10 pr-4 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </form>

      <button
        onClick={() => setView("vpn")}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border",
          vpnStatus === "connected"
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            : vpnStatus === "connecting"
            ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
            : "border-border text-muted-foreground"
        )}
        title={exitIp ? `Exit IP: ${exitIp}` : "VPN disconnected"}
      >
        {vpnStatus === "connected" ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <ShieldAlert className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">
          {vpnStatus === "connected"
            ? `${vpnServer.flag} ${vpnServer.city}`
            : vpnStatus === "connecting"
            ? "Connecting…"
            : "Unprotected"}
        </span>
      </button>
    </header>
  );
}
