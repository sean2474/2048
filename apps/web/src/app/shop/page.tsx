import { Suspense } from "react";
import Link from "next/link";
import { getUser } from "@/lib/supabase/account";
import { getCollection } from "@/lib/server/collection";
import { getI18n } from "@/lib/i18n/server";
import { collectionQuery, type CollectionSearch } from "@/lib/collection";
import { PageHeading } from "@/components/widget/page-heading";
import { Button } from "@/components/ui/button";
import { CollectionPageSkeleton } from "@/components/widget/collection-page-skeleton";
import { CollectionView } from "@/components/catalog/collection-view";

export default async function ShopPage({ searchParams }: { searchParams: Promise<CollectionSearch> }) {
  const snapshot = getCollection("shop");
  // Observe early failures; CollectionView still awaits the original promise
  // and surfaces its error through React if the parent render completes.
  void snapshot.catch(() => {});
  const [{ t }, params, user] = await Promise.all([getI18n(), searchParams, getUser()]);
  const query = collectionQuery(params);
  return <main className="mx-auto max-w-[1040px] space-y-5 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="coin" title={t("Coin shop")}><Button asChild variant="outline"><Link href="/achievements" data-analytics-link="/achievements">{t("Achievements")}</Link></Button></PageHeading>
    <Suspense key={JSON.stringify(query)} fallback={<CollectionPageSkeleton shop history={Boolean(user && !user.is_anonymous)} label={t("Loading collection…")} />}><CollectionView mode="shop" query={query} snapshot={snapshot} /></Suspense>
  </main>;
}
