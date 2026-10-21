"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "ui/i18n";
import type { End, ServerState } from "schema/in-game";
import type { SpectateUpdate } from "schema/social";
import { createGameSocket, matchModeLabel } from "@/lib/multiplayer";
import { usePlayer } from "@/hooks/use-player";
import { GameArena } from "@/components/2048/game-arena";
import { Button } from "@/components/ui/button";

export function Spectator({ id, loading }: { id: string; loading: ReactNode }) {
  const { t } = useI18n();
  const { user } = usePlayer();
  const accountId = user && !user.is_anonymous ? user.id : null;
  const [state, setState] = useState<ServerState | End | null>(null);
  const [names, setNames] = useState({ you: "", opp: "" });
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setState(null); setError(""); setConnected(false);
    if (!accountId) return;
    let socket: ReturnType<typeof createGameSocket>;
    try { socket = createGameSocket(true); }
    catch { setError("Could not connect to spectating. Please try again."); return; }
    let finished = false;
    socket.on("connect", () => { setConnected(true); setError(""); if (!finished) socket.emit("watch", { playerId: id }); });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setError("Could not connect to spectating. Please try again."));
    socket.on("spectate", (update: SpectateUpdate) => {
      if ("error" in update) {
        setState(null);
        setError(update.error === "not_spectatable" ? "No match available to watch. Watch a friend’s active match or a TOP 50 player’s ranked match." : "Could not connect to spectating. Please try again.");
        return;
      }
      setError(""); setState(update.state);
      if (update.state.t === "state") setNames(update.state.names);
      else { finished = true; socket.disconnect(); }
    });
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [id, accountId, attempt]);
  return <>

    <section className="game-stage" aria-label={t("Spectating")}>
      {user === undefined ? <p role="status">{t("Loading…")}</p> : !accountId ? <div className="space-y-4 rounded-2xl border bg-card p-6"><p>{t("Sign in to add friends, send messages, and spectate.")}</p><Button asChild><Link href="/login">{t("Login")}</Link></Button></div>
        : error ? <div role="alert" className="space-y-3 rounded-2xl border bg-card p-6"><p className="text-sm">{t(error)}</p><Button onClick={() => setAttempt(value=>value+1)}>{t("Try again")}</Button></div>
        : !state ? loading
        : <GameArena you={state.you} opponent={state.opp} names={names} spectating effectsEnabled={state.t === "state" && !state.paused && connected} />}
    </section>
    <div className="match-controls">{state && <p role="status" className="w-full rounded-xl border bg-card px-4 py-3 text-sm">{state.t === "end" ? state.winner === "draw" ? t("Match ended in a draw.") : t("{name} won the match.", { name: state.winner === "you" ? names.you : names.opp }) : !connected ? t("Connection lost. Reconnecting…") : state.paused ? t("Match paused while a player reconnects.") : `${t("Live spectating")} · ${t(matchModeLabel[state.mode])}`}</p>}</div>
  </>;
}
