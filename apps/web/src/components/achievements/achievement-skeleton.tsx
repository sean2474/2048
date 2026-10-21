import { Skeleton } from "@/components/ui/skeleton";

export function AchievementSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <span className="sr-only">{label}</span>
      <div className="grid gap-5 rounded-2xl border bg-card p-6 sm:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-2 w-full" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-4 w-52" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex gap-4">
              <Skeleton className="size-20" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-full" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
