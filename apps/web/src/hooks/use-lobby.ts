"use client";
import { useI18n } from "ui/i18n";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MatchFound, ServerMessage } from "schema/in-game";
import { createGameSocket, CURRENT_ROOM_KEY, reasonMessage } from "@/lib/multiplayer";
import { trackGameEvent } from "@/lib/analytics";

type Mode = "findMatch" | "createRoomWithCode" | "joinRoomWithCode";
export function useLobby(
  mode: Mode,
  code?: string,
  matchMode: "casual" | "ranked" = "casual",
  enabled = true,
) {
  const { t } = useI18n();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("Connecting to game server...");
  const [error, setError] = useState("");
  const [match, setMatch] = useState<MatchFound | null>(null);
  const enterMatch = useRef<() => void>(() => {});
  useEffect(() => {
    if (!enabled || (mode === "joinRoomWithCode" && !code)) return;
    let socket: ReturnType<typeof createGameSocket> | undefined;
    try {
      const room = sessionStorage.getItem(CURRENT_ROOM_KEY);
      if (room) {
        router.replace(`/play/${room}`);
        return;
      }
      socket = createGameSocket();
    } catch {
      setError("Browser storage is unavailable. Enable it, then try again.");
      return;
    }
    const connection = socket;
    setError("");
    setJoinCode("");
    setMatch(null);
    setStatus("Connecting to game server...");
    let navigating = false;
    let queueTracked = false;
    let matchedRoom: string | undefined;
    let introTimer: ReturnType<typeof setTimeout> | undefined;
    enterMatch.current = () => {
      if (!matchedRoom || navigating) return;
      navigating = true;
      clearTimeout(introTimer);
      router.replace(`/play/${matchedRoom}`);
    };
    connection.on("connect", () => {
      if (matchedRoom) {
        enterMatch.current();
        return;
      }
      if (mode === "findMatch" && !queueTracked) {
        trackGameEvent("queue_started", { mode: matchMode });
        queueTracked = true;
      }
      setError("");
      setStatus(mode === "findMatch" ? "Looking for an opponent..." : "Preparing your room...");
      connection.emit(
        "message",
        mode === "joinRoomWithCode"
          ? { t: mode, joinCode: code }
          : mode === "findMatch"
            ? { t: mode, mode: matchMode }
            : { t: mode },
      );
    });
    connection.on("connect_error", () =>
      setError("Cannot reach the game server. Check your connection and try again."),
    );
    connection.on("disconnect", () => {
      if (!navigating) {
        setJoinCode("");
        setStatus("Reconnecting to game server...");
      }
    });
    connection.on("message", (message: ServerMessage) => {
      if (message.t === "matchFound" || message.t === "roomReady") {
        if (matchedRoom) return;
        matchedRoom = message.roomId;
        try {
          sessionStorage.setItem(CURRENT_ROOM_KEY, message.roomId);
        } catch {
          /* The URL still permits this tab to enter its already-created match. */
        }
        if (!message.players) {
          enterMatch.current();
          return;
        }
        setError("");
        setMatch(message);
        router.prefetch(`/play/${message.roomId}`);
        introTimer = setTimeout(() => enterMatch.current(), 3200);
      } else if (message.t === "waitingForPlayer") {
        setJoinCode(message.joinCode);
        setStatus("Waiting for your friend...");
      } else if (message.t === "error" || message.t === "reject") {
        setError(reasonMessage(message.reason));
        connection.disconnect();
      }
    });
    connection.connect();
    return () => {
      clearTimeout(introTimer);
      enterMatch.current = () => {};
      connection.removeAllListeners();
      connection.disconnect();
    };
  }, [mode, code, matchMode, enabled, attempt, router]);
  return {
    joinCode,
    status: t(status),
    error: t(error),
    match,
    retry: () => setAttempt((value) => value + 1),
  };
}
