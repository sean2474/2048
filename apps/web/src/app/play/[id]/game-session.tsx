"use client";
import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";
import { useI18n } from "ui/i18n";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Flag } from "lucide-react";
import { ABILITY_CHARGE, type Dir, type S2C } from "schema/in-game";
import type { Socket } from "socket.io-client";
import { DirectionPad } from "@/components/2048/direction-pad";
import { GameArena } from "@/components/2048/game-arena";
import { MatchResult } from "@/components/widget/match-result";
import { DEFAULT_ABILITY_ID } from "schema/loadout";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";
import { useKeybindings } from "@/hooks/use-keybindings";
import { useSettings } from "@/hooks/settings-provider";
import { KeybindingSettings } from "@/components/widget/keybinding-settings";
import { SoundToggle } from "@/components/widget/audio-controls";
import { useAudio } from "@/hooks/audio-provider";
import { matchSound } from "@/lib/game-audio";
import { trackMatchEvent } from "@/lib/analytics";
import { useGameKeyboard } from "@/hooks/use-game-keyboard";
import {
  createGameSocket,
  CURRENT_ROOM_KEY,
  matchModeLabel,
  reasonMessage,
} from "@/lib/multiplayer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type GameState = Extract<S2C, { t: "state" | "end" }>;
function useGameSession(roomId: string) {
  const { t } = useI18n();
  const { play } = useAudio();
  const socketRef = useRef<Socket | null>(null);
  const serverOffset = useRef(0);
  const [connected, setConnected] = useState(false);
  const [game, setGame] = useState<GameState | null>(null);
  const [names, setNames] = useState({ you: "Guest", opp: "Opponent" });
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [rejected, setRejected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const { settings, ready: settingsReady, error: settingsError } = useSettings();
  const settingsResolved = settingsReady || !!settingsError;
  const characterShortcuts = settingsReady && settings.customShortcuts;
  const [now, setNow] = useState(0);
  const { player } = usePlayer();
  const { bindings, saveBindings, storageError } = useKeybindings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!settingsResolved) return;
    setError("");
    setActionMessage("");
    setRejected(false);
    setConnected(false);
    let socket: Socket;
    try {
      socket = createGameSocket();
      sessionStorage.setItem(CURRENT_ROOM_KEY, roomId);
    } catch {
      setError("Browser storage is unavailable. Enable it and reload this page.");
      return;
    }
    socketRef.current = socket;
    let finished = false;
    let previousGame: GameState | null = null;
    let started = false;
    socket.on("connect", () => {
      setConnected(true);
      setError("");
      if (!finished)
        socket.emit("message", {
          t: "joinRoom",
          roomId,
          skinId: settings.skinId,
          abilityId: settings.abilityId ?? DEFAULT_ABILITY_ID,
        });
    });
    socket.on("disconnect", () => {
      setConnected(false);
      previousGame = null;
    });
    socket.on("connect_error", () =>
      setError("Connection lost. Reconnecting automatically; you can also try again below."),
    );
    socket.on("message", (message: S2C) => {
      if (message.t === "recordStatus") {
        setGame((current) =>
          current?.t === "end" && current.matchId === message.matchId
            ? { ...current, recording: message.status }
            : current,
        );
        return;
      }
      if (finished) return;
      if (message.t === "actionRejected") {
        setActionMessage(reasonMessage(message.reason));
        return;
      }
      if (message.t === "state" || message.t === "end") {
        const sound =
          message.t === "state" && !message.paused && !started
            ? "start"
            : matchSound(previousGame, message);
        if (sound && (sound !== "start" || !started)) play(sound, message.you.skinId);
        if (message.t === "state" && !message.paused) {
          started = true;
          trackMatchEvent("match_started", roomId, { mode: message.mode });
        }
        previousGame = message;
        setError("");
        setGame(message);
        if (message.t === "state") {
          setNames(message.names);
          // During a pause, serverTime is frozen for ability effects only.
          if (!message.paused) serverOffset.current = message.serverTime - Date.now();
          setNow(Date.now() + serverOffset.current);
        }
        if (message.t === "end") {
          finished = true;
          sessionStorage.removeItem(CURRENT_ROOM_KEY);
          trackMatchEvent("match_finished", roomId, {
            mode: message.mode,
            outcome: message.winner === "you" ? "win" : message.winner === "opp" ? "loss" : "draw",
          });
        }
      } else if (message.t === "reject") {
        sessionStorage.removeItem(CURRENT_ROOM_KEY);
        setRejected(true);
        setError(reasonMessage(message.reason));
        socket.disconnect();
      }
    });
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, attempt, settingsResolved, settings.skinId, settings.abilityId, play]);

  const deadline = game?.t === "state" ? game.reconnectDeadline : undefined;
  const slowDeadline =
    game?.t === "state" && !game.paused
      ? Math.max(game.you.ability.slowEndsAt, game.opp?.ability.slowEndsAt ?? 0)
      : 0;
  useEffect(() => {
    if (!deadline && slowDeadline <= Date.now() + serverOffset.current) return;
    const timer = setInterval(() => {
      const current = Date.now() + serverOffset.current;
      setNow(current);
      if (!deadline && current >= slowDeadline) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [deadline, slowDeadline]);

  const canMove =
    connected && !rejected && !confirming && !settingsOpen && game?.t === "state" && !game.paused;
  const slowing = game?.you.ability;
  const movementDelayed =
    !!slowing &&
    now >= slowing.slowStartsAt &&
    now < slowing.slowEndsAt &&
    now < slowing.nextMoveAt;
  const handleMove = useCallback(
    (dir: Dir) => {
      if (!canMove || movementDelayed || !socketRef.current?.connected) return;
      setActionMessage("");
      socketRef.current.emit("message", { t: "input", dir });
    },
    [canMove, movementDelayed],
  );
  const handleAbility = useCallback(() => {
    if (
      !canMove ||
      !socketRef.current?.connected ||
      game?.t !== "state" ||
      game.you.ability.charge < ABILITY_CHARGE ||
      game.you.ability.spawnPauseMoves > 0 ||
      game.you.ability.anchorMoves > 0
    )
      return;
    setActionMessage("");
    socketRef.current.emit("message", { t: "ability" });
  }, [canMove, game]);
  useGameKeyboard({
    enabled: canMove,
    bindings,
    characterShortcuts,
    onAction: (action) => {
      if (action === "ability") handleAbility();
      else handleMove(action);
    },
  });

  return {
    t,
    game,
    rejected,
    error,
    setAttempt,
    connected,
    deadline,
    now,
    settingsOpen,
    setSettingsOpen,
    confirming,
    setConfirming,
    socketRef,
    player,
    names,
    bindings,
    saveBindings,
    storageError,
    characterShortcuts,
    canMove,
    movementDelayed,
    handleMove,
    handleAbility,
    actionMessage,
    settingsError,
  };
}

const GameContext = createContext<ReturnType<typeof useGameSession> | null>(null);

export function GameSession({
  roomId,
  children,
  fallback,
}: {
  roomId: string;
  children: ReactNode;
  fallback: ReactNode;
}) {
  const session = useGameSession(roomId);
  return (
    <GameContext.Provider value={session}>
      {session.rejected || (session.error && !session.game) ? (
        <ConnectionError />
      ) : !session.game ? (
        fallback
      ) : (
        children
      )}
    </GameContext.Provider>
  );
}

function useSession() {
  const value = useContext(GameContext);
  if (!value) throw new Error("GameSession is required");
  return value;
}

function useLiveGame() {
  const session = useSession();
  if (!session.game) throw new Error("A connected game is required");
  return { ...session, game: session.game };
}

function ConnectionError() {
  const { t, error, rejected, setAttempt } = useSession();
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <section className="game-panel bg-card p-8 text-center shadow-sm sm:p-10">
        <GameEmblem kind="duel" className="mx-auto mb-6 size-20" />
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t("The arena")}
        </p>
        <h2 className="text-3xl font-bold tracking-tight">
          {t(error ? "Unable to join" : "Joining your game…")}
        </h2>
        <p
          className="mt-4 text-sm leading-6 text-muted-foreground"
          role={error ? "alert" : "status"}
        >
          {t(error || "Getting your board ready. One moment.")}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {!rejected && error && (
            <Button onClick={() => setAttempt((value) => value + 1)}>{t("Try again")}</Button>
          )}
          <Button asChild variant="outline">
            <Link href="/find-match">{t("Back to menu")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export function MatchStatus() {
  const { t, game, connected, deadline, now } = useLiveGame();
  const ended = game.t === "end";
  return (
    <div className="flex min-w-0 items-center gap-3" role="status">
      <GameEmblem
        kind={game.mode === "ranked" ? "crown" : game.mode === "friend" ? "friend" : "duel"}
        className="size-10 text-primary"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground">
          {t(matchModeLabel[game.mode])}
        </p>
        <h2 className="text-lg font-extrabold tracking-tight">
          {ended
            ? t(game.winner === "you" ? "You win!" : game.winner === "draw" ? "Draw" : "You lose.")
            : t(
                !connected
                  ? "Reconnecting…"
                  : game.paused
                    ? "Waiting for opponent…"
                    : "Match in progress",
              )}
        </h2>
        {!ended && game.paused && deadline && (
          <p className="text-xs text-primary">
            {t("Game paused · {seconds}s to reconnect", {
              seconds: Math.max(0, Math.ceil((deadline - now) / 1000)),
            })}
          </p>
        )}
      </div>
    </div>
  );
}

export function MatchToolbarControls() {
  const {
    t,
    game,
    connected,
    bindings,
    saveBindings,
    storageError,
    setSettingsOpen,
    confirming,
    setConfirming,
    socketRef,
  } = useLiveGame();
  const ended = game.t === "end";
  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <SoundToggle />
      {!ended && (
        <KeybindingSettings
          bindings={bindings}
          saveBindings={saveBindings}
          storageError={storageError}
          onOpenChange={setSettingsOpen}
        />
      )}
      {ended ? (
        <GameEmblem kind="crown" className="size-10" />
      ) : (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={!connected}>
              <Flag className="size-4" aria-hidden="true" />
              {t("Surrender")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("Surrender this round?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("Your opponent will win. You can start a new game afterwards.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Keep playing")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (socketRef.current?.connected)
                    socketRef.current.emit("message", { t: "surrender" });
                }}
              >
                {t("Surrender")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export function MatchBoards() {
  const {
    game,
    connected,
    player,
    names,
    characterShortcuts,
    bindings,
    canMove,
    movementDelayed,
    handleMove,
    handleAbility,
  } = useLiveGame();
  return (
    <GameArena
      effectsEnabled={connected && game.t === "state" && !game.paused}
      you={game.you}
      opponent={game.opp}
      names={{ you: player?.name || names.you, opp: names.opp }}
      abilityBinding={characterShortcuts ? bindings.ability : undefined}
      onMove={canMove && !movementDelayed ? handleMove : undefined}
      onAbility={canMove ? handleAbility : undefined}
    />
  );
}

export function MatchControls() {
  const {
    t,
    game,
    player,
    names,
    canMove,
    movementDelayed,
    handleMove,
    error,
    actionMessage,
    settingsError,
    settingsOpen,
    setAttempt,
    now,
  } = useLiveGame();
  const ended = game.t === "end";
  const abilityNow = game.t === "state" && game.paused ? game.serverTime : now;
  const slowRemaining = Math.max(0, Math.ceil((game.you.ability.slowEndsAt - abilityNow) / 1000));
  return ended ? (
    <MatchResult
      key={game.matchId}
      game={game}
      names={{ you: player?.name || names.you, opp: names.opp }}
    />
  ) : (
    <section className="match-controls live-match-controls">
      {(error ||
        actionMessage ||
        game.you.ability.spawnPauseMoves > 0 ||
        game.you.ability.anchorMoves > 0 ||
        slowRemaining > 0 ||
        settingsError) && (
        <div className="match-controls-info min-w-0 space-y-1">
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {t(error)}{" "}
              <button
                className="min-h-11 px-2 font-semibold underline"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t("Try again")}
              </button>
            </p>
          ) : (
            actionMessage && (
              <p role="status" className="text-xs leading-5 text-muted-foreground">
                {t(actionMessage)}
              </p>
            )
          )}
          <div role="status" className="text-xs font-semibold text-primary">
            {game.you.ability.spawnPauseMoves > 0 && (
              <p>
                {t("No number spawns: {moves} moves left", {
                  moves: game.you.ability.spawnPauseMoves,
                })}
              </p>
            )}
            {game.you.ability.anchorMoves > 0 && (
              <p>
                {t("Tile anchored: {moves} moves left", { moves: game.you.ability.anchorMoves })}
              </p>
            )}
            {slowRemaining > 0 && (
              <p>
                {t(
                  abilityNow < game.you.ability.slowStartsAt
                    ? "Slowdown incoming!"
                    : "Slowed: {seconds}s · one move every 0.4s",
                  { seconds: slowRemaining },
                )}
              </p>
            )}
          </div>
          {settingsError && !settingsOpen && (
            <p role="alert" className="text-xs text-destructive">
              {t(settingsError)}
            </p>
          )}
        </div>
      )}
      <DirectionPad disabled={!canMove || movementDelayed} onMove={handleMove} />
    </section>
  );
}
