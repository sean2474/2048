"use client";

import { ABILITY_CHARGE, type AbilityState } from "schema/in-game";
import { ABILITIES } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { keyLabel } from "@/lib/keybindings";
import { AbilityIcon } from "@/components/widget/ability-icon";

export function AbilityControls({
  ability,
  onUse,
  binding,
}: {
  ability: AbilityState;
  onUse?: () => void;
  binding?: string;
}) {
  const { t } = useI18n();
  const selected = ABILITIES.find((item) => item.id === ability.id) ?? ABILITIES[0];
  const ready = ability.charge >= ABILITY_CHARGE;
  const active = ability.spawnPauseMoves > 0 || ability.anchorMoves > 0;
  const percent = Math.min(100, Math.floor((ability.charge / ABILITY_CHARGE) * 100));
  return (
    <Button
      type="button"
      variant="outline"
      disabled={!onUse || !ready || active}
      onClick={onUse}
      aria-keyshortcuts={binding ? keyLabel(binding) : undefined}
      data-ability-control={ability.id}
      aria-label={t("Use {ability}", { ability: t(selected.name) })}
      aria-description={t(selected.description)}
      className={`ability-trigger ${ready ? "border-primary bg-primary/5" : ""}`}
    >
      <AbilityIcon abilityId={ability.id} className="size-7" />
      <span className="min-w-0 text-left">
        <span className="block whitespace-normal text-xs font-bold leading-4">
          {t(selected.name)}
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 tabular-nums">
          {active ? t("Active") : ready ? t("Ability ready") : `${percent}%`}
        </span>
      </span>
      {binding && (
        <kbd aria-hidden="true" className="rounded border px-1 py-0.5 text-[10px] font-semibold">
          {t(keyLabel(binding))}
        </kbd>
      )}
      <span aria-hidden="true" className="ability-charge">
        <span style={{ width: `${percent}%` }} />
      </span>
    </Button>
  );
}
