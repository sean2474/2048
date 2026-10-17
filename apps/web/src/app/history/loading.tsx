import { Skeleton } from "@/components/ui/skeleton";
import { RecordsSkeleton } from "@/components/widget/records-skeleton";
import { getI18n } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return <main className="mx-auto max-w-[960px] space-y-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <Skeleton className="h-12 w-64" /><RecordsSkeleton label={t("Loading matches…")} rows={5} />
  </main>;
}
