"use client";

import { ABILITY_CHARGE, type Dir, type PublicPlayerState } from "schema/in-game";
import { useI18n } from "ui/i18n";
import { BoardView } from "./board";
import { useLoadout } from "@/hooks/use-loadout";
import { ABILITIES } from "schema/loadout";
import { AbilityIcon } from "@/components/widget/ability-icon";
import { BoardEffects } from "./board-effects";
import { AbilityControls } from "./ability-controls";
import { ProfileIcon } from "@/components/widget/profile-icon";

type ArenaPlayer = Pick<PublicPlayerState, "board" | "score" | "attacksSent"> & Partial<Pick<PublicPlayerState, "skinId" | "iconId" | "ability">>;

export function GameArena({ you, opponent, names, abilityBinding, effectsEnabled = true, spectating = false, onMove, onAbility }: {
  you: ArenaPlayer;
  opponent?: ArenaPlayer;
  names: { you: string; opp: string };
  abilityBinding?: string;
  effectsEnabled?: boolean;
  spectating?: boolean;
  onMove?: (dir: Dir) => void;
  onAbility?: () => void;
}) {
  const { t, locale } = useI18n();
  const { skin } = useLoadout();
  const opponentAbility = opponent?.ability;
  const opponentActive = !!opponentAbility && (opponentAbility.spawnPauseMoves > 0 || opponentAbility.anchorMoves > 0);
  return <div className="game-stage-grid">
    <section className="game-player game-you" aria-label={spectating ? names.you : t("Your side")}>
      <div className="game-player-heading"><div className="flex min-w-0 items-center gap-2"><ProfileIcon iconId={you.iconId ?? "guest"} className="size-9" /><div className="min-w-0"><p className="text-[10px] font-semibold text-muted-foreground">{t(spectating ? "Watching player" : "Your board")}</p><h2 className="truncate text-sm font-bold">{names.you}</h2></div></div><div className="text-right"><p className="text-[10px] text-muted-foreground">{t("Score")}</p><p data-testid="your-score" className="text-lg font-extrabold tabular-nums">{you.score.toLocaleString(locale)}</p></div></div>
      <div className="relative isolate w-full max-w-[500px] rounded-2xl"><BoardView board={you.board} skinId={you.skinId ?? skin.id} label={spectating ? t("{name}’s game board", { name: names.you }) : "Your game board. Swipe or use the arrow keys to move."} onMove={onMove} />
        <BoardEffects you={you} opponent={opponent} side="you" enabled={effectsEnabled} />
      </div>
      {you.ability && <div className="player-ability"><AbilityControls ability={you.ability} binding={abilityBinding} onUse={onAbility} /></div>}
    </section>
    <section className="game-player game-opponent" aria-label={t("Opponent side")}>
      <div className="game-player-heading"><div className="flex min-w-0 items-center gap-2"><ProfileIcon iconId={opponent?.iconId ?? "guest"} className="size-9" /><div className="min-w-0"><p className="text-[10px] font-semibold text-muted-foreground">{t("Opponent’s board")}</p><h2 className="truncate text-sm font-bold">{names.opp}</h2></div></div><div className="text-right"><p className="text-[10px] text-muted-foreground">{t("Score")}</p><p className="text-lg font-extrabold tabular-nums">{(opponent?.score ?? 0).toLocaleString(locale)}</p></div></div>
      <div className="opponent-board relative isolate rounded-2xl"><BoardView board={opponent?.board ?? []} skinId={opponent?.skinId ?? "classic"} label="Opponent’s game board" />
        <BoardEffects you={you} opponent={opponent} side="opp" enabled={effectsEnabled} />
      </div>
      <div className="player-ability opponent-ability text-xs text-muted-foreground">
        {opponentAbility && <div data-opponent-ability={opponentAbility.id} className="flex min-w-0 items-center gap-2 rounded-lg border bg-card/80 px-2 py-1.5 text-foreground">
          <AbilityIcon abilityId={opponentAbility.id} className="size-9" />
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold leading-4">{t(ABILITIES.find(item => item.id === opponentAbility.id)?.name ?? "Clear X")}</p>
            <div className="mt-1 flex items-center gap-2"><span className="shrink-0 text-[10px] tabular-nums">{opponentActive ? t("Active") : opponentAbility.charge >= ABILITY_CHARGE ? t("Ability ready") : `${Math.min(100, Math.floor(opponentAbility.charge / ABILITY_CHARGE * 100))}%`}</span>
              <div role="progressbar" aria-label={t("Opponent ability charge")} aria-valuemin={0} aria-valuemax={ABILITY_CHARGE} aria-valuenow={opponentAbility.charge} className="h-1 min-w-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, opponentAbility.charge / ABILITY_CHARGE * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>}
      </div>
    </section>
  </div>;
}
