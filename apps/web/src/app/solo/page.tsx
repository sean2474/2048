"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Infinity as InfinityIcon, RotateCcw, Timer, Trophy } from "lucide-react";
import { useI18n } from "ui/i18n";
import { ACHIEVEMENT_REWARDS } from "schema/achievements";
import { SKINS, SKIN_RARITIES } from "schema/loadout";
import { SOLO_SIZE, formatSoloTime, type SoloMode } from "schema/solo";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { BoardView } from "@/components/2048/board";
import { SkinPreview } from "@/components/2048/skin-preview";
import { PageHeading } from "@/components/widget/page-heading";
import { usePlayer } from "@/hooks/use-player";
import { useSolo } from "@/hooks/use-solo";
import { useKeybindings } from "@/hooks/use-keybindings";
import { useGameKeyboard } from "@/hooks/use-game-keyboard";
import { useSettings } from "@/hooks/settings-provider";
import { useAudio } from "@/hooks/audio-provider";
import { useAchievements } from "@/hooks/use-achievements";
import { reasonMessage } from "@/lib/multiplayer";

const preview = [{ id: 1, value: 2, row: 1, col: 1 }, { id: 2, value: 2, row: 3, col: 3 }];
const directions = [{ dir: "up", icon: ArrowUp, label: "Move up" }, { dir: "left", icon: ArrowLeft, label: "Move left" }, { dir: "down", icon: ArrowDown, label: "Move down" }, { dir: "right", icon: ArrowRight, label: "Move right" }] as const;
const modes = [{ id: "time-attack", label: "2048 time attack", description: "Race to 2048", icon: Timer }, { id: "endless", label: "Endless mode", description: "No time limit", icon: InfinityIcon }] as const;

