"use client";

import Link from "next/link";
import { DEFAULT_ABILITY_ID } from "schema/loadout";
import { ABILITY_CHARGE } from "schema/in-game";
import { useEffect, useReducer, useRef } from "react";
import { ArrowRight, Check, FastForward, RotateCcw } from "lucide-react";
import { useI18n } from "ui/i18n";
import { DirectionPad } from "@/components/2048/direction-pad";
import { GameArena } from "@/components/2048/game-arena";
import { Button } from "@/components/ui/button";
import { useKeybindings } from "@/hooks/use-keybindings";
import { useSettings } from "@/hooks/settings-provider";
import { useAudio } from "@/hooks/audio-provider";
import { playerSound } from "@/lib/game-audio";
import { keyLabel } from "@/lib/keybindings";
import { useGameKeyboard } from "@/hooks/use-game-keyboard";
import { createLesson, tutorialReducer } from "@/lib/tutorial";

const steps = ["Controls", "X block", "Hard block", "Incoming blocks", "Default ability"] as const;

export function TutorialPractice() {
  const { t } = useI18n();
  const { play } = useAudio();
  const { bindings, storageError } = useKeybindings();
  const { settings, ready } = useSettings();
  const characterShortcuts = ready && settings.customShortcuts;
  const [lesson, dispatch] = useReducer(tutorialReducer, undefined, createLesson);
  const previousLesson = useRef<typeof lesson | null>(null);
  const controls = useRef<HTMLElement>(null);
  const nextStepButton = useRef<HTMLButtonElement>(null);
  const findMatchLink = useRef<HTMLAnchorElement>(null);
  const waitingForOpponent = lesson.opponentPending.length > 0;
  const canMove = lesson.step !== 4 && !waitingForOpponent && !lesson.complete;
  const canUseAbility = lesson.step === 4 && !lesson.complete;
  const finished = lesson.step === 4 && lesson.complete;
  const focus = (lesson.step === 1 || lesson.step === 2) && (waitingForOpponent || lesson.complete) ? "opponent" : "board";
  const title = lesson.complete
    ? ["You’ve got the basics", "Your X block landed", "A fixed obstacle on their board", "X moves. Hard blocks stay put.", "One X cleared. One space recovered."][lesson.step]
    : waitingForOpponent ? "Attack sent automatically"
      : ["Start with a move", "128 + 128 = your first attack", "256 + 256 = a hard block", lesson.pending.length ? "Your opponent sent two obstacles" : "Your opponent’s blocks have arrived", "Try your default ability: Clear X"][lesson.step];
  const instruction = lesson.complete
    ? ["You made a 4. Let’s skip ahead to 128 + 128 and try an attack.", "Attack delivered. The X block slides, but it cannot merge.", "Hard blocks cannot move or merge. They split the opponent’s rows and columns.", "The red X moved with your tiles. The black hard block stayed in place. Neither block can merge.", "Exactly one X disappeared. The other X, the hard block and your number tiles stayed in place."][lesson.step]
    : waitingForOpponent ? "Your merge sent an attack. It lands when the practice opponent makes its next valid move."
      : ["Move left or right to merge the two 2 tiles into a 4.", "Merge the two 128 tiles into 256 to send an X block automatically.", "Merge two 256 tiles into 512 to send a hard block automatically.", lesson.pending.length ? "One X and one hard block are on their way. Move left to let them arrive in your empty cells." : "Move down and watch: the red X slides with your tiles, while the black hard block stays put.", "Your default ability is ready. Use the ability button below your board to remove the oldest X without moving your tiles."][lesson.step];
  const nextLabel = ["Skip ahead to 128 + 128", "Try a hard block", "Try receiving an attack", "Try the default ability"][lesson.step];

  useEffect(() => { controls.current?.focus({ preventScroll: true }); }, [lesson.step]);
  useEffect(() => {
    if (!waitingForOpponent) return;
    const timer = setTimeout(() => dispatch({ type: "opponentMove" }), 600);
    return () => clearTimeout(timer);
  }, [waitingForOpponent]);
  useEffect(() => {
    const previous = previousLesson.current;
    previousLesson.current = lesson;
    if (!previous || previous.step !== lesson.step) return;
    const sound = playerSound(previous, lesson);
    if (lesson.step === 4 && lesson.complete && !previous.complete) play("clear-x");
    else if (sound) play(sound, settings.skinId);
  }, [lesson, play, settings.skinId]);
  useEffect(() => {
    if (lesson.complete) (lesson.step === 4 ? findMatchLink.current : nextStepButton.current)?.focus({ preventScroll: true });
  }, [lesson.complete, lesson.step]);

  useGameKeyboard({
    enabled: !lesson.complete, bindings, characterShortcuts, target: controls,
    onAction: action => {
      if (action === "ability") {
        if (canUseAbility) dispatch({ type: "ability" });
      } else if (canMove) dispatch({ type: "move", dir: action });
    },
  });

  return <section ref={controls} tabIndex={-1} aria-label={t("Tutorial controls")} aria-describedby="tutorial-instruction" className="tutorial-session" data-focus={focus}>

    <div className="game-stage" onPointerDown={event => { if (!(event.target instanceof HTMLElement && event.target.closest("button, a, summary"))) controls.current?.focus({ preventScroll: true }); }}>
      <GameArena key={lesson.step} you={{ board: lesson.board, score: lesson.score, attacksSent: lesson.attacksSent, ability: { id: DEFAULT_ABILITY_ID, charge: canUseAbility ? ABILITY_CHARGE : 0, spawnPauseMoves: 0, anchorMoves: 0, slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 } }} opponent={{ board: lesson.opponent, score: 0, attacksSent: { xblock: 0, hardblock: 0 } }} names={{ you: t("You"), opp: t("Practice opponent") }} abilityBinding={characterShortcuts ? bindings.ability : undefined} onMove={canMove ? dir => dispatch({ type: "move", dir }) : undefined} onAbility={canUseAbility ? () => dispatch({ type: "ability" }) : undefined} />
      <section className="tutorial-coach" aria-labelledby="tutorial-heading">
        <ol aria-label={t("Tutorial progress")} className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold">
          {steps.map((step, index) => <li key={step} aria-current={index === lesson.step ? "step" : undefined} className={`flex items-center gap-1.5 ${index === lesson.step ? "text-primary" : "text-muted-foreground"}`}><span className={`grid size-5 place-items-center rounded-full ${index === lesson.step ? "text-primary-foreground bg-primary" : "bg-muted"}`}>{index < lesson.step || index === lesson.step && lesson.complete ? <Check aria-hidden="true" className="size-3" /> : index + 1}</span>{t(step)}</li>)}
        </ol>
        <h2 id="tutorial-heading" className="text-lg font-bold tracking-tight">{t(title)}</h2>
        <p id="tutorial-instruction" className="mt-2 text-sm leading-6" role="status" aria-live="polite">{t(instruction)}</p>
        {lesson.step === 0 && !lesson.complete && <p className="mt-2 text-xs leading-5 text-muted-foreground">{t(characterShortcuts ? "Arrow keys or {keys} · Swipe your board or use the direction buttons below." : "Use arrow keys, swipe your board or use the direction buttons below.", { keys: [bindings.up, bindings.left, bindings.down, bindings.right].map(keyLabel).join(" / ") })}</p>}
        {(lesson.step === 1 || lesson.step === 2) && <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("Normal attacks are automatic. Only your special ability needs a button or key.")}</p>}
        {lesson.step === 4 && <>
          {characterShortcuts && !lesson.complete && <p className="mt-2 text-xs text-muted-foreground">{t("Press {key} to use your ability.", { key: keyLabel(bindings.ability) })}</p>}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("In a match, merge points charge your ability. At 1024 points, one use is ready.")}</p>
        </>}
        {lesson.complete && !finished && <Button ref={nextStepButton} className="mt-4 w-full" onClick={() => dispatch({ type: "advance" })}><FastForward aria-hidden="true" />{t(nextLabel)}</Button>}
        {finished && <Button asChild className="mt-4 w-full"><Link ref={findMatchLink} href="/find-match">{t("Find a match")}<ArrowRight aria-hidden="true" /></Link></Button>}
      </section>
    </div>
    <section className="match-controls">
      <div className="match-controls-info min-w-0 space-y-1">
        <p role="status" className="text-xs leading-5 text-muted-foreground">{t(lesson.complete || waitingForOpponent || lesson.step === 3 || lesson.step === 4 ? instruction : lesson.step === 0 ? "Every valid move adds a new 2 or 4. Matching tiles merge once per move." : lesson.notice || "Merge 256 or 512 to attack automatically.")}</p>
        <Button variant="ghost" size="sm" onClick={() => { previousLesson.current = null; dispatch({ type: "restart" }); controls.current?.focus({ preventScroll: true }); }}><RotateCcw aria-hidden="true" />{t("Restart this step")}</Button>
        {storageError && <p role="alert" className="text-xs text-muted-foreground">{t(storageError)}</p>}
      </div>
      <DirectionPad disabled={!canMove} onMove={dir => dispatch({ type: "move", dir })} />
    </section>
  </section>;
}
