"use client";

import * as React from "react";
import { Download, Check, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VideoItem } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { useLibraryStore } from "@/store/use-library-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const QUALITIES = [
  { id: "2160p", label: "4K (2160p)", mbPerMin: 95, premium: true },
  { id: "1080p", label: "Full HD (1080p)", mbPerMin: 24, premium: false },
  { id: "720p", label: "HD (720p)", mbPerMin: 12, premium: false },
  { id: "480p", label: "SD (480p)", mbPerMin: 7, premium: false },
  { id: "audio", label: "Audio only (MP3)", mbPerMin: 2, premium: false },
];

export function DownloadDialog({ video, open, onOpenChange }: {
  video: VideoItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [quality, setQuality] = React.useState("1080p");
  const addDownload = useLibraryStore((s) => s.addDownload);
  const downloads = useLibraryStore((s) => s.downloads);

  React.useEffect(() => {
    if (open) setQuality("1080p");
  }, [open]);

  if (!video) return null;
  const already = downloads.some((d) => d.youtubeId === video.youtubeId);

  const sizeMb = Math.max(1, Math.round((video.duration / 60) * (QUALITIES.find((q) => q.id === quality)?.mbPerMin ?? 20)));

  const start = async () => {
    await addDownload(video, quality, sizeMb);
    toast.success("Download queued", { description: `${video.title.slice(0, 50)}… · ${quality}` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-emerald-500" /> Download video
          </DialogTitle>
          <DialogDescription className="line-clamp-1">{video.title}</DialogDescription>
        </DialogHeader>

        {already ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 py-4">
            <Check className="h-4 w-4" /> Already in your downloads.
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Choose quality</Label>
              <RadioGroup value={quality} onValueChange={setQuality} className="gap-1.5">
                {QUALITIES.map((q) => {
                  const sz = Math.max(1, Math.round((video.duration / 60) * q.mbPerMin));
                  return (
                    <Label
                      key={q.id}
                      htmlFor={q.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors",
                        quality === q.id && "border-emerald-500/60 bg-emerald-500/5"
                      )}
                    >
                      <RadioGroupItem value={q.id} id={q.id} className="text-emerald-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {q.label}
                          {q.premium && <Badge variant="secondary" className="text-[10px] h-4 px-1">VPN 4K</Badge>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium">~{sz} MB</div>
                        <div className="text-[10px] text-muted-foreground">{formatDuration(video.duration)}</div>
                      </div>
                    </Label>
                  );
                })}
              </RadioGroup>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={start} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                <Download className="h-4 w-4" /> Download · ~{sizeMb} MB
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
