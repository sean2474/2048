import "server-only";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-skeleton=""
      className={cn("skeleton-shimmer rounded-md motion-reduce:animate-none", className)}
    />
  );
}
