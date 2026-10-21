import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCollection } from "@/lib/server/collection";
import { getI18n } from "@/lib/i18n/server";
import { collectionQuery, type CollectionSearch } from "@/lib/collection";
import { PageHeading } from "@/components/widget/page-heading";
import { Button } from "@/components/ui/button";
import { CollectionPageSkeleton } from "@/components/widget/collection-page-skeleton";
import { CollectionView } from "@/components/catalog/collection-view";

export default async function LoadoutPage({ searchParams }: { searchParams: Promise<CollectionSearch> }) {
  const snapshot = getCollection("loadout");
  // Observe early failures; CollectionView still awaits the original promise
  // and surfaces its error through React if the parent render completes.
  void snapshot.catch(() => {});
  const [{ t }, params] = await Promise.all([getI18n(), searchParams]);
  const query = collectionQuery(params);
  return <main className="mx-auto max-w-[1040px] space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <span id="equipped-label" className="sr-only">{t("Equipped")}</span>
    <PageHeading icon="loadout" title={t("My loadout")}><Button asChild variant="outline"><Link href="/find-match" data-analytics-link="/find-match"><ArrowLeft aria-hidden="true" />{t("Find match")}</Link></Button></PageHeading>
    <Suspense key={JSON.stringify(query)} fallback={<CollectionPageSkeleton label={t("Loading collection…")} />}><CollectionView mode="loadout" query={query} snapshot={snapshot} /></Suspense>
  </main>;
}
