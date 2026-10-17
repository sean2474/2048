"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, LockKeyhole, Palette, UserRound } from "lucide-react";
import { useCatalog } from "@/hooks/catalog-provider";
import { SKIN_RARITIES, type SkinRarity } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeading } from "@/components/widget/page-heading";
import { GameEmblem } from "@/components/widget/game-emblem";
import { ProfileIcon } from "@/components/widget/profile-icon";
import { SkinPreview } from "@/components/2048/skin-preview";
import dynamic from "next/dynamic";
import { CatalogSkeleton } from "@/components/widget/catalog-skeleton";
import { CoinHistory } from "@/components/widget/coin-history";

const SkinMergePreview = dynamic(() => import("@/components/2048/skin-merge-preview").then(module => module.SkinMergePreview));
import { usePlayer } from "@/hooks/use-player";
import { useCosmetics } from "@/hooks/use-cosmetics";
import { trackGameEvent } from "@/lib/analytics";

const PAGE_SIZE = 12;
type Category = "skin" | "icon";

export default function ShopPage() {
  const { t, locale } = useI18n();
  const { user } = usePlayer();
  const { skins, profileIcons, error: catalogError, loading: catalogLoading } = useCatalog();
  const shopItems = [...skins.map(item => ({ ...item, kind: "skin" as const })), ...profileIcons.map(item => ({ ...item, kind: "icon" as const }))].filter(item => item.status === "published" && item.acquisition !== "achievement");
  const cosmetics = useCosmetics(user);
  const [category, setCategory] = useState<Category>("skin");
  const [rarity, setRarity] = useState<SkinRarity | "all">("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<string | null>(null);
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const items = shopItems.filter(item => item.kind === category && (item.kind === "icon" || rarity === "all" || skins.find(skin => skin.id === item.id)?.rarity === rarity));
  const pages = Math.ceil(items.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";

  return <main className="mx-auto max-w-[1040px] space-y-5 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="coin" title={t("Coin shop")}><Button asChild variant="outline"><Link href="/achievements" data-analytics-link="/achievements">{t("Achievements")}</Link></Button></PageHeading>
    <section aria-labelledby="shop-wallet-title" className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3">
      <GameEmblem kind="coin" className="size-8" /><h2 id="shop-wallet-title" className="text-xs text-muted-foreground">{t("My coins")}</h2>
      {cosmetics.loading ? <p role="status" className="text-xs">{t("Loading balance…")}</p> : !userId ? <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">{t("Log in")}</Link> : cosmetics.error || !cosmetics.data ? <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-xs text-destructive">{t("Could not load your cosmetics.")}</p><Button variant="outline" size="sm" onClick={() => void cosmetics.reload()}>{t("Try again")}</Button></div> : <p className="text-lg font-extrabold tabular-nums">{cosmetics.data.balance.toLocaleString(numberLocale)}</p>}
    </section>
    <CoinHistory userId={userId} balance={cosmetics.data?.balance} />
    <div role="tablist" aria-label={t("Shop categories")} className="inline-flex gap-1 rounded-xl bg-muted p-1" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "skin" : event.key === "End" ? "icon" : category === "skin" ? "icon" : "skin";
      setCategory(next); setPage(0);
      event.currentTarget.querySelector<HTMLButtonElement>(`#shop-${next}-tab`)?.focus();
    }}>
      {([{ id: "skin", label: "Board skins", icon: Palette }, { id: "icon", label: "Icons", icon: UserRound }] as const).map(item => <Button key={item.id} id={`shop-${item.id}-tab`} role="tab" aria-selected={category === item.id} aria-controls="shop-panel" tabIndex={category === item.id ? 0 : -1} variant="ghost" className={category === item.id ? "bg-card shadow-sm hover:bg-card" : "text-muted-foreground"} onClick={() => { setCategory(item.id); setPage(0); }}><item.icon aria-hidden="true" className="size-4" />{t(item.label)}</Button>)}
    </div>
    <section id="shop-panel" role="tabpanel" aria-labelledby={`shop-${category}-tab`} className="space-y-4">
      {category === "skin" && <div role="group" aria-label={t("Filter by rarity")} className="flex flex-wrap gap-1">{(["all", ...Object.keys(SKIN_RARITIES)] as Array<SkinRarity | "all">).map(value => <Button key={value} variant="ghost" aria-pressed={rarity === value} aria-controls="shop-items" onClick={() => { setRarity(value); setPage(0); trackGameEvent("skin_filter_changed", { rarity: value, source: "shop" }); }} className={rarity === value ? "bg-primary/10 text-primary" : "text-muted-foreground"}>{t(value === "all" ? "All skins" : SKIN_RARITIES[value].name)}</Button>)}</div>}
      {catalogLoading && items.length === 0 && <CatalogSkeleton label={t("Loading collection…")} />}
      <ul id="shop-items" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(item => {
        const skin = item.kind === "skin" ? skins.find(skin => skin.id === item.id) : undefined;
        const icon = item.kind === "icon" ? profileIcons.find(icon => icon.id === item.id) : undefined;
        const name = t(skin?.name ?? icon!.name);
        const key = `${item.kind}:${item.id}`;
        const included = item.price === 0;
        const owned = cosmetics.owns(item.kind, item.id);
        const insufficient = cosmetics.data !== undefined && cosmetics.data.balance < item.price;
        return <li key={key}><Dialog open={detail === key} onOpenChange={open => { setDetail(open ? key : null); setPurchased(null); cosmetics.clearPurchaseError(); if (open) trackGameEvent("cosmetic_previewed", { item: item.id, source: "shop" }); }}>
          <DialogTrigger asChild><button type="button" aria-label={t("{item} · Preview shop item", { item: name })} className="relative flex h-full w-full flex-col items-center gap-2 rounded-xl border bg-card px-2 py-4 text-center hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {skin && <span className="text-[11px] text-muted-foreground">{t(SKIN_RARITIES[skin.rarity].name)}</span>}
            {skin ? <SkinPreview skin={skin} /> : <ProfileIcon iconId={icon!.id} className="size-[72px] sm:size-20" />}
            <span className="flex min-h-8 items-center text-xs font-bold sm:text-sm">{name}</span>
            <span className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground">{included || owned ? <Check aria-hidden="true" className="size-3" /> : <LockKeyhole aria-hidden="true" className="size-3" />}{t(included ? "Included by default" : owned ? "Owned" : "Locked")}</span>
            {!included && !owned && <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"><GameEmblem kind="coin" className="size-5" />{item.price.toLocaleString(numberLocale)}</span>}
          </button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{t(skin?.description ?? "Shown on your profile and match intro.")}</DialogDescription></DialogHeader>
            {skin?.rarity === "legendary" ? <SkinMergePreview key={skin.id} skin={skin} /> : <div className="flex justify-center py-2">{skin ? <SkinPreview skin={skin} large /> : <ProfileIcon iconId={icon!.id} className="size-32" />}</div>}
            {included || owned ? <p className="text-center text-sm">{t(included ? "Included by default" : "Owned")}</p> : <p className="text-center text-sm tabular-nums">{t("{count} coins", { count: item.price.toLocaleString(numberLocale) })}</p>}
            {purchased === `${userId}:${key}` && <p role="status" className="text-sm font-semibold text-primary">{t("Purchase complete.")}</p>}
            {cosmetics.purchaseError ? <p role="alert" className="text-sm text-destructive">{t(cosmetics.purchaseError)}</p> : !owned && !included && insufficient && <p className="text-sm text-muted-foreground">{t("Not enough coins.")}</p>}
            <DialogFooter>
              {!userId ? user === undefined ? <Button disabled>{t("Loading…")}</Button> : <Button asChild><Link href="/login">{t("Log in")}</Link></Button> : !included && !owned && <Button disabled={catalogError || catalogLoading || cosmetics.buying || cosmetics.loading || !cosmetics.data || insufficient} onClick={() => { void cosmetics.purchase(item.kind, item.id, item.price).then(success => { if (success) setPurchased(`${userId}:${key}`); }); }}>{t(cosmetics.buying ? "Purchasing…" : "Buy for {count} coins", { count: item.price.toLocaleString(numberLocale) })}</Button>}
              {(included || owned) && <Button asChild variant="outline"><Link href="/loadout" data-analytics-link="/loadout">{t("View in loadout")}</Link></Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog></li>;
      })}</ul>
      {pages > 1 && <nav aria-label={t("Catalog pages")} className="flex items-center justify-center gap-3"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("Previous page")}</Button><p role="status" className="text-xs tabular-nums">{t("Page {page} of {count}", { page: currentPage + 1, count: pages })}</p><Button variant="outline" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>{t("Next page")}</Button></nav>}
    </section>
  </main>;
}
