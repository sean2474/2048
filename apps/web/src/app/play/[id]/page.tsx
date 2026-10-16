"use client";
import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";
import { useI18n } from "ui/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Flag, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import type { Dir, S2C } from "schema/in-game";
import type { Socket } from "socket.io-client";
import { GameArena } from "@/components/2048/game-arena";
import { MatchResult } from "@/components/widget/match-result";
import { AttackControls } from "@/components/2048/attack-controls";
import { AbilityControls } from "@/components/2048/ability-controls";
import { ABILITY_CHARGE } from "schema/in-game";
import { DEFAULT_ABILITY_ID } from "schema/loadout";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";
import { useKeybindings } from "@/hooks/use-keybindings";
import { useSettings } from "@/hooks/settings-provider";
import { KeybindingSettings } from "@/components/widget/keybinding-settings";
import { SoundToggle } from "@/components/widget/audio-controls";
import { useAudio } from "@/hooks/audio-provider";
import { matchSound } from "@/lib/game-audio";
import { resolveKeyAction } from "@/lib/keybindings";
import "@/styles/match-screen.css";
import { createGameSocket, CURRENT_ROOM_KEY, matchModeLabel, reasonMessage } from "@/lib/multiplayer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type GameState = Extract<S2C, { t: "state" | "end" }>;
export default function GamePage() {
  const { t } = useI18n();
  const { play } = useAudio();
  const { id: roomId } = useParams<{ id: string }>();
  const socketRef = useRef<Socket | null>(null);
  const lastMove = useRef(0);
  const serverOffset = useRef(0);
  const [connected, setConnected] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [names, setNames] = useState({ you: "Guest", opp: "Opponent" });
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [rejected, setRejected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const { settings, ready: settingsReady, saving: settingsSaving, saveSettings, error: settingsError } = useSettings();
  const settingsResolved = settingsReady || !!settingsError;
  const characterShortcuts = settingsReady && settings.customShortcuts;
  const [now, setNow] = useState(0);
  const { player } = usePlayer();
  const { bindings, saveBindings, storageError } = useKeybindings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!settingsResolved) return;
    setError(""); setActionMessage(""); setRejected(false); setConnected(false);
    let socket: Socket;
    try { socket = createGameSocket(); sessionStorage.setItem(CURRENT_ROOM_KEY, roomId); }
    catch { setError("Browser storage is unavailable. Enable it and reload this page."); return; }
    socketRef.current = socket;
    let finished = false;
    let previousGame: GameState | null = null;
    let started = false;
    socket.on("connect", () => {
      setConnected(true); setError("");
      if (!finished) socket.emit("message", { t: "joinRoom", roomId, skinId: settings.skinId, abilityId: settings.abilityId ?? DEFAULT_ABILITY_ID });
    });
    socket.on("disconnect", () => { setConnected(false); previousGame = null; });
    socket.on("connect_error", () => setError("Connection lost. Reconnecting automatically; you can also try again below."));
    socket.on("message", (message: S2C) => {
      if (message.t === "recordStatus") {
        setGame(current => current?.t === "end" && current.matchId === message.matchId ? { ...current, recording: message.status } : current);
        return;
      }
      if (finished) return;
      if (message.t === "actionRejected") {
        setActionMessage(reasonMessage(message.reason));
        return;
      }
      if (message.t === "state" || message.t === "end") {
        const sound = message.t === "state" && !message.paused && !started ? "start" : matchSound(previousGame, message);
        if (sound && (sound !== "start" || !started)) play(sound, message.you.skinId);
        if (message.t === "state" && !message.paused) started = true;
        previousGame = message;
        setError(""); setGame(message);
        if (message.t === "state") {
          setNames(message.names);
          // During a pause, serverTime is frozen for ability effects only.
          if (!message.paused) serverOffset.current = message.serverTime - Date.now();
          setNow(Date.now() + serverOffset.current);
        }
        if (message.t === "end") { finished = true; sessionStorage.removeItem(CURRENT_ROOM_KEY); }
      } else if (message.t === "reject") {
        sessionStorage.removeItem(CURRENT_ROOM_KEY);
        setRejected(true); setError(reasonMessage(message.reason)); socket.disconnect();
      }
    });
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); socketRef.current = null; };
  }, [roomId, attempt, settingsResolved, settings.skinId, settings.abilityId, play]);

  const deadline = game?.t === "state" ? game.reconnectDeadline : undefined;
  const slowDeadline = game?.t === "state" && !game.paused ? Math.max(game.you.ability.slowEndsAt, game.opp?.ability.slowEndsAt ?? 0) : 0;
  useEffect(() => {
    if (!deadline && slowDeadline <= Date.now() + serverOffset.current) return;
    const timer = setInterval(() => {
      const current = Date.now() + serverOffset.current;
      setNow(current);
      if (!deadline && current >= slowDeadline) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [deadline, slowDeadline]);

  const canMove = connected && !rejected && !confirming && !settingsOpen && game?.t === "state" && !game.paused;
  const slowing = game?.you.ability;
  const movementDelayed = !!slowing && now >= slowing.slowStartsAt && now < slowing.slowEndsAt && now < slowing.nextMoveAt;
  const handleMove = useCallback((dir: Dir) => {
    if (!canMove || movementDelayed || !socketRef.current?.connected || Date.now() - lastMove.current < 70) return;
    lastMove.current = Date.now();
    setActionMessage("");
    socketRef.current.volatile.emit("message", { t: "input", dir });
  }, [canMove, movementDelayed]);
  const handleAttack = useCallback((blockType: "xblock" | "hardblock") => {
    if (!canMove || !socketRef.current?.connected || game?.t !== "state" || game.you.attacks[blockType] < 1) return;
    setActionMessage("");
    socketRef.current.emit("message", { t: "attack", blockType });
  }, [canMove, game]);
  const handleAbility = useCallback(() => {
    if (!canMove || !socketRef.current?.connected || game?.t !== "state" || game.you.ability.charge < ABILITY_CHARGE || game.you.ability.spawnPauseMoves > 0 || game.you.ability.anchorMoves > 0) return;
    setActionMessage("");
    socketRef.current.emit("message", { t: "ability" });
  }, [canMove, game]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!canMove || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=menu]")) return;
      const action = resolveKeyAction(event, bindings, characterShortcuts);
      if (!action) return;
      event.preventDefault();
      if (action === "xblock" || action === "hardblock") handleAttack(action);
      else if (action === "ability") handleAbility();
      else handleMove(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMove, handleAttack, handleAbility, canMove, characterShortcuts, bindings]);

  if (!game || rejected) return <main className="mx-auto max-w-lg px-4 py-12 sm:py-20">
    <section className="game-panel bg-card p-8 text-center shadow-sm sm:p-10">
      <GameEmblem kind="duel" className="mx-auto mb-6 size-20" />
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{t("The arena")}</p>
      <h1 className="text-3xl font-bold tracking-tight">{t(error ? "Unable to join" : "Joining your game…")}</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground" role={error ? "alert" : "status"}>{t(error || "Getting your board ready. One moment.")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {!rejected && error && <Button onClick={() => setAttempt(value => value + 1)}>{t("Try again")}</Button>}
        <Button asChild variant="outline"><Link href="/find-match">{t("Back to menu")}</Link></Button>
      </div>
    </section>
  </main>;

  const ended = game.t === "end";
  const abilityNow = game.t === "state" && game.paused ? game.serverTime : now;
  const slowRemaining = Math.max(0, Math.ceil((game.you.ability.slowEndsAt - abilityNow) / 1000));
  return <main className="match-screen">
    <section className="match-toolbar">
      <div className="min-w-0" role="status">
        <p className="text-xs font-semibold text-muted-foreground">{t(matchModeLabel[game.mode])}</p>
        <h1 className="text-lg font-extrabold tracking-tight">{ended ? t(game.winner === "you" ? "You win!" : game.winner === "draw" ? "Draw" : "You lose.") : t(!connected ? "Reconnecting…" : game.paused ? "Waiting for opponent…" : "Match in progress")}</h1>
        {!ended && game.paused && deadline && <p className="text-xs text-primary">{t("Game paused · {seconds}s to reconnect", { seconds: Math.max(0, Math.ceil((deadline - now) / 1000)) })}</p>}
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <SoundToggle />
        {!ended && <KeybindingSettings bindings={bindings} saveBindings={saveBindings} storageError={storageError} onOpenChange={setSettingsOpen} />}
        {ended ? <GameEmblem kind="crown" className="size-10" /> : <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={!connected}><Flag className="size-4" aria-hidden="true" />{t("Surrender")}</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("Surrender this round?")}</AlertDialogTitle><AlertDialogDescription>{t("Your opponent will win. You can start a new game afterwards.")}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{t("Keep playing")}</AlertDialogCancel><AlertDialogAction onClick={() => { if (socketRef.current?.connected) socketRef.current.emit("message", { t: "surrender" }); }}>{t("Surrender")}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>}
      </div>
    </section>
    <div className="game-stage">
      <GameArena you={game.you} opponent={game.opp} names={{ you: player?.name || names.you, opp: names.opp }} bindings={bindings} characterShortcuts={characterShortcuts} onMove={canMove && !movementDelayed ? handleMove : undefined} onAttack={canMove ? handleAttack : undefined} />
    </div>
    {ended ? <MatchResult key={game.matchId} game={game} names={{ you: player?.name || names.you, opp: names.opp }} /> : <section className="match-controls">
      <div className="match-controls-info min-w-0 space-y-1">
        {error ? <p role="alert" className="text-xs text-destructive">{t(error)} <button className="min-h-11 px-2 font-semibold underline" onClick={() => setAttempt(value => value + 1)}>{t("Try again")}</button></p> : <p role="status" className="text-xs leading-5 text-muted-foreground">{t(actionMessage || (game.paused ? "Attacks paused while reconnecting." : game.you.attacks.xblock + game.you.attacks.hardblock > 0 ? "Attack ready. Choose when to send it." : "Merge 256 or 512 to charge an attack."))}</p>}
        {game.pendingAttacks > 0 && <p role="status" className="text-xs font-semibold text-primary">{t("Incoming: X {x} · Hard {hard}", { x: game.incomingAttacks.xblock, hard: game.incomingAttacks.hardblock })}</p>}
        <p className="text-[11px] text-muted-foreground">{t("Merge points charge your ability: {points}. Hold one use.", { points: ABILITY_CHARGE })}</p>
        <div role="status" className="text-xs font-semibold text-primary">
          {game.you.ability.spawnPauseMoves > 0 && <p>{t("No number spawns: {moves} moves left", { moves: game.you.ability.spawnPauseMoves })}</p>}
          {game.you.ability.anchorMoves > 0 && <p>{t("Tile anchored: {moves} moves left", { moves: game.you.ability.anchorMoves })}</p>}
          {slowRemaining > 0 && <p>{t(abilityNow < game.you.ability.slowStartsAt ? "Slowdown incoming!" : "Slowed: {seconds}s · one move every 0.4s", { seconds: slowRemaining })}</p>}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" className="size-4 accent-primary" checked={characterShortcuts} disabled={!settingsReady || settingsSaving} onChange={event => void saveSettings({ customShortcuts: event.target.checked })} aria-describedby="shortcut-help" />{t("Enable custom shortcuts")}</label>
        {settingsError && <p role="alert" className="text-xs text-destructive">{t(settingsError)}</p>}
        <p id="shortcut-help" className="sr-only">{t("Arrow keys and on-screen buttons remain available when shortcuts are off.")}</p>
      </div>
      <div className="space-y-1.5"><AbilityControls ability={game.you.ability} binding={characterShortcuts ? bindings.ability : undefined} onUse={canMove ? handleAbility : undefined} /><AttackControls attacks={game.you.attacks} onAttack={canMove ? handleAttack : undefined} /></div>
      <div className="direction-pad grid shrink-0 grid-cols-3 gap-1" role="group" aria-label={t("Direction controls")}>
        <div /><Button variant="outline" size="icon" aria-label={t("Move up")} disabled={!canMove || movementDelayed} onClick={() => handleMove("up")}><ArrowUp /></Button><div />
        <Button variant="outline" size="icon" aria-label={t("Move left")} disabled={!canMove || movementDelayed} onClick={() => handleMove("left")}><ArrowLeft /></Button>
        <Button variant="outline" size="icon" aria-label={t("Move down")} disabled={!canMove || movementDelayed} onClick={() => handleMove("down")}><ArrowDown /></Button>
        <Button variant="outline" size="icon" aria-label={t("Move right")} disabled={!canMove || movementDelayed} onClick={() => handleMove("right")}><ArrowRight /></Button>
      </div>
    </section>}
  </main>;
}
