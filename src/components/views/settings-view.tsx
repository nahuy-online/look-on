"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Settings, Sun, Moon, Monitor, Gauge, Film, Volume2, Shield, Database,
  Trash2, Info, Github, Heart, Globe, User, LogOut, LogIn, RefreshCw,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLibraryStore } from "@/store/use-library-store";
import { useI18nStore, useT } from "@/store/use-i18n-store";
import { useAuthStore } from "@/store/use-auth-store";
import { LANGS } from "@/lib/i18n";
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

export function SettingsView({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const { theme, setTheme } = useTheme();
  const { prefs, update } = usePrefs();
  const clearDownloads = useLibraryStore((s) => s.clearDownloads);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const clearHistory = async () => {
    await fetch("/api/history?id=all", { method: "DELETE" });
    toast(t("hist.cleared"));
  };
  const handleClearDownloads = async () => {
    await clearDownloads();
    toast(t("dl.cleared"));
  };
  const handleLogout = () => {
    logout();
    toast(t("login.signedOut"));
  };

  return (
    <div className="px-4 sm:px-6 py-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <Settings className="h-5 w-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">{t("set.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("set.subtitle")}</p>
        </div>
      </div>

      {/* Account section */}
      <Section icon={<User className="h-4 w-4" />} title={t("set.account")}>
        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={user.avatar} alt={user.name} className="h-12 w-12 rounded-full border-2 border-emerald-500/40" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full">
                <RefreshCw className="h-3 w-3" /> {t("set.synced")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <div className="text-sm font-medium">{t("set.syncStatus")}</div>
                <div className="text-xs text-muted-foreground">{t("set.signInDesc")}</div>
              </div>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t("set.synced")}</span>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> {t("set.signOut")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{t("set.notSignedIn")}</div>
                <div className="text-xs text-muted-foreground">{t("set.signInDesc")}</div>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{t("set.local")}</span>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 w-full" onClick={() => onOpenLogin?.()}>
              <LogIn className="h-4 w-4" /> {t("header.signIn")}
            </Button>
          </div>
        )}
      </Section>

      {/* Language */}
      <Section icon={<Globe className="h-4 w-4" />} title={t("set.language")}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("set.language")}</div>
            <div className="text-xs text-muted-foreground">{t("set.languageDesc")}</div>
          </div>
          <Select value={lang} onValueChange={(v) => setLang(v as any)}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  <span className="flex items-center gap-2">{l.flag} {l.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section icon={<Sun className="h-4 w-4" />} title={t("set.appearance")}>
        <Row title={t("set.theme")} desc={t("set.themeDesc")}>
          <Select value={mounted ? theme : "system"} onValueChange={(v) => setTheme(v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light"><span className="flex items-center gap-2"><Sun className="h-4 w-4" /> {t("set.light")}</span></SelectItem>
              <SelectItem value="dark"><span className="flex items-center gap-2"><Moon className="h-4 w-4" /> {t("set.dark")}</span></SelectItem>
              <SelectItem value="system"><span className="flex items-center gap-2"><Monitor className="h-4 w-4" /> {t("set.system")}</span></SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section icon={<Film className="h-4 w-4" />} title={t("set.playback")}>
        <Row title={t("set.defaultQuality")} desc={t("set.defaultQualityDesc")}>
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
        <Row title={t("set.playbackSpeed")} desc={t("set.playbackSpeedDesc")}>
          <Select value={prefs.playbackSpeed} onValueChange={(v) => update({ playbackSpeed: v })}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0.5">0.5×</SelectItem>
              <SelectItem value="1">Normal</SelectItem>
              <SelectItem value="1.25">1.25×</SelectItem>
              <SelectItem value="1.5">1.5×</SelectItem>
              <SelectItem value="2">2×</SelectItem>
              <SelectItem value="3">3×</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <ToggleRow icon={<Gauge className="h-4 w-4" />} title={t("set.autoplay")} desc={t("set.autoplayDesc")} checked={prefs.autoplay} onChange={(v) => update({ autoplay: v })} />
        <ToggleRow icon={<Volume2 className="h-4 w-4" />} title={t("set.miniPlayer")} desc={t("set.miniPlayerDesc")} checked={prefs.miniPlayer} onChange={(v) => update({ miniPlayer: v })} />
        <ToggleRow icon={<Film className="h-4 w-4" />} title={t("set.captions")} desc={t("set.captionsDesc")} checked={prefs.captions} onChange={(v) => update({ captions: v })} />
        <ToggleRow icon={<Database className="h-4 w-4" />} title={t("set.dataSaver")} desc={t("set.dataSaverDesc")} checked={prefs.dataSaver} onChange={(v) => update({ dataSaver: v })} />
      </Section>

      <Section icon={<Shield className="h-4 w-4" />} title={t("set.privacy")}>
        <div className="flex items-center justify-between gap-3 py-1">
          <div>
            <div className="text-sm font-medium">{t("set.clearHistory")}</div>
            <div className="text-xs text-muted-foreground">{t("set.clearHistoryDesc")}</div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={clearHistory}>
            <Trash2 className="h-4 w-4" /> {t("set.clear")}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 py-1">
          <div>
            <div className="text-sm font-medium">{t("set.clearDownloads")}</div>
            <div className="text-xs text-muted-foreground">{t("set.clearDownloadsDesc")}</div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClearDownloads}>
            <Trash2 className="h-4 w-4" /> {t("set.clear")}
          </Button>
        </div>
      </Section>

      <Section icon={<Info className="h-4 w-4" />} title={t("set.about")}>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("set.version")}</span><span className="font-medium">2.5.0 (PureTuber VPN)</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("set.build")}</span><span className="font-medium">#{Math.floor(100000 + Math.random() * 899999)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("set.vpnServers")}</span><span className="font-medium">20 locations · 60+ countries</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("set.engine")}</span><span className="font-medium">Next.js 16 · WireGuard</span></div>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"><Github className="h-4 w-4" /> {t("set.source")}</Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"><Heart className="h-4 w-4 text-red-500" /> {t("set.rateUs")}</Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mt-3">
          © {new Date().getFullYear()} PureTuber VPN. {t("common.youTubeEmbedNote")}
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
