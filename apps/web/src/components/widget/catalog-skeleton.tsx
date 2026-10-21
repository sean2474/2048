import "server-only";
import { Skeleton } from "@/components/ui/skeleton";

export function CatalogSkeleton({ label, shop = false }: { label: string; shop?: boolean }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border bg-card px-2 py-4"
        >
          {shop && <Skeleton className="h-4 w-10" />}
          <Skeleton className="size-[72px] max-w-full sm:size-20" />
          <div className="flex h-8 w-full items-center justify-center">
            <Skeleton className="h-3 w-3/4" />
          </div>
          {shop && (
            <>
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-5 w-14" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
