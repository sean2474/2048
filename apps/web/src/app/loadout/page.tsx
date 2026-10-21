import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { collectionQuery, type CollectionSearch } from "@/lib/collection";
import { PageHeading } from "@/components/widget/page-heading";
import { Button } from "@/components/ui/button";
import { CatalogSkeleton } from "@/components/widget/catalog-skeleton";
import { CollectionView } from "@/components/catalog/collection-view";

export default async function LoadoutPage({ searchParams }: { searchParams: Promise<CollectionSearch> }) {
  const [{ t }, params] = await Promise.all([getI18n(), searchParams]);
  const query = collectionQuery(params);
  return <main className="mx-auto max-w-[1040px] space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <span id="equipped-label" className="sr-only">{t("Equipped")}</span>
    <PageHeading icon="loadout" title={t("My loadout")}><Button asChild variant="outline"><Link href="/find-match" data-analytics-link="/find-match"><ArrowLeft aria-hidden="true" />{t("Find match")}</Link></Button></PageHeading>
    <Suspense key={JSON.stringify(query)} fallback={<CatalogSkeleton label={t("Loading collection…")} />}><CollectionView mode="loadout" query={query} /></Suspense>
  </main>;
}
