import Link from "next/link";
import { Check, LockKeyhole } from "lucide-react";
import { SKINS, SKIN_RARITIES } from "schema/loadout";
import { GUEST_PROFILE_ICON } from "schema/profile-icons";
import { COIN_REASON_LABELS } from "schema/economy";
import { getI18n } from "@/lib/i18n/server";
import { getCollection } from "@/lib/server/collection";
import { COLLECTION_PAGE_SIZE, localizeCatalog, ownsCosmetic, visibleCollection, type CollectionQuery, type CollectionItem } from "@/lib/collection";
import { SkinPreview } from "@/components/2048/skin-preview";
import { Button } from "@/components/ui/button";
import { GameEmblem } from "@/components/widget/game-emblem";
import { RefreshButton } from "@/components/widget/refresh-records";
import { CatalogIcon } from "./catalog-icon";
import { CatalogItemDialog } from "./catalog-item-dialog";
import { RefreshCollectionOnFocus } from "./refresh-collection-on-focus";
import { CollectionControls, CollectionPagination } from "./collection-controls";

export async function CollectionView({ mode, query }: { mode: "shop" | "loadout"; query: CollectionQuery }) {
  const [snapshot, { t, locale }] = await Promise.all([getCollection(mode), getI18n()]);
  const { userId, cosmetics, cosmeticsError, unlockedIds, unlocksError, settings } = snapshot;
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  const ownership = { userId, purchases: cosmetics?.purchases ?? [], unlockedIds };
  const catalog = snapshot.catalog && localizeCatalog(snapshot.catalog, locale);
  const selectedSkin = catalog?.skins.find(item => item.id === settings.skinId) ?? SKINS[0];
  const selectedIcon = userId ? catalog?.profileIcons.find(item => item.id === settings.iconId) : GUEST_PROFILE_ICON;
  const selectedId = query.category === "skin" ? selectedSkin.id : selectedIcon?.id;
  const items = catalog ? visibleCollection(catalog, ownership, mode, query, selectedId) : [];
  if (catalog && mode === "loadout" && !userId && query.category === "icon") items.unshift({ ...GUEST_PROFILE_ICON, kind: "icon", color: "#a8a29e", imagePath: "profile-icons/fox.svg", description: "Guests always use this icon.", status: "published", sortOrder: 0, acquisition: "free", price: 0, revision: 1, publishedOnce: true, updatedAt: "2026-01-01T00:00:00Z" });
  const pages = Math.ceil(items.length / COLLECTION_PAGE_SIZE), page = Math.min(query.page, Math.max(0, pages - 1));
  return <>
    <RefreshCollectionOnFocus />
    <section aria-labelledby={`${mode}-wallet-title`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2"><GameEmblem kind="coin" className="size-8" /><h2 id={`${mode}-wallet-title`} className="text-xs text-muted-foreground">{t("My coins")}</h2>
        {!userId ? <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">{t("Log in")}</Link> : cosmeticsError || !cosmetics ? <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-xs text-destructive">{t("Could not load your cosmetics.")}</p><RefreshButton /></div> : <p className="text-lg font-extrabold tabular-nums">{cosmetics.balance.toLocaleString(numberLocale)}</p>}
      </div>
      {mode === "loadout" && <div className="flex flex-wrap gap-2"><Button asChild variant="ghost" size="sm"><Link href="/achievements">{t("Achievements")}</Link></Button><Button asChild variant="ghost" size="sm"><Link href="/shop">{t("Coin shop")}</Link></Button></div>}
    </section>
    {mode === "shop" && userId && <section aria-labelledby="coin-history-title" className="space-y-2 rounded-xl border bg-card px-4 py-3"><h2 id="coin-history-title" className="text-xs text-muted-foreground">{t("Recent coin activity")}</h2>
      {snapshot.historyError ? <p role="alert" className="text-xs text-destructive">{t("Could not load your coin activity.")}</p> : !snapshot.history.length ? <p className="text-xs text-muted-foreground">{t("No coin activity yet.")}</p> : <ol className="divide-y text-sm">{snapshot.history.map(entry => <li key={entry.id} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="font-semibold">{t((COIN_REASON_LABELS as Record<string, string>)[entry.reason] ?? "Coin change")}</p><p className="text-[11px] text-muted-foreground">{new Date(entry.created_at).toLocaleString(numberLocale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })}</p></div><div className="text-right tabular-nums"><p className={`font-semibold ${entry.delta > 0 ? "text-primary" : "text-destructive"}`}>{entry.delta > 0 ? "+" : ""}{entry.delta.toLocaleString(numberLocale)}</p><p className="text-[11px] text-muted-foreground">{t("Balance {count}", { count: entry.balance_after.toLocaleString(numberLocale) })}</p></div></li>)}</ol>}
    </section>}
    {mode === "loadout" && <>
      {snapshot.settingsError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs"><p>{t("Could not load your settings. Retry before making changes.")}</p><RefreshButton /></div>}
      {unlocksError && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs"><p>{t("Could not load achievement progress.")}</p><RefreshButton label="Reload unlock information" /></div>}
      <section aria-label={t("Current loadout")} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-3">{selectedIcon && <CatalogIcon icon={selectedIcon} className="size-10" />}<div className="min-w-0 text-xs leading-5"><p className="font-bold">{t(selectedIcon?.name ?? "My loadout")}</p><p className="text-muted-foreground">{t(selectedSkin.name)}</p></div></section>
    </>}
    <CollectionControls mode={mode} query={query} />
    {snapshot.catalogError || !catalog ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm"><p>{t("Could not load the collection. Your purchases are safe.")}</p><RefreshButton label="Reload collection" /></div> : <section aria-label={t(query.category === "skin" ? "Board skins" : "Icons")} className="space-y-4">
      <ul id={`${mode}-items`} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{items.slice(page * COLLECTION_PAGE_SIZE, (page + 1) * COLLECTION_PAGE_SIZE).map(item => {
        const owned = ownsCosmetic(catalog, ownership, item.kind, item.id), included = item.acquisition === "free", selected = mode === "loadout" && item.id === selectedId;
        const achievements = catalog.achievements.filter(achievement => item.kind === "skin" ? "skinId" in achievement.reward && achievement.reward.skinId === item.id : "iconId" in achievement.reward && achievement.reward.iconId === item.id);
        const achievement = achievements.find(item => item.status === "published") ?? achievements.find(item => unlockedIds.includes(item.id));
        const unavailable = !owned && item.acquisition === "achievement" && !achievement;
        const insufficient = Boolean(cosmetics && cosmetics.balance < item.price);
        const name = t(item.name), legendarySkin = item.kind === "skin" && item.rarity === "legendary" ? item : undefined;
        return <li key={`${userId ?? "guest"}:${item.kind}:${item.id}`} className="min-w-0"><CatalogItemDialog itemId={item.id} kind={item.kind} mode={mode} userId={userId} title={name} description={t(mode === "shop" ? item.description || "Shown on your profile and match intro." : item.kind === "skin" ? "Skins change appearance only." : item.id === "guest" ? "Guests always use this icon." : "Shown on your profile and match intro.")} label={t(mode === "shop" ? "{item} · Preview shop item" : owned ? "{item} · View details" : "{item} · Locked · View unlock conditions", { item: name })} owned={mode === "shop" ? included || owned : owned} selected={selected} unavailable={unavailable} disabled={cosmeticsError || (mode === "loadout" && (unlocksError || snapshot.settingsError)) || (mode === "shop" && (!cosmetics || insufficient))} price={item.price} unlockHref={achievement ? `/achievements#${achievement.id}` : "/shop"} unlockLabel={t(achievement ? "Unlock through achievements" : "Buy in shop")} legendarySkin={legendarySkin} className={`relative flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl border bg-card px-2 py-4 text-center transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary/5" : ""}`} details={<>
          {!legendarySkin && <div className="flex justify-center py-2"><ItemPreview item={item} large /></div>}
          {mode === "shop" ? <><p className="text-center text-sm tabular-nums">{t(included ? "Included by default" : owned ? "Owned" : "{count} coins", { count: item.price.toLocaleString(numberLocale) })}</p>{!owned && !included && insufficient && <p className="text-sm text-muted-foreground">{t("Not enough coins.")}</p>}</> : <div className="space-y-1 border-t pt-3"><h3 className="flex items-center gap-2 text-sm font-bold">{owned ? <Check aria-hidden="true" className="size-4" /> : <LockKeyhole aria-hidden="true" className="size-4" />}{t("Unlock conditions")}</h3><p className="text-sm text-muted-foreground">{t(unavailable ? "Currently unavailable" : achievement ? achievement.description : owned ? !userId || included ? "Included by default" : "Owned" : !userId ? "Log in to unlock this item." : "Available in the coin shop.")}</p>{achievement && owned && <p className="pt-1 text-xs text-primary">{t("Permanently unlocked")}</p>}</div>}</>}>
          {mode === "loadout" && (selected ? <Check aria-label={t("Equipped")} className="absolute right-2 top-2 size-3.5 text-primary" /> : !owned && <LockKeyhole aria-hidden="true" className="absolute right-2 top-2 size-3.5 text-muted-foreground" />)}
          {mode === "shop" && item.kind === "skin" && <span className="text-[11px] text-muted-foreground">{t(SKIN_RARITIES[item.rarity].name)}</span>}
          <ItemPreview item={item} /><span className="flex min-h-8 items-center justify-center text-xs font-bold leading-4 sm:text-sm">{name}</span>
          {mode === "shop" && <><span className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground">{included || owned ? <Check aria-hidden="true" className="size-3" /> : <LockKeyhole aria-hidden="true" className="size-3" />}{t(included ? "Included by default" : owned ? "Owned" : "Locked")}</span>{!included && !owned && <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"><GameEmblem kind="coin" className="size-5" />{item.price.toLocaleString(numberLocale)}</span>}</>}
        </CatalogItemDialog></li>;
      })}</ul>
      {!items.length && <p role="status" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No owned items in this filter.")}</p>}
      <CollectionPagination mode={mode} query={query} count={pages} page={page} />
    </section>}
  </>;
}

function ItemPreview({ item, large = false }: { item: CollectionItem; large?: boolean }) {
  return item.kind === "skin" ? <SkinPreview skin={item} large={large} /> : <CatalogIcon icon={item} className={large ? "size-32" : "size-[72px] sm:size-20"} />;
}
