"use client";

import Link from "next/link";
import { useState } from "react";
import { SHOP_ITEMS } from "schema/economy";
import { SKINS, SKIN_RARITIES, type SkinId, type SkinRarity } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeading } from "@/components/widget/page-heading";
import { GameEmblem } from "@/components/widget/game-emblem";
import { SkinPreview } from "@/components/2048/skin-preview";
import { SkinMergePreview } from "@/components/2048/skin-merge-preview";

import { trackGameEvent } from "@/lib/analytics";

const PAGE_SIZE = 12;

export default function ShopPage() {
  const { t, locale } = useI18n();
  const [rarity, setRarity] = useState<SkinRarity | "all">("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<SkinId | null>(null);
  const items = SHOP_ITEMS.filter(item => rarity === "all" || SKINS.find(skin => skin.id === item.skinId)!.rarity === rarity);
  const pages = Math.ceil(items.length / PAGE_SIZE);
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";

  return <main className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="coin" eyebrow={t("Cosmetic collection")} title={t("Coin shop")} description={t("Browse planned items. Purchases and coin rewards are not active yet.")}><Button asChild variant="outline"><Link href="/achievements" data-analytics-link="/achievements">{t("Achievements")}</Link></Button></PageHeading>
    <section aria-label={t("Shop preview")} className="rounded-xl border bg-card p-4 text-sm leading-6"><p className="font-semibold text-primary">{t("Coming soon")}</p><p className="mt-1 text-muted-foreground">{t("Preview prices may change. You can still use the current skins for free after signing in.")}</p><p className="text-muted-foreground">{t("Cosmetics only. No gameplay advantages.")}</p></section>
    <div role="group" aria-label={t("Filter by rarity")} className="flex flex-wrap gap-1">{(["all", ...Object.keys(SKIN_RARITIES)] as Array<SkinRarity | "all">).map(value => <Button key={value} variant="ghost" aria-pressed={rarity === value} aria-controls="shop-items" onClick={() => { setRarity(value); setPage(0); trackGameEvent("skin_filter_changed", { rarity: value, source: "shop" }); }} className={rarity === value ? "bg-primary/10 text-primary" : "text-muted-foreground"}>{t(value === "all" ? "All skins" : SKIN_RARITIES[value].name)}</Button>)}</div>
    <ul id="shop-items" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(item => {
      const skin = SKINS.find(skin => skin.id === item.skinId)!;
      return <li key={item.skinId}><Dialog open={detail === item.skinId} onOpenChange={open => { setDetail(open ? item.skinId : null); if (open) trackGameEvent("cosmetic_previewed", { item: item.skinId, source: "shop" }); }}>
        <DialogTrigger asChild><button type="button" aria-label={t("{item} · Preview shop item", { item: t(skin.name) })} className="flex h-full w-full flex-col items-center gap-2 rounded-xl border bg-card px-2 py-4 text-center hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><span className="text-[11px] text-muted-foreground">{t(SKIN_RARITIES[skin.rarity].name)}</span><SkinPreview skin={skin} /><span className="flex min-h-8 items-center text-xs font-bold sm:text-sm">{t(skin.name)}</span><span className="mt-auto text-[11px] text-muted-foreground">{t("Planned price")}</span><span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"><GameEmblem kind="coin" className="size-5" />{item.plannedPrice.toLocaleString(numberLocale)}</span></button></DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t(skin.name)}</DialogTitle><DialogDescription>{t(skin.description)}</DialogDescription></DialogHeader>{skin.rarity === "legendary" ? <SkinMergePreview key={skin.id} skin={skin} /> : <div className="flex justify-center py-2"><SkinPreview skin={skin} large /></div>}<p className="text-center text-sm">{t("Planned price")} · {t("{count} coins", { count: item.plannedPrice.toLocaleString(numberLocale) })}</p><p className="text-xs leading-6 text-muted-foreground">{t("Preview prices may change. You can still use the current skins for free after signing in.")}</p><DialogFooter><Button disabled>{t("Purchase unavailable")}</Button><Button asChild variant="outline"><Link href="/loadout" data-analytics-link="/loadout">{t("View in loadout")}</Link></Button></DialogFooter></DialogContent>
      </Dialog></li>;
    })}</ul>
    {pages > 1 && <nav aria-label={t("Catalog pages")} className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("Previous page")}</Button><p role="status" className="text-xs tabular-nums">{t("Page {page} of {count}", { page: page + 1, count: pages })}</p><Button variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t("Next page")}</Button></nav>}
    <section className="rounded-xl border border-dashed p-5 text-sm"><h2 className="font-semibold">{t("No purchases yet")}</h2><p className="mt-2 text-muted-foreground">{t("Coin history will appear here when rewards and purchases launch.")}</p></section>
  </main>;
}
