import { Skeleton } from "@/components/ui/skeleton";
export function CatalogSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="space-y-3 rounded-xl border bg-card p-4"><Skeleton className="mx-auto aspect-square w-full max-w-20" /><Skeleton className="h-4 w-full" /></div>)}</div>;
}
