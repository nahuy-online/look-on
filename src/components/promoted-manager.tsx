"use client";

import * as React from "react";
import { Sparkles, Plus, Trash2, GripVertical, Link2, Loader2 } from "lucide-react";
import { useT } from "@/store/use-i18n-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { extractYoutubeId } from "@/lib/format";
import { toast } from "sonner";

interface PromotedRow {
  id: string;
  youtubeId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  position: number;
  label: string;
  category: string;
  active: boolean;
  createdAt: string;
}

export function PromotedManager() {
  const t = useT();
  const [rows, setRows] = React.useState<PromotedRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [position, setPosition] = React.useState("3");
  const [label, setLabel] = React.useState("Promoted");
  const [category, setCategory] = React.useState("All");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/promoted?active=false").then((r) => r.json());
      setRows(res.rows || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const id = extractYoutubeId(url.trim()) || url.trim();
    if (!id || id.length < 6) {
      toast.error("Invalid YouTube URL or ID");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/promoted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeId: id, position, label, category }),
      }).then((r) => r.json());
      if (res.row) {
        toast.success("Promoted video added");
        setUrl("");
        setPosition("3");
        load();
      } else {
        toast.error("Failed to add");
      }
    } catch {
      toast.error("Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    await fetch(`/api/promoted?id=${id}`, { method: "DELETE" });
    toast("Promoted video removed");
    load();
  };

  const handleToggle = async (row: PromotedRow, active: boolean) => {
    await fetch("/api/promoted", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active }),
    });
    load();
  };

  const handlePositionChange = async (row: PromotedRow, pos: number) => {
    await fetch("/api/promoted", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, position: pos }),
    });
    load();
  };

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="rounded-xl border border-dashed border-border p-4 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plus className="h-4 w-4 text-emerald-500" /> {t("promoted.addNew")}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("promoted.youtubeUrl")}</Label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=… or video ID"
              className="pl-9"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("promoted.position")}</Label>
            <Input type="number" min={1} max={50} value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("promoted.label")}</Label>
            <Select value={label} onValueChange={setLabel}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Promoted">{t("promoted.labelPromoted")}</SelectItem>
                <SelectItem value="Editor's Pick">{t("promoted.labelPick")}</SelectItem>
                <SelectItem value="Sponsored">{t("promoted.labelSponsored")}</SelectItem>
                <SelectItem value="Recommended">{t("promoted.labelRecommended")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("promoted.category")}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("promoted.allFeeds")}</SelectItem>
                <SelectItem value="Music">{t("cat.Music")}</SelectItem>
                <SelectItem value="Gaming">{t("cat.Gaming")}</SelectItem>
                <SelectItem value="Tech">{t("cat.Tech")}</SelectItem>
                <SelectItem value="Entertainment">{t("cat.Entertainment")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleAdd} disabled={adding} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("promoted.addButton")}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">{t("promoted.empty")}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-card">
              <div className="relative w-24 shrink-0 aspect-video rounded-md overflow-hidden bg-muted">
                <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
                <span className="absolute top-1 left-1 bg-amber-500 text-white text-[9px] font-bold px-1 py-0.5 rounded">{r.label}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-medium line-clamp-1">{r.title}</h4>
                <p className="text-[11px] text-muted-foreground">{r.channel}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground">{t("promoted.position")}</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={r.position}
                    onChange={(e) => handlePositionChange(r, parseInt(e.target.value) || 1)}
                    className="w-12 h-6 text-xs text-center bg-muted rounded border border-border outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-muted-foreground">· {r.category}</span>
                </div>
              </div>
              <Switch checked={r.active} onCheckedChange={(v) => handleToggle(r, v)} className="data-[state=checked]:bg-emerald-600" />
              <button
                onClick={() => handleRemove(r.id)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
