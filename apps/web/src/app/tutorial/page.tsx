"use client";

import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";
import { AbilityIcon } from "@/components/widget/ability-icon";
import { DEFAULT_ABILITY_ID } from "schema/loadout";
import { ABILITY_CHARGE } from "schema/in-game";
import { useEffect, useReducer, useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, FastForward, RotateCcw } from "lucide-react";
import { useI18n } from "ui/i18n";
import { GameArena } from "@/components/2048/game-arena";
import { AttackControls } from "@/components/2048/attack-controls";
import { Button } from "@/components/ui/button";
import { useKeybindings } from "@/hooks/use-keybindings";
import { useSettings } from "@/hooks/settings-provider";
import { SoundToggle } from "@/components/widget/audio-controls";
import { useAudio } from "@/hooks/audio-provider";
import { playerSound } from "@/lib/game-audio";
import { keyLabel } from "@/lib/keybindings";
import { useGameKeyboard } from "@/hooks/use-game-keyboard";
import { createLesson, tutorialReducer } from "@/lib/tutorial";
import "@/styles/match-screen.css";
import "@/styles/tutorial.css";

const steps = ["Controls", "X block", "Hard block", "Incoming blocks", "Save & send", "Default ability"] as const;

export default function TutorialPage() {
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
  const canMove = lesson.step !== 5 && !lesson.charged && !lesson.complete;
  const canAttack = lesson.charged && !lesson.complete;
  const finished = lesson.step === 5 && lesson.complete;
  const focus = lesson.complete ? "opponent" : !lesson.charged ? "board" : lesson.step === 1 ? "xblock" : lesson.step === 2 ? "hardblock" : "stock";
  const title = lesson.complete
    ? ["You’ve got the basics", "Your X block landed", "A fixed obstacle on their board", "X moves. Hard blocks stay put.", "All four attacks delivered", "One X cleared. One space recovered."][lesson.step]
    : lesson.charged
      ? ["", "X attack charged. Your turn to send it.", "Hard block charged. Send it now.", "", "Four tickets saved. Send them in succession."][lesson.step]
      : ["Start with a move", "128 + 128 = your first attack", "256 + 256 = a hard block", lesson.pending.length ? "Your opponent sent two obstacles" : "Your opponent’s blocks have arrived", "Save more than one attack", "Try your default ability: Clear X"][lesson.step];
  const instruction = lesson.complete
    ? ["You made a 4. Let’s skip ahead to 128 + 128 and try an attack.", "Attack delivered. The X block slides, but it cannot merge.", "Hard blocks cannot move or merge. They split the opponent’s rows and columns.", "The red X moved with your tiles. The black hard block stayed in place. Neither block can merge.", "All four attacks landed on one opponent move. Save your tickets and choose your moment.", "Exactly one X disappeared. The other X, the hard block and your number tiles stayed in place."][lesson.step]
    : lesson.charged
      ? ["", "Tap X attack below or press {key} to attack.", "Tap Hard attack below or press {key} to attack.", "", "Tap X attack or Hard attack repeatedly. Each tap sends one ticket; no move is needed between attacks."][lesson.step]
      : ["Move left or right to merge the two 2 tiles into a 4.", "We skipped ahead to two 128 tiles. Merge them left or right to charge an X attack.", "Now merge two 256 tiles to make 512 and charge a hard block.", lesson.pending.length ? "One X and one hard block are on their way. Move left to let them arrive in your empty cells." : "Move down and watch: the red X slides with your tiles, while the black hard block stays put.", "Merge left or right to charge two X tickets and two hard block tickets at once.", "Your default ability is ready for practice. Press Clear one X to remove the oldest X block without moving your tiles."][lesson.step];
  const nextLabel = ["Skip ahead to 128 + 128", "Try a hard block", "Try receiving an attack", "Practice saving attacks", "Try the default ability"][lesson.step];

  useEffect(() => { controls.current?.focus({ preventScroll: true }); }, [lesson.step, lesson.attacks, lesson.pending]);
  useEffect(() => {
    const previous = previousLesson.current;
    previousLesson.current = lesson;
    if (!previous || previous.step !== lesson.step) return;
    const sound = playerSound(previous, lesson);
    if (lesson.step === 5 && lesson.complete && !previous.complete) play("win");
    else if (sound) play(sound, settings.skinId);
  }, [lesson, play, settings.skinId]);
  useEffect(() => {
    if (lesson.complete) (lesson.step === 5 ? findMatchLink.current : nextStepButton.current)?.focus({ preventScroll: true });
  }, [lesson.complete, lesson.step]);

  useGameKeyboard({
    enabled: !lesson.complete, bindings, characterShortcuts, target: controls,
    onAction: action => {
      if (action === "ability") {
        if (lesson.step === 5) dispatch({ type: "ability" });
      } else if (action === "xblock" || action === "hardblock") {
        if (canAttack) dispatch({ type: "attack", blockType: action });
      } else if (canMove) dispatch({ type: "move", dir: action });
    },
  });

  return <main ref={controls} tabIndex={-1} aria-label={t("Tutorial controls")} aria-describedby="tutorial-instruction" className="match-screen tutorial-screen" data-focus={lesson.step === 0 || lesson.step === 3 || lesson.step === 5 ? "board" : focus}>
    <header className="match-toolbar">
      <div className="flex min-w-0 items-center gap-3"><GameEmblem kind="guide" className="size-10" /><div><p className="text-xs font-semibold text-muted-foreground">{t("Local practice")}</p><h1 className="text-lg font-extrabold tracking-tight">{t("Learn on the battlefield")}</h1></div></div>
      <div className="flex max-w-full flex-wrap items-center gap-2"><SoundToggle /><Button asChild size="sm" variant="ghost"><Link href="/find-match">{t("Exit tutorial")}<ArrowRight aria-hidden="true" /></Link></Button></div>
    </header>
    <div className="game-stage" onPointerDown={event => { if (!(event.target instanceof HTMLElement && event.target.closest("button, a, summary"))) controls.current?.focus({ preventScroll: true }); }}>
      <GameArena you={{ board: lesson.board, score: lesson.score, attacks: lesson.attacks, ability: lesson.step === 5 ? { id: DEFAULT_ABILITY_ID, charge: lesson.complete ? 0 : ABILITY_CHARGE, spawnPauseMoves: 0, anchorMoves: 0, slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 } : undefined }} opponent={{ board: lesson.opponent, score: 0, attacks: { xblock: 0, hardblock: 0 } }} names={{ you: t("You"), opp: t("Practice opponent") }} bindings={bindings} characterShortcuts={characterShortcuts} onMove={canMove ? dir => dispatch({ type: "move", dir }) : undefined} onAttack={canAttack ? blockType => dispatch({ type: "attack", blockType }) : undefined} />
      <section className="tutorial-coach" aria-labelledby="tutorial-heading">
        <ol aria-label={t("Tutorial progress")} className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold">
          {steps.map((step, index) => <li key={step} aria-current={index === lesson.step ? "step" : undefined} className={`flex items-center gap-1.5 ${index === lesson.step ? "text-primary" : "text-muted-foreground"}`}><span className={`grid size-5 place-items-center rounded-full ${index === lesson.step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{index < lesson.step || index === lesson.step && lesson.complete ? <Check aria-hidden="true" className="size-3" /> : index + 1}</span>{t(step)}</li>)}
        </ol>
        <h2 id="tutorial-heading" className="text-lg font-bold tracking-tight">{t(title)}</h2>
        <p id="tutorial-instruction" className="mt-2 text-sm leading-6" role="status" aria-live="polite">{t(canAttack && lesson.step < 3 && !characterShortcuts ? "Tap an attack button below to send an obstacle." : instruction, { key: keyLabel(bindings[lesson.step === 2 ? "hardblock" : "xblock"]) })}</p>
        {lesson.step === 0 && !lesson.complete && <p className="mt-2 text-xs leading-5 text-muted-foreground">{t(characterShortcuts ? "Arrow keys or {keys} · Swipe your board or use the direction buttons below." : "Use arrow keys, swipe your board or use the direction buttons below.", { keys: [bindings.up, bindings.left, bindings.down, bindings.right].map(keyLabel).join(" / ") })}</p>}
        {canAttack && lesson.step < 3 && <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("The practice opponent moves automatically so you can see your attack land.")}</p>}
        {lesson.step === 4 && <>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("Store up to 3 tickets of each type. Further tickets of that type are lost while full.")}</p>
          {lesson.charged && !lesson.complete && <p className="mt-2 text-xs font-semibold text-primary" role="status">{t("Queued for the opponent: {count} / 6", { count: lesson.pending.length })}</p>}
          <details className="mt-3 text-xs leading-5"><summary className="min-h-8 cursor-pointer font-semibold">{t("What if the opponent’s board is full?")}</summary><p className="mt-2">{t("No empty cells? Sent attacks wait for space after a valid move. If 6 attacks are already waiting, you cannot send more and keep your ticket.")}</p></details>
        </>}
        {lesson.step === 5 && <>
          <Button className="mt-4 min-h-14 w-full gap-3" variant="outline" aria-keyshortcuts={characterShortcuts ? keyLabel(bindings.ability) : undefined} disabled={lesson.complete} onClick={() => dispatch({ type: "ability" })}>
            <AbilityIcon abilityId={DEFAULT_ABILITY_ID} className="size-10" />{t(lesson.complete ? "Ability used" : "Clear one X")}
            {characterShortcuts && <kbd aria-hidden="true" className="rounded border px-1.5 py-0.5 text-xs">{keyLabel(bindings.ability)}</kbd>}
          </Button>
          {characterShortcuts && !lesson.complete && <p className="mt-2 text-xs text-muted-foreground">{t("Press {key} to use your ability.", { key: keyLabel(bindings.ability) })}</p>}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("In a match, merge points charge your ability. At 1024 points, one use is ready.")}</p>
        </>}
        {lesson.complete && !finished && <Button ref={nextStepButton} className="mt-4 w-full" onClick={() => dispatch({ type: "advance" })}><FastForward aria-hidden="true" />{t(nextLabel)}</Button>}

        {finished && <Button asChild className="mt-4 w-full"><Link ref={findMatchLink} href="/find-match">{t("Find a match")}<ArrowRight aria-hidden="true" /></Link></Button>}
      </section>
    </div>
    <section className="match-controls">
      <div className="match-controls-info min-w-0 space-y-1">
        <p role="status" className="text-xs leading-5 text-muted-foreground">{t(lesson.complete || lesson.step === 3 || lesson.step === 5 ? instruction : canAttack ? "Attack ready. Choose when to send it." : lesson.step === 0 ? "Every valid move adds a new 2 or 4. Matching tiles merge once per move." : lesson.notice || "Merge 256 or 512 to charge an attack.")}</p>
        <Button variant="ghost" size="sm" onClick={() => { previousLesson.current = null; dispatch({ type: "restart" }); controls.current?.focus({ preventScroll: true }); }}><RotateCcw aria-hidden="true" />{t("Restart this step")}</Button>
        {storageError && <p role="alert" className="text-xs text-muted-foreground">{t(storageError)}</p>}
      </div>
      <AttackControls attacks={lesson.attacks} onAttack={canAttack ? blockType => dispatch({ type: "attack", blockType }) : undefined} />
      <div className="direction-pad grid shrink-0 grid-cols-3 gap-1" role="group" aria-label={t("Direction controls")}>
        <span /><Button variant="outline" size="icon" aria-label={t("Move up")} disabled={!canMove} onClick={() => dispatch({ type: "move", dir: "up" })}><ArrowUp aria-hidden="true" /></Button><span />
        <Button variant="outline" size="icon" aria-label={t("Move left")} disabled={!canMove} onClick={() => dispatch({ type: "move", dir: "left" })}><ArrowLeft aria-hidden="true" /></Button>
        <Button variant="outline" size="icon" aria-label={t("Move down")} disabled={!canMove} onClick={() => dispatch({ type: "move", dir: "down" })}><ArrowDown aria-hidden="true" /></Button>
        <Button variant="outline" size="icon" aria-label={t("Move right")} disabled={!canMove} onClick={() => dispatch({ type: "move", dir: "right" })}><ArrowRight aria-hidden="true" /></Button>
      </div>
    </section>
  </main>;
}
