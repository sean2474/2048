import { Skeleton } from "@/components/ui/skeleton";
import { RecordsSkeleton } from "@/components/widget/records-skeleton";
import { getI18n } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return <main className="mx-auto max-w-[1120px] space-y-7 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <Skeleton className="h-48 rounded-xl" /><Skeleton className="h-40 rounded-xl" />
    <RecordsSkeleton label={t("Loading leaderboard…")} rows={6} />
  </main>;
}
