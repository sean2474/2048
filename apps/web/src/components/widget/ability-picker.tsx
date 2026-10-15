"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronDown, LockKeyhole } from "lucide-react";
import { ABILITIES, DEFAULT_ABILITY_ID, type AbilityId } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { useLoadout } from "@/hooks/use-loadout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AbilityIcon } from "./ability-icon";

export function AbilityPicker() {
  const { t } = useI18n();
  const { abilityId, selectAbility, ready, saving, scope, storageError } = useLoadout();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<AbilityId | null>(null);
  const current = ABILITIES.find(item => item.id === abilityId) ?? ABILITIES[0];
  const guest = scope === "guest";

  async function select(id: AbilityId) {
    if (!guest && await selectAbility(id === DEFAULT_ABILITY_ID ? null : id)) setOpen(false);
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" disabled={!ready} onClick={() => setExpanded(null)} className="flex min-h-20 w-full items-center gap-3 rounded-xl border bg-secondary/30 p-3 text-left transition-colors hover:bg-secondary/60 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <AbilityIcon abilityId={current.id} />
      <span className="min-w-0 flex-1"><span className="block text-[11px] font-medium text-muted-foreground">{t("Special ability")}</span><span className="block text-sm font-bold">{ready ? t(current.name) : t("Loading selection…")}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t(current.summary)}</span></span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
    </button></DialogTrigger>
    <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
      <DialogHeader className="shrink-0 p-5 pr-14 text-left"><DialogTitle>{t("Special ability")}</DialogTitle><DialogDescription className="leading-5">{t("Choose one ability for your next match. Clear X is the default.")}</DialogDescription></DialogHeader>
      <div className="max-h-[65dvh] min-h-0 space-y-1.5 overflow-y-auto px-4 pb-4">
        {ABILITIES.map(item => {
          const id = item.id;
          const selected = abilityId === id;
          const locked = guest && id !== DEFAULT_ABILITY_ID;
          return <div key={id} className={`overflow-hidden rounded-xl border ${selected ? "border-primary bg-primary/5" : "bg-card"}`}>
            <button type="button" aria-expanded={expanded === id} aria-controls={`ability-detail-${id}`} onClick={() => setExpanded(expanded === id ? null : id)} className="flex w-full items-center gap-3 px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
              <AbilityIcon abilityId={id} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-5">{t(item.name)}{id === DEFAULT_ABILITY_ID && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t("Default ability")}</span>}</span><span className="mt-1 block text-xs leading-4 text-muted-foreground">{t(item.summary)}</span></span>
              {selected ? <Check aria-label={t("Equipped")} className="size-4 shrink-0 text-primary" /> : locked ? <LockKeyhole aria-label={t("Login required")} className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown aria-hidden="true" className="size-4 shrink-0" />}
            </button>
            <div id={`ability-detail-${id}`} hidden={expanded !== id} className="space-y-3 border-t px-4 py-3">
              <p className="text-sm leading-6">{t(item.description)}</p>
              <p className="text-xs leading-5 text-muted-foreground">{t(item.tradeoff)}</p>
              {locked ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{t("Log in to unlock this item.")}</p><Button asChild size="sm"><Link href="/login">{t("Log in")}</Link></Button></div> : <Button className="w-full" disabled={!ready || saving || selected || guest} onClick={() => { void select(id); }}>{t(saving ? "Saving…" : selected ? "Equipped" : "Equip")}</Button>}
              {id === DEFAULT_ABILITY_ID && <Button asChild variant="outline" className="w-full"><Link href="/tutorial" onClick={() => setOpen(false)}>{t("Try the tutorial")}</Link></Button>}
            </div>
          </div>;
        })}
        {storageError && <p role="alert" className="text-sm text-destructive">{t(storageError)}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}
