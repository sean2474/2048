import { PageHeading } from "@/components/widget/page-heading";
import { HistorySkeleton } from "@/components/widget/records-skeleton";
import { getRequestI18n } from "@/lib/i18n/server";

export default async function Loading() {
  const { t } = await getRequestI18n();
  return (
    <main className="mx-auto max-w-[960px] space-y-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeading icon="history" title={t("Your match history")} />
      <HistorySkeleton label={t("Loading matches…")} />
    </main>
  );
}
