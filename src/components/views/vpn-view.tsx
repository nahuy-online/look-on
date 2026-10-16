"use client";

import * as React from "react";
import {
  Shield, ShieldCheck, Power, Zap, Search, Crown, Activity, ArrowDown, ArrowUp,
  Globe, Lock, ChevronRight, Wifi,
} from "lucide-react";
import { useVpnStore } from "@/store/use-vpn-store";
import { VPN_SERVERS } from "@/lib/vpn-servers";
import { useApi } from "@/hooks/use-api";
import { formatSpeed, formatData } from "@/lib/format";
import type { VpnServer } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function VpnView() {
  const status = useVpnStore((s) => s.status);
  const server = useVpnStore((s) => s.server);
  const exitIp = useVpnStore((s) => s.exitIp);
  const connect = useVpnStore((s) => s.connect);
  const disconnect = useVpnStore((s) => s.disconnect);
  const selectServer = useVpnStore((s) => s.selectServer);
  const quickConnect = useVpnStore((s) => s.quickConnect);
  const settings = useVpnStore((s) => s.settings);
  const updateSettings = useVpnStore((s) => s.updateSettings);
  const dl = useVpnStore((s) => s.downloadSpeed);
  const up = useVpnStore((s) => s.uploadSpeed);
  const dataDl = useVpnStore((s) => s.dataDownloaded);
  const dataUp = useVpnStore((s) => s.dataUploaded);
  const sessionStart = useVpnStore((s) => s.sessionStart);
  const [query, setQuery] = React.useState("");
  const [premiumOnly, setPremiumOnly] = React.useState<"all" | "free" | "premium">("all");

  const elapsed = useElapsed(sessionStart);
  const connected = status === "connected";
  const connecting = status === "connecting";

  const filtered = VPN_SERVERS.filter((s) => {
    const q = query.toLowerCase();
    const matches = !q || s.country.toLowerCase().includes(q) || s.city.toLowerCase().includes(q) || s.countryCode.toLowerCase().includes(q);
    const tier = premiumOnly === "all" ? true : premiumOnly === "premium" ? s.premium : !s.premium;
    return matches && tier;
  });

  const handleToggle = () => {
    if (connected) { disconnect(); toast("VPN disconnected", { description: "You're now browsing without protection." }); }
    else { connect(); toast("Connecting to VPN…", { description: `Routing through ${server.city}` }); }
  };

  return (
    <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center transition-colors",
          connected ? "bg-emerald-500/15" : "bg-muted")}>
          <Shield className={cn("h-5 w-5", connected ? "text-emerald-500" : "text-muted-foreground")} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">VPN</h1>
          <p className="text-xs text-muted-foreground">Unblock content & stay private</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Connection card */}
        <div className="lg:col-span-2">
          <div className={cn(
            "relative overflow-hidden rounded-2xl p-6 sm:p-8 transition-colors",
            connected ? "bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 text-white"
                      : connecting ? "bg-gradient-to-br from-amber-500 to-orange-700 text-white"
                      : "bg-card border border-border"
          )}>
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                {/* power orb */}
                <button
                  onClick={handleToggle}
                  className={cn(
                    "relative h-20 w-20 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shrink-0",
                    connected ? "bg-white/20 text-white vpn-pulse" : connecting ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-500"
                  )}
                  aria-label={connected ? "Disconnect VPN" : "Connect VPN"}
                >
                  {connecting ? (
                    <span className="h-8 w-8 rounded-full border-[3px] border-white/30 border-t-white animate-spin-slow" />
                  ) : connected ? (
                    <ShieldCheck className="h-9 w-9" />
                  ) : (
                    <Power className="h-8 w-8" />
                  )}
                </button>
                <div>
                  <div className="text-xs uppercase tracking-wider opacity-80 font-semibold">
                    {connecting ? "Connecting" : connected ? "Protected" : "Not connected"}
                  </div>
                  <div className="text-2xl font-bold mt-0.5 flex items-center gap-2">
                    {server.flag} {server.city}
                  </div>
                  <div className="text-sm opacity-80 mt-0.5 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> {server.country}</span>
                    {connected && exitIp && (
                      <span className="flex items-center gap-1 font-mono"><Lock className="h-3.5 w-3.5" /> {exitIp}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                <Button
                  onClick={handleToggle}
                  className={cn(
                    "rounded-full h-11 px-6 font-semibold gap-2",
                    connected ? "bg-white text-emerald-700 hover:bg-white/90"
                      : connecting ? "bg-white/20 text-white"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  )}
                >
                  <Power className="h-4 w-4" />
                  {connecting ? "Connecting…" : connected ? "Disconnect" : "Connect"}
                </Button>
                <Button
                  onClick={() => { quickConnect(); toast.success("Quick connect", { description: "Found the fastest server" }); }}
                  variant="ghost"
                  size="sm"
                  className={cn("rounded-full gap-1.5", connected ? "text-white/90 hover:bg-white/10" : "text-muted-foreground")}
                >
                  <Zap className="h-3.5 w-3.5" /> Quick connect (fastest)
                </Button>
              </div>
            </div>

            {/* stats */}
            <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
              <Stat
                icon={<ArrowDown className="h-4 w-4" />}
                label="Download"
                value={connected ? formatSpeed(dl) : "—"}
              />
              <Stat
                icon={<ArrowUp className="h-4 w-4" />}
                label="Upload"
                value={connected ? formatSpeed(up) : "—"}
              />
              <Stat
                icon={<Activity className="h-4 w-4" />}
                label="Session"
                value={connected ? elapsed : "—"}
              />
              <Stat
                icon={<Wifi className="h-4 w-4" />}
                label="Data used"
                value={connected ? formatData(dataDl + dataUp) : "—"}
              />
            </div>
          </div>

          {/* server list */}
          <div className="mt-5 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-500" /> Servers
                <span className="text-xs text-muted-foreground font-normal">({filtered.length})</span>
              </h2>
              <div className="flex-1 flex items-center gap-2 sm:justify-end">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search country or city…"
                    className="pl-9 h-9"
                  />
                </div>
                <Select value={premiumOnly} onValueChange={(v) => setPremiumOnly(v as any)}>
                  <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tiers</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-h-[460px] overflow-y-auto scrollbar-thin divide-y divide-border">
              {filtered.map((s) => (
                <ServerRow
                  key={s.id}
                  server={s}
                  active={server.id === s.id}
                  connected={connected}
                  onSelect={() => { selectServer(s); toast.success(`Switched to ${s.city}`, { description: `${s.country} · ${s.ping}ms` }); }}
                />
              ))}
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">No servers match “{query}”.</div>
              )}
            </div>
          </div>
        </div>

        {/* settings column */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-500" /> Security
            </h2>
            <div className="space-y-4">
              <SettingRow
                title="Auto-connect"
                desc="Connect VPN on app launch"
                checked={settings.autoConnect}
                onChange={(v) => updateSettings({ autoConnect: v })}
              />
              <SettingRow
                title="Kill switch"
                desc="Block traffic if VPN drops"
                checked={settings.killSwitch}
                onChange={(v) => updateSettings({ killSwitch: v })}
              />
              <SettingRow
                title="Split tunneling"
                desc="Let chosen apps bypass VPN"
                checked={settings.splitTunneling}
                onChange={(v) => updateSettings({ splitTunneling: v })}
              />
              <div className="space-y-1.5">
                <Label>Protocol</Label>
                <Select value={settings.protocol} onValueChange={(v) => updateSettings({ protocol: v as any })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WireGuard">WireGuard (recommended)</SelectItem>
                    <SelectItem value="OpenVPN">OpenVPN (UDP)</SelectItem>
                    <SelectItem value="IKEv2">IKEv2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Protection
            </h2>
            <div className="space-y-4">
              <SettingRow
                title="Ad blocker"
                desc="Block video & display ads"
                checked={settings.adBlock}
                onChange={(v) => updateSettings({ adBlock: v })}
              />
              <SettingRow
                title="Tracker blocker"
                desc="Stop trackers & analytics"
                checked={settings.trackerBlock}
                onChange={(v) => updateSettings({ trackerBlock: v })}
              />
            </div>
            <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
              <Shield className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Ad & tracker blocking is built into the player. When the VPN is on, your real IP is hidden and geo-restricted videos unlock automatically.</span>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white">
            <Crown className="h-6 w-6 mb-2" />
            <h3 className="font-bold">PureTuber Premium</h3>
            <p className="text-sm text-white/85 mt-1">Unlock 4K downloads, premium VPN servers in 60+ countries, and 10 simultaneous connections.</p>
            <Button className="w-full mt-3 bg-white text-orange-700 hover:bg-white/90 font-semibold" size="sm">
              Upgrade — $4.99/mo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 backdrop-blur p-3">
      <div className="flex items-center gap-1.5 text-[11px] opacity-80 font-medium">{icon}{label}</div>
      <div className="text-lg font-bold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function ServerRow({ server, active, connected, onSelect }: {
  server: VpnServer; active: boolean; connected: boolean; onSelect: () => void;
}) {
  const loadColor = server.load < 30 ? "text-emerald-500" : server.load < 60 ? "text-amber-500" : "text-red-500";
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60",
        active && "bg-emerald-500/10"
      )}
    >
      <span className="text-2xl shrink-0">{server.flag}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2 truncate">
          {server.city}
          {server.premium && <Crown className="h-3.5 w-3.5 text-amber-500" />}
        </div>
        <div className="text-xs text-muted-foreground truncate">{server.country} · {server.servers} servers</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-medium tabular-nums">{server.ping} ms</div>
        <div className={cn("text-[10px] font-medium", loadColor)}>{server.load}% load</div>
      </div>
      {active && connected && (
        <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
      )}
      {active && !connected && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

function SettingRow({ title, desc, checked, onChange }: {
  title: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-emerald-600" />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>;
}

function useElapsed(sessionStart: number | null): string {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (!sessionStart) return;
    const t = setInterval(force, 1000);
    return () => clearInterval(t);
  }, [sessionStart]);
  if (!sessionStart) return "0:00";
  const s = Math.floor((Date.now() - sessionStart) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
