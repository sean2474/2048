"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { SoloCommand, SoloMode, SoloReply, SoloState } from "schema/solo";
import { createGameSocket } from "@/lib/multiplayer";

export function useSolo(account: string | null | undefined) {
  const socket = useRef<Socket | null>(null);
  const pending = useRef(false);
  const current = useRef<SoloState | null>(null);
  const [state, setState] = useState<SoloState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const received = useRef(0);
  const send = useCallback((command: SoloCommand) => {
    const client = socket.current;
    if (!client?.connected || pending.current) return;
    pending.current = true;
    if (command.t === "start" || command.t === "save") setWorking(true);
    client.timeout(10_000).emit("solo", command, (failure: Error | null, reply: SoloReply) => {
      if (socket.current !== client) return;
      pending.current = false; setWorking(false);
      if (failure) { setError("solo_connection"); return; }
      setError(reply.error === "move_rate_limited" ? null : reply.error ?? null);
      if (!reply.error || reply.state) {
        current.current = reply.state; setState(reply.state);
        received.current = performance.now(); setElapsed(reply.state?.elapsedMs ?? 0);
      }
    });
  }, []);
  useEffect(() => {
    if (account === undefined) return;
    current.current = null; setState(null); setElapsed(0); setError(null); setConnected(false); setWorking(false);
    let client: Socket;
    try { client = createGameSocket(); }
    catch { setError("solo_connection"); return; }
    socket.current = client;
    client.on("connect", () => { pending.current = false; setConnected(true); send({ t: "state" }); });
    client.on("disconnect", () => { pending.current = false; setConnected(false); setWorking(false); setError("solo_connection"); });
    client.on("connect_error", () => { setConnected(false); setError("solo_connection"); });
    client.connect();
    const sync = window.setInterval(() => send({ t: "state" }), 10_000);
    return () => { socket.current = null; pending.current = false; window.clearInterval(sync); client.disconnect(); };
  }, [account, send]);
  useEffect(() => {
    if (state?.status !== "playing") return;
    const timer = window.setInterval(() => setElapsed(state.elapsedMs + performance.now() - received.current), 50);
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.clearInterval(timer); window.removeEventListener("beforeunload", warn); };
  }, [state]);
  const move = (dir: "up" | "down" | "left" | "right") => {
    const run = current.current;
    if (run?.status === "playing") send({ t: "move", id: run.id, seq: run.seq + 1, dir });
  };
  return { state, elapsed, connected, error, working, move, start: (mode: SoloMode) => send({ t: "start", mode }),
    save: () => { if (current.current) send({ t: "save", id: current.current.id }); },
    reconnect: () => { socket.current?.connect(); send({ t: "state" }); } };
}
