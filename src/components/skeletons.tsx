import { cn } from "@/lib/utils";

export function VideoCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse", className)}>
      <div className="aspect-video rounded-xl bg-muted" />
      <div className="flex gap-3 mt-3">
        <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-2/3" />
          <div className="h-2.5 bg-muted rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}
