"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ABILITIES } from "schema/loadout";
import { useI18n } from "ui/i18n";
import { AbilityIcon } from "@/components/widget/ability-icon";
import { boardEffects, type BoardEffect, type EffectPlayer, type EffectPlayers, type Side } from "@/lib/board-effects";
import styles from "./board-effects.module.css";

type Burst = { effects: BoardEffect[]; sequence: number };

export function BoardEffects({ you, opponent, side, enabled }: {
  you: EffectPlayer;
  opponent?: EffectPlayer;
  side: Side;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const previous = useRef<EffectPlayers | undefined>(undefined);
  const sequence = useRef(0);
  const [burst, setBurst] = useState<Burst | null>(null);

  useEffect(() => {
    if (!enabled) {
      previous.current = undefined;
      setBurst(null);
      return;
    }
    const current = { you, opp: opponent };
    const effects = boardEffects(previous.current, current, side);
    if (effects.length) setBurst({ effects, sequence: ++sequence.current });
    previous.current = current;
  }, [you, opponent, side, enabled]);

  useEffect(() => {
    if (!burst) return;
    const timeout = window.setTimeout(() => setBurst(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [burst]);

  const message = burst?.effects.map(effect => effect.kind === "ability"
    ? t(effect.owner === "you" ? "You used {ability}." : side === "you" ? "Incoming ability: {ability}." : "Opponent used {ability}.", {
      ability: t(ABILITIES.find(ability => ability.id === effect.id)!.name),
    })
    : t(effect.phase === "sent" ? effect.owner === "you" ? "You sent {attack}." : "Opponent sent {attack}."
      : effect.phase === "incoming" ? side === "you" ? "Incoming {attack} · next move" : "Queued: {attack}"
      : side === "you" ? "{attack} landed on your board." : "Hit: {attack}", {
      attack: t(effect.id === "xblock" ? "X attack" : "Hard attack"),
    })).join(" · ") ?? "";

  return <>
    {burst?.effects.map((effect, index) => <div key={`${burst.sequence}-${index}`} className={styles.effect}
      data-ability-effect={effect.kind === "ability" ? effect.id : undefined}
      data-attack-effect={effect.kind === "attack" ? effect.id : undefined}
      data-attack-phase={effect.kind === "attack" ? effect.phase : undefined}
      style={{ "--effect-offset": `${(index - (burst.effects.length - 1) / 2) * 48}px` } as CSSProperties} aria-hidden="true">
      <span className={styles.halo} /><span className={styles.trail} />
      <span className={styles.mark}>{effect.kind === "ability" ? <AbilityIcon abilityId={effect.id} className={styles.icon} />
        : <span className={styles.attack}>{effect.id === "xblock" ? "✖" : "▰"}</span>}</span>
    </div>)}
    <p className={`${styles.notice} ${burst ? styles.visible : ""}`} role="status" aria-live="polite" aria-atomic="true">{message}</p>
  </>;
}
