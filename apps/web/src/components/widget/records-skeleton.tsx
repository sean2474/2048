import { Skeleton } from "@/components/ui/skeleton";

export function ProfileSkeleton({ label }: { label: string }) {
  return <section role="status" aria-label={label} className="game-panel min-h-[420px] space-y-6 bg-card p-6 sm:p-8">
    <Skeleton className="h-4 w-28" /><Skeleton className="h-8 w-44" />
    <div className="space-y-3 border-y py-5"><Skeleton className="h-8 w-24" /><Skeleton className="h-12 w-36" /></div>
    <Skeleton className="h-16 w-full" />
    <div className="grid grid-cols-3 gap-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
  </section>;
}

export function RecordsSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div role="status" aria-label={label} className="space-y-4">
    <Skeleton className="h-6 w-44" />
    <div className="divide-y overflow-hidden rounded-xl border bg-card">{Array.from({ length: rows }, (_, index) =>
      <div key={index} className="flex min-h-24 items-center justify-between gap-6 p-5">
        <div className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-36" /></div><Skeleton className="h-6 w-20" />
      </div>)}</div>
  </div>;
}
