"use client";

import { ABILITY_CHARGE, type AbilityState } from "schema/in-game";
import { ABILITIES } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { AbilityIcon } from "@/components/widget/ability-icon";

export function AbilityControls({ ability, onUse }: { ability: AbilityState; onUse?: () => void }) {
  const { t } = useI18n();
  const selected = ABILITIES.find(item => item.id === ability.id) ?? ABILITIES[0];
  const ready = ability.charge >= ABILITY_CHARGE;
  const active = ability.spawnPauseMoves > 0 || ability.anchorMoves > 0;
  return <Button type="button" variant="outline" disabled={!onUse || !ready || active} onClick={onUse}
    data-ability-control={ability.id} aria-label={t("Use {ability}", { ability: t(selected.name) })}
    title={t(selected.description)} className={`h-auto min-h-14 w-full gap-1.5 px-1.5 py-2 ${ready ? "border-primary bg-primary/5" : ""}`}>
    <AbilityIcon abilityId={ability.id} className="size-7" />
    <span className="min-w-0 text-center"><span className="block whitespace-normal text-xs font-bold">{t(selected.name)}</span>
      <span className="mt-0.5 block text-[10px] tabular-nums">{active ? t("Active") : ready ? t("Ability ready") : `${ability.charge} / ${ABILITY_CHARGE}`}</span>
    </span>
  </Button>;
}
