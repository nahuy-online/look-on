import { useState } from "react";
import { Settings as SettingsIcon, Info, Trash2, Shield } from "lucide-react";
import { useVpnStore } from "@/store/use-vpn-store";
import { useLibraryStore } from "@/store/use-library-store";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const vpnSettings = useVpnStore((s) => s.settings);
  const updateVpn = useVpnStore((s) => s.updateSettings);
  const clearHistory = useLibraryStore((s) => s.clearHistory);
  const clearDownloads = useLibraryStore((s) => s.clearDownloads);

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [defaultQuality, setDefaultQuality] = useState("1080p");

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon className="h-5 w-5 text-emerald-400" />
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Playback */}
      <Section title="Playback">
        <Row label="Default playback speed">
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="bg-[rgb(var(--secondary))] border border-border rounded-md px-2 py-1 text-sm"
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </Row>
        <Row label="Default quality">
          <select
            value={defaultQuality}
            onChange={(e) => setDefaultQuality(e.target.value)}
            className="bg-[rgb(var(--secondary))] border border-border rounded-md px-2 py-1 text-sm"
          >
            {["360p", "480p", "720p", "1080p", "1440p", "2160p"].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      {/* VPN */}
      <Section title="VPN" icon={<Shield className="h-4 w-4" />}>
        <ToggleRow
          label="Auto-connect on launch"
          on={vpnSettings.autoConnect}
          onToggle={(v) => updateVpn({ autoConnect: v })}
        />
        <ToggleRow
          label="Kill switch"
          on={vpnSettings.killSwitch}
          onToggle={(v) => updateVpn({ killSwitch: v })}
        />
        <ToggleRow
          label="Split tunneling"
          on={vpnSettings.splitTunneling}
          onToggle={(v) => updateVpn({ splitTunneling: v })}
        />
        <ToggleRow
          label="Ad block"
          on={vpnSettings.adBlock}
          onToggle={(v) => updateVpn({ adBlock: v })}
        />
        <ToggleRow
          label="Tracker block"
          on={vpnSettings.trackerBlock}
          onToggle={(v) => updateVpn({ trackerBlock: v })}
        />
      </Section>

      {/* Privacy */}
      <Section title="Privacy">
        <button
          onClick={() => void clearHistory()}
          className="flex items-center gap-2 text-sm text-destructive hover:underline"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear watch history
        </button>
        <button
          onClick={() => void clearDownloads()}
          className="flex items-center gap-2 text-sm text-destructive hover:underline"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear downloads
        </button>
      </Section>

      {/* About */}
      <Section title="About" icon={<Info className="h-4 w-4" />}>
        <Row label="App name">
          <span className="text-sm">PureTuber VPN</span>
        </Row>
        <Row label="Version">
          <span className="text-sm">0.1.0 (Tauri 2.0)</span>
        </Row>
        <Row label="Backend">
          <span className="text-sm">Rust + Invidious + WireGuard</span>
        </Row>
        <Row label="Platforms">
          <span className="text-sm">Android, iOS, Windows</span>
        </Row>
        <p className="mt-3 text-xs text-muted-foreground">
          This is a Tauri 2.0 scaffold. The Rust backend fetches video metadata
          from Invidious public instances and the native{" "}
          <code>&lt;video&gt;</code> element plays direct stream URLs for true
          ad-free playback up to 3× speed. The WireGuard integration runs on
          Android via <code>VpnService</code>; on other platforms it falls back
          to simulated mode.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {icon}
        {title}
      </h2>
      <div className="rounded-lg bg-[rgb(var(--card))] border border-border p-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
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
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white"
          style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
        />
      </button>
    </div>
  );
}
