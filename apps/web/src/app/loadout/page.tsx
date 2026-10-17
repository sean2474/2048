"use client";

import Link from "next/link";
import { PageHeading } from "@/components/widget/page-heading";
import { GameEmblem } from "@/components/widget/game-emblem";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, LockKeyhole, Palette, UserRound } from "lucide-react";
import { SKIN_RARITIES, type SkinId, type SkinRarity } from "schema/loadout";
import { GUEST_PROFILE_ICON, type PlayerIconId } from "schema/profile-icons";
import { ProfileIcon } from "@/components/widget/profile-icon";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlayer } from "@/hooks/use-player";
import { useLoadout } from "@/hooks/use-loadout";
import { useAchievements } from "@/hooks/use-achievements";
import { useCatalog } from "@/hooks/catalog-provider";
import { useCosmetics } from "@/hooks/use-cosmetics";
import { SkinPreview } from "@/components/2048/skin-preview";
import dynamic from "next/dynamic";
import { CatalogSkeleton } from "@/components/widget/catalog-skeleton";

const SkinMergePreview = dynamic(() => import("@/components/2048/skin-merge-preview").then(module => module.SkinMergePreview));
import { trackGameEvent } from "@/lib/analytics";

const PAGE_SIZE = 12;
type Category = "skins" | "icons";
type Detail = { category: "skins"; id: SkinId } | { category: "icons"; id: PlayerIconId };

function CatalogCard({ name, selected, locked, disabled, onClick, children }: { name: string; selected: boolean; locked: boolean; disabled: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void; children: ReactNode }) {
  const { t } = useI18n();
  return <button type="button" aria-label={t(locked ? "{item} · Locked · View unlock conditions" : "{item} · View details", { item: name })} aria-describedby={selected ? "equipped-label" : undefined} aria-haspopup="dialog" disabled={disabled} onClick={onClick} className={`relative flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border bg-card px-2 py-4 text-center transition-colors hover:border-primary/60 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary/5" : ""}`}>
    {selected ? <Check aria-label={t("Equipped")} className="absolute right-2 top-2 size-3.5 text-primary" /> : locked && <LockKeyhole aria-hidden="true" className="absolute right-2 top-2 size-3.5 text-muted-foreground" />}
    {children}<span className="flex min-h-8 items-center justify-center text-xs font-bold leading-4 sm:text-sm">{name}</span>
  </button>;
}

