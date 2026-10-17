import { Skeleton } from "@/components/ui/skeleton";
import { ProfileSkeleton, RecordsSkeleton } from "@/components/widget/records-skeleton";
import { getI18n } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getI18n();
  return <main className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <Skeleton className="h-12 w-56" />
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <ProfileSkeleton label={t("Loading ranked record…")} /><Skeleton className="aspect-square w-full rounded-xl" />
    </div>
    <RecordsSkeleton label={t("Loading recent matches…")} />
  </main>;
}
