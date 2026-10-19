import { Skeleton } from "@/components/ui/skeleton";

export function ProfileSkeleton({ label }: { label: string }) {
  return <section role="status" aria-label={label} className="game-panel min-w-0 bg-card p-6 sm:p-8">
    <div className="mb-6"><Skeleton className="mb-2 h-4 w-28" /><Skeleton className="h-8 w-44" /></div>
    <div className="flex items-end justify-between gap-4 border-y py-5"><div><Skeleton className="mb-2 h-4 w-24" /><Skeleton className="mb-2 h-6 w-28" /><Skeleton className="h-10 w-36" /></div><Skeleton className="h-10 w-20" /></div>
    <Skeleton className="mt-4 h-16 w-full" />
    <div className="mt-4 space-y-3 rounded-xl border bg-muted/30 p-4"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-10 w-full" /><div className="border-t pt-3"><Skeleton className="h-6 w-36" /></div></div>
    <div className="mt-5 grid grid-cols-3 gap-4">{[0, 1, 2].map(i => <div key={i}><Skeleton className="h-4 w-12" /><Skeleton className="mt-1 h-7 w-8" /></div>)}</div>
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

export function HistorySkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="space-y-4">
    <Skeleton className="h-4 w-48" />
    {Array.from({ length: 5 }, (_, i) => <div key={i} aria-hidden="true" className="game-panel overflow-hidden bg-card shadow-sm">
      <div className="flex justify-between gap-3 border-b bg-muted/30 px-5 py-3 sm:px-6"><Skeleton className="h-6 w-14" /><Skeleton className="h-4 w-28" /></div>
      <div className="space-y-4 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><Skeleton className="mb-1 h-4 w-24" /><Skeleton className="h-7 w-40" /></div><Skeleton className="h-8 w-28" /></div><Skeleton className="h-4 w-48" /><div className="border-t pt-4"><Skeleton className="h-6 w-48" /></div></div>
    </div>)}
  </div>;
}

export function StandingsSkeleton({ label, solo = false }: { label: string; solo?: boolean }) {
  return <div role="status" aria-label={label} className="space-y-7">
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4"><div><Skeleton className="h-4 w-20" /><Skeleton className="mt-2 h-7 w-44" /></div><Skeleton className="h-11 w-20" /></div>
    {!solo && <><div className="flex items-center justify-between gap-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-11 w-36" /></div><div className="grid grid-cols-3 items-end gap-2 sm:gap-4">{[1, 0, 2].map(i => <div key={i} className="rounded-xl border bg-card p-3"><Skeleton className={`mx-auto rounded-full ${i === 0 ? "size-20 sm:size-24" : "size-16 sm:size-20"}`} /><Skeleton className="mt-3 h-5 w-full" /><Skeleton className="mt-3 h-10 w-full" /></div>)}</div></>}
    <div className="space-y-3"><Skeleton className="h-7 w-44" /><div className="overflow-hidden rounded-2xl border bg-card"><Skeleton className="h-10 w-full rounded-none" />{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex items-center gap-3 border-t px-3 py-4 sm:px-5"><Skeleton className="size-8 shrink-0" /><Skeleton className="h-8 min-w-0 flex-1" /><Skeleton className="h-6 w-12" /><Skeleton className="h-8 w-16" /></div>)}</div></div>
  </div>;
}

export function FriendsSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="space-y-3">{[0, 1].map(i => <div key={i} aria-hidden="true" className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
    <Skeleton className="size-10 rounded-full" /><div className="min-w-0 flex-1"><Skeleton className="h-5 w-24" /><Skeleton className="mt-1 h-4 w-16" /></div><div className="flex flex-wrap gap-2"><Skeleton className="h-11 w-20" /><Skeleton className="h-11 w-20" /></div>
  </div>)}</div>;
}

export function FriendDirectorySkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="space-y-6">
    <Skeleton className="h-11 w-full" />
    <div className="grid items-start gap-6 lg:grid-cols-2"><div className="space-y-4"><Skeleton className="h-6 w-28" /><FriendsSkeleton label={label} /></div><div aria-hidden="true" className="grid min-h-72 place-items-center rounded-2xl border border-dashed p-6"><Skeleton className="h-5 w-48" /></div></div>
  </div>;
}