export default function LoadoutPage() {
  const { t, locale } = useI18n();
  const { user } = usePlayer();
  const catalog = useCatalog();
  const { skins, profileIcons, achievementForItem } = catalog;
  const achievements = useAchievements();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const { skin, icon, selectSkin, selectIcon, storageError, ready, saving, scope } = useLoadout();
  const cosmetics = useCosmetics(user);
  const [category, setCategory] = useState<Category>("skins");
  const [skinPage, setSkinPage] = useState(0);
  const [rarity, setRarity] = useState<SkinRarity | "all">("all");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const guest = scope === "guest";

  const owns = (kind: "skin" | "icon", id: string) => {
    if (guest) return kind === "skin" ? id === "classic" : id === "guest";
    return cosmetics.owns(kind, id) || catalog.achievements.some(item => {
      const reward = item.reward;
      return (kind === "skin" ? "skinId" in reward && reward.skinId === id : "iconId" in reward && reward.iconId === id)
        && achievements.data?.unlocks.some(unlock => unlock.achievementId === item.id);
    });
  };
  const balance = cosmetics.data?.balance;
  const filteredSkins = skins.filter(item => (item.status === "published" || owns("skin", item.id) || item.id === skin.id) && (rarity === "all" || item.rarity === rarity) && (!ownedOnly || owns("skin", item.id)));
  const pageCount = Math.ceil(filteredSkins.length / PAGE_SIZE);
  const currentPage = Math.min(skinPage, Math.max(0, pageCount - 1));
  const icons = guest ? [GUEST_PROFILE_ICON, ...profileIcons.filter(item => item.status === "published")] : profileIcons.filter(item => item.status === "published" || owns("icon", item.id) || item.id === icon.id);
  const detailSkin = detail?.category === "skins" ? skins.find(item => item.id === detail.id) : undefined;
  const detailIcon = detail?.category === "icons" ? [GUEST_PROFILE_ICON, ...profileIcons].find(item => item.id === detail.id) : undefined;
  const detailName = detailSkin?.name ?? detailIcon?.name ?? "My loadout";
  const detailAchievement = detail ? achievementForItem(detail.category === "skins" ? "skin" : "icon", detail.id, achievements.data?.unlocks.map(item => item.achievementId)) : undefined;
  const detailIncluded = detail && (detail.category === "skins" ? skins : profileIcons).some(item => item.id === detail.id && item.acquisition === "free");
  const detailOwned = Boolean(detail && owns(detail.category === "skins" ? "skin" : "icon", detail.id));
  const detailUnavailable = !detailOwned && !detailAchievement && (detailSkin?.acquisition === "achievement" || detailIcon && "acquisition" in detailIcon && detailIcon.acquisition === "achievement");
  const detailSelected = detail?.category === "skins" ? detail.id === skin.id : detail?.id === icon.id;

  function openDetail(event: MouseEvent<HTMLButtonElement>, next: Detail) {
    detailTrigger.current = event.currentTarget;
    setDetail(next);
    setDetailOpen(true);
    trackGameEvent("cosmetic_previewed", { item: next.id, source: "loadout" });
  }
  async function equipDetail() {
    if (!detail || guest || !detailOwned) return;
    const success = detail.category === "skins" ? await selectSkin(detail.id) : detail.id !== "guest" && await selectIcon(detail.id);
    if (success) {
      setDetailOpen(false);
      trackGameEvent("cosmetic_equipped", { category: detail.category, item: detail.id });
    }
  }

  return <main className="mx-auto max-w-[1040px] space-y-4 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
    <span id="equipped-label" className="sr-only">{t("Equipped")}</span>
    <PageHeading icon="loadout" title={t("My loadout")}><Button asChild variant="outline"><Link href="/find-match" data-analytics-link="/find-match"><ArrowLeft aria-hidden="true" />{t("Find match")}</Link></Button></PageHeading>

    <section aria-labelledby="wallet-title" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2">
      <div className="flex items-center gap-2"><GameEmblem kind="coin" className="size-8" /><h2 id="wallet-title" className="text-xs text-muted-foreground">{t("My coins")}</h2>{user === undefined || userId && cosmetics.loading ? <p role="status" className="text-xs">{t("Loading balance…")}</p> : !userId ? <Link href="/login" data-analytics-link="/login" aria-label={t("Sign in to view your balance")} className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{t("Log in")}</Link> : cosmetics.error || balance === undefined ? <div role="alert" className="flex flex-wrap items-center gap-2"><p className="text-xs text-destructive">{t("Could not load your cosmetics.")}</p><Button variant="outline" size="sm" onClick={() => void cosmetics.reload()}>{t("Try again")}</Button></div> : <p className="text-lg font-extrabold tabular-nums">{balance.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</p>}</div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="ghost" size="sm" className="text-xs"><Link href="/achievements" data-analytics-link="/achievements">{t("Achievements")}</Link></Button><Button asChild variant="ghost" size="sm" className="text-xs"><Link href="/shop" data-analytics-link="/shop">{t("Coin shop")}</Link></Button></div>
    </section>

    {!guest && achievements.loading && !achievements.data && <p role="status" className="text-xs text-muted-foreground">{t("Checking unlock information…")}</p>}
    {!guest && achievements.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs"><p>{t("Could not load achievement progress.")}</p><Button variant="outline" size="sm" onClick={() => void achievements.reload()}>{t("Reload unlock information")}</Button></div>}
    {saving && <p role="status" className="text-sm text-muted-foreground">{t("Saving…")}</p>}
    {storageError && !detailOpen && <p role="alert" className="text-sm text-destructive">{t(storageError)}</p>}

    <section aria-label={t("Current loadout")} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-3">
      <ProfileIcon iconId={icon.id} className="size-10" />
      <div className="min-w-0 text-xs leading-5"><p className="font-bold">{ready ? t(icon.name) : t("Loading selection…")}</p><p className="text-muted-foreground">{ready ? t(skin.name) : t("Loading selection…")}</p></div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="tablist" aria-label={t("Loadout categories")} className="inline-flex gap-1 rounded-xl bg-muted p-1" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const categories = ["skins", "icons"] as const;
        const next = event.key === "Home" ? "skins" : event.key === "End" ? "icons" : categories[(categories.indexOf(category) + (event.key === "ArrowRight" ? 1 : categories.length - 1)) % categories.length];
        setCategory(next);
        event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
      }}>
        {([{ id: "skins", label: "Board skins", icon: Palette }, { id: "icons", label: "Icons", icon: UserRound }] as const).map(item => <Button key={item.id} id={`${item.id}-tab`} role="tab" aria-selected={category === item.id} aria-controls={`${item.id}-panel`} tabIndex={category === item.id ? 0 : -1} variant="ghost" className={`px-3 text-xs ${category === item.id ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground"}`} onClick={() => setCategory(item.id)}><item.icon aria-hidden="true" className="size-3.5" />{t(item.label)}</Button>)}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1 text-xs font-medium"><input type="checkbox" className="size-4 accent-primary" checked={ownedOnly} onChange={event => { setOwnedOnly(event.target.checked); setSkinPage(0); }} />{t("Owned only")}</label>
    </div>

    <section id="skins-panel" role="tabpanel" aria-labelledby="skins-tab" tabIndex={0} hidden={category !== "skins"} className="space-y-3 rounded-xl">
      <div role="group" aria-label={t("Filter by rarity")} className="flex flex-wrap gap-1">{(["all", ...Object.keys(SKIN_RARITIES)] as Array<SkinRarity | "all">).map(value => <Button key={value} variant="ghost" aria-pressed={rarity === value} aria-controls="skin-results" className={`px-3 text-xs ${rarity === value ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} onClick={() => { setRarity(value); setSkinPage(0); trackGameEvent("skin_filter_changed", { rarity: value, source: "loadout" }); }}>{t(value === "all" ? "All skins" : SKIN_RARITIES[value].name)}</Button>)}</div>
      {/* The skeleton occupies the grid's own slot so the catalog load does not shift the sections above it. */}
      {catalog.loading && catalog.skins.length === 0 && <CatalogSkeleton label={t("Loading collection…")} />}
      <div id="skin-results" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{filteredSkins.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(item => <CatalogCard key={item.id} name={t(item.name)} selected={skin.id === item.id} locked={!owns("skin", item.id)} disabled={!ready || saving} onClick={event => openDetail(event, { category: "skins", id: item.id })}><SkinPreview skin={item} /></CatalogCard>)}</div>
      {filteredSkins.length === 0 && <p role="status" className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("No owned items in this filter.")}</p>}
      {pageCount > 1 && <nav aria-label={t("Catalog pages")} className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" aria-label={t("Previous page")} disabled={currentPage === 0} onClick={() => { setSkinPage(currentPage - 1); document.getElementById("skins-panel")?.focus({ preventScroll: true }); }}><ChevronLeft aria-hidden="true" /></Button>
        <p role="status" className="text-xs tabular-nums text-muted-foreground">{t("Page {page} of {count}", { page: currentPage + 1, count: pageCount })}</p>
        <Button variant="outline" size="icon" aria-label={t("Next page")} disabled={currentPage + 1 >= pageCount} onClick={() => { setSkinPage(currentPage + 1); document.getElementById("skins-panel")?.focus({ preventScroll: true }); }}><ChevronRight aria-hidden="true" /></Button>
      </nav>}
    </section>

    <section id="icons-panel" role="tabpanel" aria-labelledby="icons-tab" tabIndex={0} hidden={category !== "icons"} className="rounded-xl">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">{icons.filter(item => !ownedOnly || owns("icon", item.id)).map(item => <CatalogCard key={item.id} name={t(item.name)} selected={icon.id === item.id} locked={!owns("icon", item.id)} disabled={!ready || saving} onClick={event => openDetail(event, { category: "icons", id: item.id })}><ProfileIcon iconId={item.id} className="size-[72px] sm:size-20" /></CatalogCard>)}</div>
    </section>

    <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); detailTrigger.current?.focus(); }}>
        {detailSkin?.rarity !== "legendary" && <div className="flex justify-center py-2">{detailSkin ? <SkinPreview skin={detailSkin} large /> : detailIcon ? <ProfileIcon iconId={detailIcon.id} className="size-32" /> : null}</div>}
        <DialogHeader>
          <DialogTitle>{t(detailName)}</DialogTitle>
          <DialogDescription className="leading-6">{t(detailSkin ? "Skins change appearance only." : detailIcon?.id === "guest" ? "Guests always use this icon." : "Shown on your profile and match intro.")}</DialogDescription>
        </DialogHeader>
        {detailOpen && detailSkin?.rarity === "legendary" && <SkinMergePreview key={detailSkin.id} skin={detailSkin} />}
        <div className="space-y-1 border-t pt-3"><h3 className="flex items-center gap-2 text-sm font-bold">{detailOwned ? <Check aria-hidden="true" className="size-4" /> : <LockKeyhole aria-hidden="true" className="size-4" />}{t("Unlock conditions")}</h3><p className="text-sm text-muted-foreground">{t(detailUnavailable ? "Currently unavailable" : detailAchievement ? detailAchievement.description : detailOwned ? guest || detailIncluded ? "Included by default" : "Owned" : guest ? "Log in to unlock this item." : "Available in the coin shop.")}</p>{detailAchievement && detailOwned && <p className="pt-1 text-xs text-primary">{t("Permanently unlocked")}</p>}</div>
        {storageError && <p role="alert" className="text-sm text-destructive">{t(storageError)}</p>}
        <DialogFooter>{!detailOwned ? detailUnavailable ? <Button disabled>{t("Currently unavailable")}</Button> : <Button asChild><Link href={guest ? "/login" : detailAchievement ? `/achievements#${detailAchievement.id}` : "/shop"}>{t(guest ? "Log in" : detailAchievement ? "Unlock through achievements" : "Buy in shop")}</Link></Button> : <Button disabled={!ready || saving || detailSelected || guest} onClick={() => { void equipDetail(); }}>{t(detailSelected ? "Equipped" : "Equip")}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}
