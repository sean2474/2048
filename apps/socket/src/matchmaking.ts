import type { MatchWriter } from "./result-store";
import type { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import seedrandom from "seedrandom";
import { createAbilityState, newBoard } from "game-core";
import type { MatchFound, MatchMode, MatchProfile } from "schema/in-game";
import type { Account } from "schema/results";
import { DEFAULT_PROFILE_ICON } from "schema/profile-icons";
import { playerChannel, type PlayerId, type Room } from "./types";
import { matchmakingQueue, waitingByCode, rooms, playerRoom, playerSockets, playerAccounts } from "./state";
import { waitForPlayer } from "./game";

export function cancelMatch(pid: PlayerId) {
  const index = matchmakingQueue.findIndex(entry => entry.pid === pid);
  if (index >= 0) matchmakingQueue.splice(index, 1);
  for (const [code, player] of waitingByCode) if (player === pid) waitingByCode.delete(code);
}
export function canQueue(pid: PlayerId, io: Server) {
  if (!playerRoom.has(pid)) return true;
  io.to(playerChannel(pid)).emit("message", { t: "error", reason: "already_in_game" });
  return false;
}
export type MatchAccessResult = "allowed" | "suspended" | "unavailable" | "stale";
export type MatchAccess = (players: PlayerId[], current: () => boolean, phase?: "ratings") => Promise<MatchAccessResult>;
const guestAccess: MatchAccess = async (players, current) => !current() ? "stale" : players.every(pid => !playerAccounts.get(pid)) ? "allowed" : "unavailable";
const matching = new WeakMap<Server, Map<"casual" | "ranked", Promise<void>>>();

export function findMatch(pid: PlayerId, io: Server, persistResult?: MatchWriter, mode: "casual" | "ranked" = "casual", rating = 1200, checkAccess: MatchAccess = guestAccess) {
  if (!canQueue(pid, io)) return;
  if (mode === "ranked") {
    const account = playerAccounts.get(pid);
    if (!account || !persistResult) {
      io.to(playerChannel(pid)).emit("message", { t: "error", reason: !account ? "login_required" : "ranked_unavailable" });
      return;
    }
    const queued = matchmakingQueue.some(entry => entry.pid !== pid && entry.mode === "ranked" && playerAccounts.get(entry.pid)?.id === account.id);
    const playing = [...rooms.values()].some(room => room.mode === "ranked" && room.players.some(player => room.accounts[player]?.id === account.id));
    if (queued || playing) {
      io.to(playerChannel(pid)).emit("message", { t: "error", reason: "already_in_game" });
      return;
    }
  }
  cancelMatch(pid);
  matchmakingQueue.push({ pid, mode, rating, joinedAt: Date.now() });
  void matchWaitingPlayers(io, persistResult, Date.now(), checkAccess);
}

export function matchWaitingPlayers(io: Server, persistResult?: MatchWriter, now = Date.now(), checkAccess: MatchAccess = guestAccess): Promise<void> {
  let modes = matching.get(io);
  if (!modes) { modes = new Map(); matching.set(io, modes); }
  const jobs = (["casual", "ranked"] as const).map(mode => {
    const running = modes.get(mode);
    if (running) return running;
    const job = pairWaitingPlayers(io, persistResult, now, checkAccess, mode);
    modes.set(mode, job);
    void job.finally(() => modes.delete(mode)).catch(() => {});
    return job;
  });
  return Promise.all(jobs).then(() => {});
}

async function pairWaitingPlayers(io: Server, persistResult: MatchWriter | undefined, now: number, checkAccess: MatchAccess, mode: "casual" | "ranked") {
  for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
    if (!playerSockets.has(matchmakingQueue[i].pid)) matchmakingQueue.splice(i, 1);
  }
  const ranked = mode === "ranked" ? matchmakingQueue.filter(entry => entry.mode === "ranked" && playerAccounts.get(entry.pid)?.rank) : [];
  if (ranked.length >= 2 && await checkAccess(ranked.map(entry => entry.pid),
    () => ranked.every(entry => matchmakingQueue.includes(entry) && !playerRoom.has(entry.pid)), "ratings") !== "allowed") return;
  let matched = true;
  while (matched) {
    matched = false;
    for (let i = 0; i < matchmakingQueue.length && !matched; i++) {
      const first = matchmakingQueue[i];
      if (first.mode !== mode) continue;
      let best = -1, distance = Infinity;
      for (let j = i + 1; j < matchmakingQueue.length; j++) {
        const candidate = matchmakingQueue[j];
        if (candidate.mode !== first.mode) continue;
        const gap = Math.abs(first.rating - candidate.rating);
        if (first.mode === "ranked") {
          if (!persistResult || playerAccounts.get(first.pid)?.id === playerAccounts.get(candidate.pid)?.id) continue;
          const waited = Math.max(0, Math.min(now - first.joinedAt, now - candidate.joinedAt));
          if (gap > Math.min(300, 150 + Math.floor(waited / 10_000) * 50)) continue;
        }
        if (best < 0 || first.mode === "ranked" && gap < distance) { best = j; distance = gap; }
      }
      if (best >= 0) {
        const second = matchmakingQueue[best];
        const sockets = [playerSockets.get(first.pid), playerSockets.get(second.pid)];
        const current = () => matchmakingQueue.includes(first) && matchmakingQueue.includes(second)
          && playerSockets.get(first.pid) === sockets[0] && playerSockets.get(second.pid) === sockets[1]
          && !playerRoom.has(first.pid) && !playerRoom.has(second.pid);
        const allowed = await checkAccess([first.pid, second.pid], current) === "allowed";
        if (allowed && current()) createMatch(first.pid, second.pid, io, "matchFound", persistResult, first.mode);
        // Re-scan after an await because canceling or suspending a player changes queue indices.
        matched = allowed || !current();
        if (!matched) return;
      }
    }
  }
}
export function createMatch(p1: PlayerId, p2: PlayerId, io: Server, event: "matchFound" | "roomReady", persistResult?: MatchWriter, mode: MatchMode = "casual", accounts: ReadonlyMap<PlayerId, Account | null> = playerAccounts) {
  const profiles = Object.fromEntries([p1, p2].map(pid => {
    const account = accounts.get(pid);
    const queued = matchmakingQueue.find(entry => entry.pid === pid);
    const profile: MatchProfile = {
      name: account?.name ?? "Guest",
      iconId: account ? account.iconId ?? DEFAULT_PROFILE_ICON : "guest",
      rating: mode === "ranked" && queued ? queued.rating : account?.rating ?? null,
      ...(account?.rank ? { rank: account.rank } : {}),
    };
    return [pid, profile];
  }));
  cancelMatch(p1); cancelMatch(p2);
  const id = randomUUID(), rng = seedrandom(id);
  const first = newBoard(rng), second = first.map(t => ({ ...t }));
  const room: Room = {
    startedAt: new Date().toISOString(), persistResult,
    accounts: { [p1]: accounts.get(p1) ?? null, [p2]: accounts.get(p2) ?? null },
    id, mode, players: [p1, p2], ready: new Set(), rng, open: true,
    state: {
      [p1]: { board: first, score: 0, maxTile: Math.max(...first.map(t => t.value)), pending: [], ability: createAbilityState(), telemetry: { moves: 0, charged: { xblock: 0, hardblock: 0 }, sent: { xblock: 0, hardblock: 0 }, received: { xblock: 0, hardblock: 0 }, abilityUses: 0 } },
      [p2]: { board: second, score: 0, maxTile: Math.max(...second.map(t => t.value)), pending: [], ability: createAbilityState(), telemetry: { moves: 0, charged: { xblock: 0, hardblock: 0 }, sent: { xblock: 0, hardblock: 0 }, received: { xblock: 0, hardblock: 0 }, abilityUses: 0 } },
    },
  };
  rooms.set(id, room);
  for (const pid of room.players) {
    playerRoom.set(pid, id);
    io.to(playerChannel(pid)).emit("message", { t: event, roomId: id, mode, players: { you: profiles[pid], opp: profiles[pid === p1 ? p2 : p1] } } satisfies MatchFound);
    waitForPlayer(pid, io);
  }
  return id;
}