export default function SoloPage() {
  const { t } = useI18n();
  const { user } = usePlayer();
  const account = user === undefined ? undefined : user && !user.is_anonymous ? user.id : null;
  const solo = useSolo(account);
  const { state } = solo;
  const { settings, ready } = useSettings();
  const { bindings } = useKeybindings();
  const { play } = useAudio();
  const controls = useRef<HTMLElement>(null);
  const lastSound = useRef({ id: "", moves: 0 });
  const [selectedMode, setSelectedMode] = useState<SoloMode | null>(null);
  const [restart, setRestart] = useState<SoloMode | null>(null);
  const achievements = useAchievements();
  const best = achievements.data?.soloBestMs;
  const mode = selectedMode ?? state?.mode ?? "time-attack";
  const endless = mode === "endless";
  const run = state?.mode === mode ? state : null;
  const playing = run?.status === "playing";
  const canMove = playing && solo.connected && !restart;
  const hasRecord = !!state && (state.mode === "endless" ? state.maxTile >= 2048 : state.status === "won");
  const unsaved = hasRecord && (state.saving === "error" || state.saving === "pending");
  const savedTile = state?.saving === "saved" ? Math.min(state.maxTile, 8192) : 0;
  const reloadAchievements = achievements.reload;
  useEffect(() => { if (savedTile) void reloadAchievements(); }, [savedTile, reloadAchievements]);
  useEffect(() => { if (state?.id) { setSelectedMode(state.mode); controls.current?.focus({ preventScroll: true }); } }, [state?.id, state?.mode]);
  useEffect(() => {
    if (!state) return;
    if (lastSound.current.id === state.id && state.moves > lastSound.current.moves) play(state.status === "won" ? "win" : state.status === "lost" ? "lose" : state.board.some(tile => tile.merged && !tile.ghost) ? "merge" : "move", settings.skinId);
    lastSound.current = { id: state.id, moves: state.moves };
  }, [state, play, settings.skinId]);
  useGameKeyboard({ enabled: !!canMove, bindings, characterShortcuts: ready && settings.customShortcuts, target: controls,
    onAction: action => { if (action !== "ability") solo.move(action); } });
  const errorMessage = solo.error === "solo_connection" ? "Connection interrupted. Reconnect to resume; the timer keeps running."
    : solo.error === "solo_unavailable" ? "Solo records are unavailable. Please try again shortly."
    : solo.error === "save_first" ? "Save this finish before starting another run."
    : solo.error === "run_expired" ? "This run is no longer available. Start a new run." : reasonMessage(solo.error ?? "");

  return <main className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="crown" eyebrow="4 × 4" title={t("Single player")} description={t("Chase your best time, or keep merging without a limit.")}><Button asChild variant="outline"><Link href="/leaderboard?mode=solo"><Trophy aria-hidden="true" />{t("Time rankings")}</Link></Button></PageHeading>
    <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("Solo mode")}>
      {modes.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id} disabled={solo.working || unsaved || (!!state && !solo.connected)}
        onClick={() => { if (mode === item.id) return; if (state?.status === "playing") setRestart(item.id); else setSelectedMode(item.id); }}
        className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 sm:px-5 ${mode === item.id ? "border-primary bg-primary/5" : "bg-card hover:bg-secondary/40"}`}>
        <item.icon aria-hidden="true" className="hidden size-5 shrink-0 text-primary sm:block" /><span><span className="block text-sm font-bold">{t(item.label)}</span><span className="mt-1 block text-xs text-muted-foreground">{t(item.description)}</span></span>
      </button>)}
    </div>
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:gap-8">
      <section ref={controls} tabIndex={-1} aria-label={t("Solo controls")} aria-describedby="solo-rules" className="min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        onPointerDown={event => { if (!(event.target instanceof HTMLElement && event.target.closest("button,a"))) controls.current?.focus({ preventScroll: true }); }}>
        <dl className="mb-5 grid grid-cols-[1.5fr_1fr_1fr] gap-3 rounded-xl border bg-card p-4">
          <div><dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{endless ? <InfinityIcon aria-hidden="true" className="size-3.5" /> : <Timer aria-hidden="true" className="size-3.5" />}{t(endless ? "Highest tile" : "Time")}</dt><dd className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight sm:text-3xl">{endless ? run?.maxTile ?? "—" : formatSoloTime(run ? solo.elapsed : 0)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("Score")}</dt><dd className="mt-2 font-bold tabular-nums">{run?.score ?? 0}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{t("Moves")}</dt><dd className="mt-2 font-bold tabular-nums">{run?.moves ?? 0}</dd></div>
        </dl>
        <div className="mx-auto max-w-[500px]"><BoardView size={SOLO_SIZE} board={run?.board ?? preview} skinId={settings.skinId} onMove={canMove ? solo.move : undefined} /></div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <Button disabled={!solo.connected || solo.working || unsaved} onClick={() => { if (playing) setRestart(mode); else solo.start(mode); }}><RotateCcw aria-hidden="true" />{t(playing ? "Restart run" : run ? "Try again" : endless ? "Start endless mode" : "Start time attack")}</Button>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label={t("Direction controls")}><span />{directions.map(({ dir, icon: Icon, label }, index) => <Button key={dir} variant="outline" size="icon" className={index === 0 ? "col-start-2 col-end-3" : index === 1 ? "col-start-1" : ""} aria-label={t(label)} disabled={!canMove} onClick={() => solo.move(dir)}><Icon aria-hidden="true" /></Button>)}</div>
        </div>
        {solo.error && <div role="alert" className="mt-4 space-y-2 text-sm text-destructive"><p>{t(errorMessage)}</p>{!solo.connected && <Button variant="outline" onClick={solo.reconnect}>{t("Reconnect")}</Button>}</div>}
        {!solo.connected && !solo.error && <p role="status" className="mt-3 text-sm text-muted-foreground">{t("Connecting…")}</p>}
        {run && (!playing || hasRecord) && <section role="status" className="mt-5 space-y-3 rounded-xl border border-primary/30 bg-card p-5">
          <h2 className="text-lg font-bold">{t(run.status === "won" ? "2048 reached!" : run.status === "expired" ? "The one-hour run has ended." : run.status === "lost" ? "No moves left. Try a new board." : "Milestone reached. Keep going!")}</h2>
          {run.status === "won" && <p className="text-3xl font-extrabold tabular-nums text-primary">{formatSoloTime(run.elapsedMs)}</p>}
          {hasRecord && <><p className="text-sm">{t(run.saving === "saved" ? "Record saved. Eligible skins are now unlocked in your loadout." : run.saving === "guest" ? "Guest finish. Sign in before your next run to earn rankings and skins." : run.saving === "error" ? "Could not save this finish. Keep this page open and retry." : "Saving your record…")}</p>{run.saving === "error" && <Button disabled={solo.working} onClick={solo.save}>{t("Retry saving")}</Button>}{run.saving === "saved" && <Button asChild variant="outline"><Link href="/loadout">{t("My loadout")}</Link></Button>}</>}
        </section>}
      </section>
      <aside className="space-y-5">
        <section className="space-y-4 rounded-xl border bg-card p-5"><p className="text-xs font-semibold text-muted-foreground">{t(endless ? "Best milestone" : "Personal best")}</p><p className="text-3xl font-extrabold tabular-nums">{endless ? achievements.data?.soloHighestTile || "—" : best ? formatSoloTime(best) : "—"}</p>

          {achievements.error && <p role="alert" className="text-xs text-destructive">{t("Could not load achievement progress.")}</p>}
          <p id="solo-rules" className="break-keep text-sm leading-6 text-muted-foreground">{t(endless ? "4×4 board · No time limit, abilities or undo. Continue beyond 2048. Milestone rewards save as soon as you reach them." : "4×4 board · Reach 2048 · No abilities or undo. The clock starts when you press Start and keeps running until you finish, for up to one hour.")}</p><p className="text-xs leading-5 text-muted-foreground">{t("Use arrow keys, swipe your board or use the direction buttons below.")}</p>{account === null && <Button asChild variant="outline" className="w-full"><Link href="/login">{t("Sign in for records & rewards")}</Link></Button>}</section>
        <section className="rounded-xl border bg-card p-5"><h2 className="mb-4 flex items-center gap-2 font-bold"><Trophy aria-hidden="true" className="size-4 text-primary" />{t(endless ? "Beyond 2048" : "Earn your speed")}</h2><ul className="space-y-4">{ACHIEVEMENT_REWARDS.filter(item => item.metric === (endless ? "solo_tile" : "solo_time")).map(item => {
          const skin = SKINS.find(skin => item.reward.kind === "skin" && skin.id === item.reward.skinId)!;
          const unlocked = achievements.data?.unlocks.some(unlock => unlock.achievementId === item.id);
          return <li key={item.id} className="flex items-center gap-4"><div className="w-[72px] shrink-0 sm:w-20"><SkinPreview skin={skin} /></div><div className="min-w-0"><p className="flex items-center gap-1 text-sm font-bold">{unlocked && <Check aria-label={t("Permanently unlocked")} className="size-4 shrink-0 text-primary" />}{t(skin.name)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.metric === "solo_tile" ? t("Reach {tile}", { tile: item.target }) : item.id === "solo-first" ? t("First 2048 finish") : t("Finish within {minutes} minutes", { minutes: item.target / 60000 })}</p><p className="mt-0.5 text-[11px] font-semibold text-primary">{t(SKIN_RARITIES[skin.rarity].name)}</p></div></li>;
        })}</ul><Button asChild variant="ghost" className="mt-4 w-full"><Link href="/achievements">{t("Achievements")}<ArrowRight aria-hidden="true" /></Link></Button></section>
      </aside>
    </div>
    <AlertDialog open={restart !== null} onOpenChange={open => { if (!open) setRestart(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(restart === mode ? "Restart this run?" : "Switch modes?")}</AlertDialogTitle><AlertDialogDescription>{t("Your current board and time will be discarded. Your saved best stays.")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("Cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => { if (restart) { setSelectedMode(restart); solo.start(restart); } }}>{t(restart === "endless" ? "Start endless mode" : "Start time attack")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
