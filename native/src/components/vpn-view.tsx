import { useEffect, useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Globe,
  Activity,
  Clock,
  ArrowDownUp,
  Search,
  Loader2,
} from "lucide-react";
import { useVpnStore } from "@/store/use-vpn-store";
import { VPN_SERVERS } from "@/lib/vpn-servers";
import { formatData, formatSpeed, formatSession } from "@/lib/format";
import { cn } from "@/lib/utils";

export function VpnView() {
  const status = useVpnStore((s) => s.status);
  const server = useVpnStore((s) => s.server);
  const exitIp = useVpnStore((s) => s.exitIp);
  const real = useVpnStore((s) => s.real);
  const downloadSpeed = useVpnStore((s) => s.downloadSpeed);
  const uploadSpeed = useVpnStore((s) => s.uploadSpeed);
  const dataDownloaded = useVpnStore((s) => s.dataDownloaded);
  const dataUploaded = useVpnStore((s) => s.dataUploaded);
  const sessionStart = useVpnStore((s) => s.sessionStart);
  const connect = useVpnStore((s) => s.connect);
  const disconnect = useVpnStore((s) => s.disconnect);
  const selectServer = useVpnStore((s) => s.selectServer);
  const quickConnect = useVpnStore((s) => s.quickConnect);
  const settings = useVpnStore((s) => s.settings);
  const updateSettings = useVpnStore((s) => s.updateSettings);

  const [serverQuery, setServerQuery] = useState("");
  const [now, setNow] = useState(Date.now());

  // Tick for session timer.
  useEffect(() => {
    if (status !== "connected") return;
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, [status]);

  const filteredServers = VPN_SERVERS.filter(
    (s) =>
      s.country.toLowerCase().includes(serverQuery.toLowerCase()) ||
      s.city.toLowerCase().includes(serverQuery.toLowerCase())
  );

  const sessionMs = sessionStart ? now - sessionStart : 0;

  const toggle =
    status === "disconnected"
      ? () => void connect()
      : () => void disconnect();

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-6 w-6 text-emerald-400" />
        <h1 className="text-2xl font-bold">VPN</h1>
        {!real && status === "connected" && (
          <span className="ml-auto text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Simulated mode (no Android VpnService backend detected)
          </span>
        )}
        {real && status === "connected" && (
          <span className="ml-auto text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            WireGuard tunnel active (Android VpnService)
          </span>
        )}
      </div>

      {/* Connect orb */}
      <div className="flex flex-col items-center justify-center py-6">
        <button
          onClick={toggle}
          disabled={status === "connecting"}
          className={cn(
            "relative h-44 w-44 rounded-full flex items-center justify-center text-white font-bold text-lg",
            "transition-all duration-300",
            status === "connected"
              ? "bg-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.6)]"
              : status === "connecting"
              ? "bg-amber-500 animate-pulse"
              : "bg-zinc-700 hover:bg-zinc-600",
            status === "connecting" && "vpn-pulse"
          )}
        >
          {status === "connecting" ? (
            <Loader2 className="h-10 w-10 animate-spin" />
          ) : status === "connected" ? (
            <ShieldCheck className="h-12 w-12" />
          ) : (
            <ShieldAlert className="h-12 w-12" />
          )}
        </button>
        <div className="mt-4 text-center">
          <div className="text-xl font-semibold">
            {status === "connected"
              ? "PROTECTED"
              : status === "connecting"
              ? "CONNECTING…"
              : "UNPROTECTED"}
          </div>
          <div className="text-sm text-muted-foreground">
            {status === "connected"
              ? `${server.flag} ${server.city}, ${server.country}`
              : "Tap the orb to connect"}
          </div>
        </div>
        <button
          onClick={() => void quickConnect()}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-1.5"
        >
          <Zap className="h-4 w-4" /> Quick Connect
        </button>
      </div>

      {/* Live stats */}
      {status === "connected" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat
            icon={<ArrowDownUp className="h-4 w-4" />}
            label="Download"
            value={formatSpeed(downloadSpeed)}
          />
          <Stat
            icon={<ArrowDownUp className="h-4 w-4 rotate-180" />}
            label="Upload"
            value={formatSpeed(uploadSpeed)}
          />
          <Stat
            icon={<Activity className="h-4 w-4" />}
            label="Data used"
            value={`${formatData(dataDownloaded)} / ${formatData(dataUploaded)}`}
          />
          <Stat
            icon={<Clock className="h-4 w-4" />}
            label="Session"
            value={formatSession(sessionMs)}
          />
        </div>
      )}

      {exitIp && status === "connected" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-[rgb(var(--card))] border border-border p-3 text-sm">
          <Globe className="h-4 w-4 text-emerald-400" />
          <span className="text-muted-foreground">Exit IP:</span>
          <span className="font-mono font-semibold">{exitIp}</span>
        </div>
      )}

      {/* Server list */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Servers ({filteredServers.length})</h2>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={serverQuery}
              onChange={(e) => setServerQuery(e.target.value)}
              placeholder="Search location…"
              className="w-full rounded-md bg-[rgb(var(--secondary))] border border-border pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
          {filteredServers.map((s) => {
            const active = s.id === server.id;
            return (
              <button
                key={s.id}
                onClick={() => selectServer(s)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors",
                  active
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-border hover:bg-accent/60"
                )}
              >
                <span className="text-xl">{s.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {s.city}
                    {s.premium && (
                      <span className="ml-1 text-[10px] text-amber-400 font-bold">★</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {s.country} · {s.servers} servers
                  </div>
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  <div className="text-emerald-400">{s.ping}ms</div>
                  <div>{s.load}% load</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">VPN Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Toggle
            label="Auto-connect on launch"
            on={settings.autoConnect}
            onToggle={(v) => updateSettings({ autoConnect: v })}
          />
          <Toggle
            label="Kill switch"
            on={settings.killSwitch}
            onToggle={(v) => updateSettings({ killSwitch: v })}
          />
          <Toggle
            label="Split tunneling"
            on={settings.splitTunneling}
            onToggle={(v) => updateSettings({ splitTunneling: v })}
          />
          <Toggle
            label="Ad block"
            on={settings.adBlock}
            onToggle={(v) => updateSettings({ adBlock: v })}
          />
          <Toggle
            label="Tracker block"
            on={settings.trackerBlock}
            onToggle={(v) => updateSettings({ trackerBlock: v })}
          />
        </div>
      </div>

      <div className="mt-8 text-xs text-muted-foreground border-t border-border pt-4">
        <p>
          <strong>Note:</strong> Real WireGuard tunneling requires a server
          with a peer public key + endpoint, plus your client private key. This
          scaffold generates the WireGuard config (see Rust{" "}
          <code>vpn/wireguard.rs</code>) and on Android calls into the Kotlin{" "}
          <code>VpnService</code> plugin (<code>android-plugins/wireguard</code>
          ). When no real backend is detected, the app runs in simulated mode
          for demo purposes.
        </p>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-[rgb(var(--card))] border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-mono font-semibold">{value}</div>
    </div>
  );
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-lg bg-[rgb(var(--card))] border border-border p-3 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        onClick={() => onToggle(!on)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          on ? "bg-emerald-600" : "bg-zinc-600"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            on ? "translate-x-4.5 left-0.5" : "left-0.5"
          )}
          style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
        />
      </button>
    </label>
  );
}
