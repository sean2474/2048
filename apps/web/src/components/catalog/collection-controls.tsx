import Link from "next/link";
import { Palette, UserRound } from "lucide-react";
import { SKIN_RARITIES, type SkinRarity } from "schema/loadout";
import { getI18n } from "@/lib/i18n/server";
import { collectionHref, type CollectionQuery } from "@/lib/collection";
import { Button } from "@/components/ui/button";

export async function CollectionControls({ mode, query }: { mode: "shop" | "loadout"; query: CollectionQuery }) {
  const { t } = await getI18n(), path = mode === "shop" ? "/shop" : "/loadout";
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <nav aria-label={t(mode === "shop" ? "Shop categories" : "Loadout categories")} className="inline-flex gap-1 rounded-xl bg-muted p-1">
        {([{ id: "skin", label: "Board skins", icon: Palette }, { id: "icon", label: "Icons", icon: UserRound }] as const).map(item => <Button asChild key={item.id} variant="ghost" className={query.category === item.id ? "bg-card shadow-sm hover:bg-card" : "text-muted-foreground"}><Link href={collectionHref(path, query, { category: item.id, page: 0 })} aria-current={query.category === item.id ? "page" : undefined}><item.icon aria-hidden="true" className="size-4" />{t(item.label)}</Link></Button>)}
      </nav>
      {mode === "loadout" && <Button asChild variant="ghost" className={query.ownedOnly ? "bg-primary/10 text-primary" : "text-muted-foreground"}><Link href={collectionHref(path, query, { ownedOnly: !query.ownedOnly, page: 0 })} aria-label={`${t("Owned only")}: ${t(query.ownedOnly ? "On" : "Off")}`} aria-current={query.ownedOnly ? "true" : undefined}>{t("Owned only")}{query.ownedOnly && <span aria-hidden="true">✓</span>}</Link></Button>}
    </div>
    {query.category === "skin" && <nav aria-label={t("Filter by rarity")} className="flex flex-wrap gap-1">{(["all", ...Object.keys(SKIN_RARITIES)] as Array<SkinRarity | "all">).map(value => <Button asChild key={value} variant="ghost" className={query.rarity === value ? "bg-primary/10 text-primary" : "text-muted-foreground"}><Link href={collectionHref(path, query, { rarity: value, page: 0 })} aria-current={query.rarity === value ? "page" : undefined}>{t(value === "all" ? "All skins" : SKIN_RARITIES[value].name)}</Link></Button>)}</nav>}
  </div>;
}

export async function CollectionPagination({ mode, query, count, page }: { mode: "shop" | "loadout"; query: CollectionQuery; count: number; page: number }) {
  const { t } = await getI18n();
  if (count <= 1) return null;
  return <nav aria-label={t("Catalog pages")} className="flex items-center justify-center gap-3">
    {page > 0 ? <Button asChild variant="outline"><Link href={collectionHref(mode === "shop" ? "/shop" : "/loadout", query, { page: page - 1 })}>{t("Previous page")}</Link></Button> : <Button variant="outline" disabled>{t("Previous page")}</Button>}
    <p role="status" className="text-xs tabular-nums">{t("Page {page} of {count}", { page: page + 1, count })}</p>
    {page + 1 < count ? <Button asChild variant="outline"><Link href={collectionHref(mode === "shop" ? "/shop" : "/loadout", query, { page: page + 1 })}>{t("Next page")}</Link></Button> : <Button variant="outline" disabled>{t("Next page")}</Button>}
  </nav>;
}
