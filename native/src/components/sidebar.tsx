import {
  Home,
  Search,
  Shield,
  Download,
  History,
  ThumbsUp,
  ListVideo,
  Settings as SettingsIcon,
  Flame,
  Music2,
  Gamepad2,
  Cpu,
  Newspaper,
  Trophy,
  GraduationCap,
  Film,
  Plane,
  UtensilsCrossed,
} from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { useVpnStore } from "@/store/use-vpn-store";
import { CATEGORIES, type Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV: { view: ReturnType<typeof useAppStore.getState>["view"]; label: string; icon: typeof Home }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "search", label: "Search", icon: Search },
  { view: "vpn", label: "VPN", icon: Shield },
  { view: "downloads", label: "Downloads", icon: Download },
  { view: "history", label: "History", icon: History },
  { view: "liked", label: "Liked", icon: ThumbsUp },
  { view: "playlists", label: "Playlists", icon: ListVideo },
  { view: "settings", label: "Settings", icon: SettingsIcon },
];

const CATEGORY_ICONS: Partial<Record<Category, typeof Home>> = {
  All: Flame,
  Music: Music2,
  Gaming: Gamepad2,
  Tech: Cpu,
  News: Newspaper,
  Sports: Trophy,
  Education: GraduationCap,
  Entertainment: Film,
  Travel: Plane,
  Cooking: UtensilsCrossed,
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const activeCategory = useAppStore((s) => s.activeCategory);
  const setCategory = useAppStore((s) => s.setCategory);
  const vpnStatus = useVpnStore((s) => s.status);
  const quickConnect = useVpnStore((s) => s.quickConnect);

  const go = (v: typeof view) => {
    setView(v);
    onNavigate?.();
  };

  return (
    <nav className="flex flex-col gap-1 p-2 h-full overflow-y-auto scrollbar-thin">
      {NAV.map((n) => {
        const Icon = n.icon;
        const active = view === n.view;
        return (
          <button
            key={n.view}
            onClick={() => go(n.view)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{n.label}</span>
            {n.view === "vpn" && vpnStatus === "connected" && (
              <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        );
      })}

      <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Categories
      </div>
      {CATEGORIES.map((c) => {
        const Icon = CATEGORY_ICONS[c] ?? Flame;
        const active = activeCategory === c && view === "home";
        return (
          <button
            key={c}
            onClick={() => {
              setCategory(c);
              go("home");
            }}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{c}</span>
          </button>
        );
      })}

      {vpnStatus !== "connected" && (
        <button
          onClick={() => {
            void quickConnect();
            onNavigate?.();
          }}
          className="mt-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 text-sm font-semibold"
        >
          ⚡ Quick Connect
        </button>
      )}
    </nav>
  );
}
