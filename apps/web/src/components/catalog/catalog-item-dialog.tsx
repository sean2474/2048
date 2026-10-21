"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Skin } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSettings } from "@/hooks/settings-provider";
import { usePlayer } from "@/hooks/use-player";
import { purchaseCosmetic } from "@/actions/collection";
import { trackGameEvent } from "@/lib/analytics";
import type { CosmeticKind } from "@/lib/collection";

const SkinMergePreview = dynamic(() => import("@/components/2048/skin-merge-preview").then(module => module.SkinMergePreview));

type Props = {
  children: ReactNode; details: ReactNode; title: string; description: string; label: string;
  itemId: string; kind: CosmeticKind; mode: "shop" | "loadout"; userId?: string;
  owned: boolean; selected: boolean; unavailable: boolean; disabled: boolean; price: number;
  unlockHref: string; unlockLabel: string; legendarySkin?: Skin; className: string;
};

// Only dialog state, preview playback and mutations cross the client boundary.
// The card, static preview and unlock details arrive as server-rendered slots.
export function CatalogItemDialog(props: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false), [error, setError] = useState<string | null>(null), [purchased, setPurchased] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const router = useRouter();
  const settings = useSettings();
  const { user } = usePlayer();
  const liveUserId = user && !user.is_anonymous ? user.id : undefined;
  const liveAccount = useRef(liveUserId);
  const sameAccount = user !== undefined && liveUserId === props.userId;
  useEffect(() => { liveAccount.current = liveUserId; setOpen(false); setError(null); setPurchased(false); }, [liveUserId]);
  const owned = props.owned || purchased;
  function mutate() {
    if (busy.current || !sameAccount) return;
    const requestAccount = props.userId;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      try {
        if (props.mode === "shop") {
          const result = await purchaseCosmetic({ kind: props.kind, id: props.itemId, expectedPrice: props.price }, requestAccount);
          if (liveAccount.current !== requestAccount) return;
          if (!result.ok) { setError(result.error ?? "Could not complete your purchase. Please try again."); router.refresh(); return; }
          setPurchased(true);
        } else {
          const success = await settings.saveSettings(props.kind === "skin" ? { skinId: props.itemId } : { iconId: props.itemId });
          if (liveAccount.current !== requestAccount) return;
          if (!success) { setError("Could not save your settings. Please try again."); return; }
          trackGameEvent("cosmetic_equipped", { category: props.kind === "skin" ? "skins" : "icons", item: props.itemId });
          setOpen(false);
        }
        router.refresh();
      } catch { setError(props.mode === "shop" ? "Could not complete your purchase. Please try again." : "Could not save your settings. Please try again."); }
      finally { busy.current = false; }
    });
  }
  return <Dialog open={open && sameAccount} onOpenChange={next => { if (!sameAccount) { router.refresh(); return; } setOpen(next); setError(null); if (next) trackGameEvent("cosmetic_previewed", { item: props.itemId, source: props.mode }); }}>
    <DialogTrigger asChild><button type="button" aria-label={props.label} aria-describedby={props.selected ? "equipped-label" : undefined} className={props.className}>{props.children}</button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{props.title}</DialogTitle><DialogDescription>{props.description}</DialogDescription></DialogHeader>
      {open && props.legendarySkin && <SkinMergePreview skin={props.legendarySkin} />}
      {props.details}
      {purchased && <p role="status" className="text-sm font-semibold text-primary">{t("Purchase complete.")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      <DialogFooter>
        {!props.userId ? <Button asChild><Link href="/login">{t("Log in")}</Link></Button>
          : props.mode === "shop" ? owned ? <Button asChild variant="outline"><Link href="/loadout">{t("View in loadout")}</Link></Button> : <Button disabled={pending || props.disabled || props.unavailable} onClick={mutate}>{t(pending ? "Purchasing…" : "Buy for {count} coins", { count: props.price.toLocaleString(locale === "ko" ? "ko-KR" : "en-US") })}</Button>
          : owned ? <Button disabled={pending || props.disabled || props.selected || !settings.ready || settings.saving} onClick={mutate}>{t(pending ? "Saving…" : props.selected ? "Equipped" : "Equip")}</Button>
          : props.unavailable ? <Button disabled>{t("Currently unavailable")}</Button> : <Button asChild><Link href={props.unlockHref}>{props.unlockLabel}</Link></Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
