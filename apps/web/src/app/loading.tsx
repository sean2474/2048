import { getRequestI18n } from "@/lib/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

// This boundary covers every route; page-shaped placeholders belong inside each page.
export default async function Loading() {
  const { t } = await getRequestI18n();
  return <div role="status" aria-label={t("Loading selection…")} className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <span className="sr-only">{t("Loading selection…")}</span>
    <Skeleton className="h-10 w-56 max-w-full" />
    <div className="grid gap-5 sm:grid-cols-2">{[0, 1].map(index => <div key={index} className="game-panel space-y-4 bg-card p-6"><Skeleton className="h-6 w-32" /><Skeleton className="h-24 w-full" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-11 w-full" /></div>)}</div>
  </div>;
}
