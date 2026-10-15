import type { MatchWriter } from "./result-store";
import type { Server } from "socket.io";
import { randomInt } from "node:crypto";
import { playerChannel, type PlayerId } from "./types";
import { waitingByCode, playerSockets } from "./state";
import { canQueue, cancelMatch, createMatch, type MatchAccess } from "./matchmaking";
export function createRoomWithCode(pid: PlayerId, io: Server) {
  if (!canQueue(pid, io)) return;
  cancelMatch(pid);
  let code: string;
  do { code = randomInt(36 ** 6).toString(36).padStart(6, "0").toUpperCase(); } while (waitingByCode.has(code));
  waitingByCode.set(code, pid);
  io.to(playerChannel(pid)).emit("message", { t: "waitingForPlayer", joinCode: code });
}
export async function joinRoomWithCode(pid: PlayerId, code: string, io: Server, persistResult: MatchWriter | undefined, checkAccess: MatchAccess, requestCurrent: () => boolean) {
  if (!canQueue(pid, io)) return;
  const host = waitingByCode.get(code);
  if (!host || !playerSockets.has(host)) {
    waitingByCode.delete(code);
    io.to(playerChannel(pid)).emit("message", { t: "error", reason: "code_not_found" });
    return;
  }
  if (host === pid) {
    io.to(playerChannel(pid)).emit("message", { t: "error", reason: "cannot_join_own_room" });
    return;
  }
  cancelMatch(pid);
  const hostSocket = playerSockets.get(host);
  const current = () => requestCurrent() && waitingByCode.get(code) === host && playerSockets.get(host) === hostSocket;
  const access = await checkAccess([host, pid], current);
  if (!requestCurrent() || access === "unavailable") return;
  if (!current()) {
    io.to(playerChannel(pid)).emit("message", { t: "error", reason: "code_not_found" });
    return;
  }
  if (access === "allowed" && canQueue(pid, io)) createMatch(host, pid, io, "roomReady", persistResult, "friend");
}
