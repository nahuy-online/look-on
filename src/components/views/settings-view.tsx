"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Settings, Sun, Moon, Monitor, Gauge, Film, Volume2, Shield, Database,
  Trash2, Info, Github, Heart,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/store/use-library-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AppPrefs {
  defaultQuality: string;
  playbackSpeed: string;
  autoplay: boolean;
  dataSaver: boolean;
  captions: boolean;
  miniPlayer: boolean;
}

const DEFAULT_PREFS: AppPrefs = {
  defaultQuality: "1080p",
  playbackSpeed: "1",
  autoplay: true,
  dataSaver: false,
  captions: false,
  miniPlayer: true,
};

function usePrefs() {
  const [prefs, setPrefs] = React.useState<AppPrefs>(DEFAULT_PREFS);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("puretuber-prefs");
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {}
  }, []);
  const update = (patch: Partial<AppPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try { localStorage.setItem("puretuber-prefs", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { prefs, update };
}

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const { prefs, update } = usePrefs();
  const clearDownloads = useLibraryStore((s) => s.clearDownloads);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const clearHistory = async () => {
    await fetch("/api/history?id=all", { method: "DELETE" });
    toast("Watch history cleared");
  };
  const handleClearDownloads = async () => {
    await clearDownloads();
    toast("Downloads cleared");
  };

  return (
    <div className="px-4 sm:px-6 py-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <Settings className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">Customize your PureTuber experience</p>
        </div>
      </div>

      <Section icon={<Sun className="h-4 w-4" />} title="Appearance">
        <Row title="Theme" desc="Light, dark, or system">
          <Select value={mounted ? theme : "system"} onValueChange={(v) => setTheme(v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light"><span className="flex items-center gap-2"><Sun className="h-4 w-4" /> Light</span></SelectItem>
              <SelectItem value="dark"><span className="flex items-center gap-2"><Moon className="h-4 w-4" /> Dark</span></SelectItem>
              <SelectItem value="system"><span className="flex items-center gap-2"><Monitor className="h-4 w-4" /> System</span></SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section icon={<Film className="h-4 w-4" />} title="Playback">
        <Row title="Default quality" desc="Preferred video resolution">
          <Select value={prefs.defaultQuality} onValueChange={(v) => update({ defaultQuality: v })}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2160p">4K</SelectItem>
              <SelectItem value="1080p">1080p</SelectItem>
              <SelectItem value="720p">720p</SelectItem>
              <SelectItem value="480p">480p</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row title="Playback speed" desc="Default speed for videos">
          <Select value={prefs.playbackSpeed} onValueChange={(v) => update({ playbackSpeed: v })}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5×</SelectItem>
              <SelectItem value="1">Normal</SelectItem>
              <SelectItem value="1.25">1.25×</SelectItem>
              <SelectItem value="1.5">1.5×</SelectItem>
              <SelectItem value="2">2×</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <ToggleRow icon={<Gauge className="h-4 w-4" />} title="Autoplay" desc="Play next video automatically" checked={prefs.autoplay} onChange={(v) => update({ autoplay: v })} />
        <ToggleRow icon={<Volume2 className="h-4 w-4" />} title="Mini player" desc="Keep playing in a small window" checked={prefs.miniPlayer} onChange={(v) => update({ miniPlayer: v })} />
        <ToggleRow icon={<Film className="h-4 w-4" />} title="Captions" desc="Show subtitles when available" checked={prefs.captions} onChange={(v) => update({ captions: v })} />
        <ToggleRow icon={<Database className="h-4 w-4" />} title="Data saver" desc="Lower quality on mobile data" checked={prefs.dataSaver} onChange={(v) => update({ dataSaver: v })} />
      </Section>

      <Section icon={<Shield className="h-4 w-4" />} title="Privacy & data">
        <div className="flex items-center justify-between gap-3 py-1">
          <div>
            <div className="text-sm font-medium">Clear watch history</div>
            <div className="text-xs text-muted-foreground">Remove all watched videos</div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={clearHistory}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 py-1">
          <div>
            <div className="text-sm font-medium">Clear downloads</div>
            <div className="text-xs text-muted-foreground">Remove all offline videos</div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClearDownloads}>
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        </div>
      </Section>

      <Section icon={<Info className="h-4 w-4" />} title="About">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-medium">2.4.1 (PureTuber VPN)</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Build</span><span className="font-medium">#{Math.floor(100000 + Math.random() * 899999)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">VPN servers</span><span className="font-medium">20 locations · 60+ countries</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Engine</span><span className="font-medium">Next.js 16 · WireGuard</span></div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"><Github className="h-4 w-4" /> Source</Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"><Heart className="h-4 w-4 text-red-500" /> Rate us</Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-3">
          PureTuber VPN is a demo app inspired by Pure Tuber and GreenTuber. Videos are streamed via YouTube embeds; the VPN, ad-block, and download features are simulated for demonstration.
        </p>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        {icon} {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ icon, title, desc, checked, onChange }: {
  icon: React.ReactNode; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0", checked ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-emerald-600" />
    </div>
  );
}
