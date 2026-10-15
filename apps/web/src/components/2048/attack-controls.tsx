"use client";

import { MAX_ATTACK_STOCK, type AttackInventory, type AttackType } from "schema/in-game";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";

export function AttackControls({ attacks, onAttack }: { attacks: AttackInventory; onAttack?: (type: AttackType) => void }) {
  const { t } = useI18n();
  return <div className="attack-controls" role="group" aria-label={t("Attack controls")}>
    {(["xblock", "hardblock"] as const).map(type => <Button
      key={type}
      type="button"
      variant="outline"
      data-attack-control={type}
      disabled={!onAttack || attacks[type] === 0}
      onClick={() => onAttack?.(type)}
      aria-label={t(type === "xblock" ? "Send X block, {count} tickets" : "Send hard block, {count} tickets", { count: attacks[type] })}
      className="attack-trigger h-13 w-full min-w-0 flex-col gap-0.5 px-2 text-xs"
    >
      <span>{t(type === "xblock" ? "X attack" : "Hard attack")}</span>
      <span className="text-[10px] font-medium tabular-nums">{attacks[type]} / {MAX_ATTACK_STOCK}</span>
    </Button>)}
  </div>;
}
