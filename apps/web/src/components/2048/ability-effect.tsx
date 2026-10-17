"use client";

import { useEffect, useRef, useState } from "react";
import type { AbilityState } from "schema/in-game";
import { ABILITIES, type AbilityId } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { AbilityIcon } from "@/components/widget/ability-icon";
import { consumedAbility } from "@/lib/ability-effects";
import styles from "./ability-effect.module.css";

type Side = "you" | "opp";
type Cast = { ability: AbilityId; owner: Side; sequence: number };

export function AbilityEffect({ you, opponent, side, enabled }: {
  you?: AbilityState;
  opponent?: AbilityState;
  side: Side;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const previous = useRef<{ you?: AbilityState; opp?: AbilityState } | undefined>(undefined);
  const sequence = useRef(0);
  const [cast, setCast] = useState<Cast | null>(null);

  useEffect(() => {
    if (!enabled) {
      previous.current = undefined;
      setCast(null);
      return;
    }
    const current = { you, opp: opponent };
    for (const owner of ["you", "opp"] as const) {
      const ability = consumedAbility(previous.current?.[owner], current[owner]);
      if (!ability) continue;
      const offensive = ability === "frost-wave" || ability === "swap-32";
      const target = offensive ? owner === "you" ? "opp" : "you" : owner;
      if (target === side) setCast({ ability, owner, sequence: ++sequence.current });
    }
    previous.current = current;
  }, [you, opponent, side, enabled]);

  useEffect(() => {
    if (!cast) return;
    const timeout = window.setTimeout(() => setCast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [cast]);

  const message = cast ? t(cast.owner === "you" ? "You used {ability}." : side === "you" ? "Incoming ability: {ability}." : "Opponent used {ability}.", {
    ability: t(ABILITIES.find(ability => ability.id === cast.ability)!.name),
  }) : "";

  return <>
    {cast && <div key={cast.sequence} className={styles.effect} data-ability-effect={cast.ability} aria-hidden="true">
      <span className={styles.halo} /><span className={styles.trail} />
      <span className={styles.mark}><AbilityIcon abilityId={cast.ability} className={styles.icon} /></span>
    </div>}
    <p className={`${styles.notice} ${cast ? styles.visible : ""}`} role="status" aria-live="polite" aria-atomic="true">{message}</p>
  </>;
}
