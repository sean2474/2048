import "server-only";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogSkeleton } from "./catalog-skeleton";

// Shared by the route boundary and the collection page's data boundary.
export function CollectionPageSkeleton({ label, shop = false }: { label: string; shop?: boolean }) {
  return <div role="status" aria-label={label} className={shop ? "space-y-5" : "space-y-4"}>
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"><Skeleton className="h-8 w-36" />{!shop && <div className="flex gap-2"><Skeleton className="h-11 w-28" /><Skeleton className="h-11 w-24" /></div>}</section>
    {!shop && <Skeleton className="h-16 w-full rounded-xl" />}
    <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="inline-flex gap-1 rounded-xl bg-muted p-1"><Skeleton className="h-11 w-32" /><Skeleton className="h-11 w-24" /></div>{!shop && <Skeleton className="h-11 w-28" />}</div><div className="flex flex-wrap gap-1">{[0, 1, 2, 3, 4].map(index => <Skeleton key={index} className="h-11 w-20" />)}</div></div>
    <CatalogSkeleton shop={shop} label={label} />
  </div>;
}
