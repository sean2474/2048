"use client";

import type { AttackType, Dir, PublicPlayerState } from "schema/in-game";
import { useI18n } from "ui/i18n";
import { BoardView } from "./board";
import { keyLabel, type Keybindings } from "@/lib/keybindings";
import { useLoadout } from "@/hooks/use-loadout";
import { ABILITIES } from "schema/loadout";
import { AbilityIcon } from "@/components/widget/ability-icon";
import { AbilityEffect } from "./ability-effect";

type ArenaPlayer = Pick<PublicPlayerState, "board" | "score" | "attacks"> & Partial<Pick<PublicPlayerState, "skinId" | "ability">>;

export function GameArena({ you, opponent, names, bindings, characterShortcuts = true, effectsEnabled = true, onMove, onAttack }: {
  you: ArenaPlayer;
  opponent?: ArenaPlayer;
  names: { you: string; opp: string };
  bindings: Keybindings;
  characterShortcuts?: boolean;
  effectsEnabled?: boolean;
  onMove?: (dir: Dir) => void;
  onAttack?: (type: AttackType) => void;
}) {
  const { t, locale } = useI18n();
  const { skin } = useLoadout();
  return <div className="game-stage-grid">
    <aside className="charge-rail" aria-label={t("Attack tickets")}>
      {(["hardblock", "xblock"] as const).map(type => <button key={type} type="button" data-attack={type} className="charge-button" disabled={!onAttack || you.attacks[type] === 0} onClick={() => onAttack?.(type)} aria-label={t(type === "xblock" ? "Send X block, {count} tickets" : "Send hard block, {count} tickets", { count: you.attacks[type] })} aria-keyshortcuts={characterShortcuts ? keyLabel(bindings[type]) : undefined}>
        <span className="text-[10px] font-bold">{type === "xblock" ? "X" : t("Hard")}</span>
        <span className="charge-slots" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <span key={index} className={`charge-slot ${index < you.attacks[type] ? type === "xblock" ? "charge-x" : "charge-hard" : "charge-empty"}`}>{index < you.attacks[type] && type === "xblock" ? "✖" : ""}</span>)}</span>
        <span className="text-xs font-bold tabular-nums">{you.attacks[type]}/3</span>
        <span className="text-[10px] text-muted-foreground">{characterShortcuts ? keyLabel(bindings[type]) : type === "xblock" ? "256" : "512"}</span>
      </button>)}
    </aside>
    <section className="game-player game-you" aria-label={t("Your side")}>
      <div className="game-player-heading"><div className="min-w-0"><p className="text-[10px] font-semibold text-muted-foreground">{t("Your board")}</p><h2 className="truncate text-sm font-bold">{names.you}</h2></div><div className="text-right"><p className="text-[10px] text-muted-foreground">{t("Score")}</p><p data-testid="your-score" className="text-lg font-extrabold tabular-nums">{you.score.toLocaleString(locale)}</p></div></div>
      <div className="relative isolate w-full max-w-[500px] rounded-2xl"><BoardView board={you.board} skinId={you.skinId ?? skin.id} label="Your game board. Swipe or use the arrow keys to move." onMove={onMove} />
        <AbilityEffect you={you.ability} opponent={opponent?.ability} side="you" enabled={effectsEnabled} />
      </div>
    </section>
    <section className="game-player game-opponent" aria-label={t("Opponent side")}>
      <div className="game-player-heading"><div className="min-w-0"><p className="text-[10px] font-semibold text-muted-foreground">{t("Opponent’s board")}</p><h2 className="truncate text-sm font-bold">{names.opp}</h2></div><div className="text-right"><p className="text-[10px] text-muted-foreground">{t("Score")}</p><p className="text-lg font-extrabold tabular-nums">{(opponent?.score ?? 0).toLocaleString(locale)}</p></div></div>
      <div className="opponent-board relative isolate rounded-2xl"><BoardView board={opponent?.board ?? []} skinId={opponent?.skinId ?? "classic"} label="Opponent’s game board" />
        <AbilityEffect you={you.ability} opponent={opponent?.ability} side="opp" enabled={effectsEnabled} />
      </div>
      <div className="opponent-stock text-xs text-muted-foreground"><p>{t("Opponent tickets")} · X {opponent?.attacks.xblock ?? 0}/3 · {t("Hard")} {opponent?.attacks.hardblock ?? 0}/3</p>
        {opponent?.ability && <p className="mt-1 flex items-center gap-1"><AbilityIcon abilityId={opponent.ability.id} className="size-5" />{t(ABILITIES.find(item => item.id === opponent.ability?.id)?.name ?? "Clear X")}</p>}
      </div>
    </section>
  </div>;
}
