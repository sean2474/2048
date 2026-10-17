import type { MatchRecord, ResultStatus } from "schema/results";
import type { Server } from "socket.io";
import { anchorHighest, applyMove, chargeAttacks, clearOldestX, hasMoves, swap32 } from "game-core";
import { ABILITY_CHARGE, MAX_PENDING_ATTACKS, SLOW_DURATION_MS, SLOW_MOVE_MS, SLOW_WARNING_MS, type S2C, type EndReason, type Dir, type AttackType, type ActionRejected } from "schema/in-game";
import { playerChannel, RECONNECT_TIMEOUT, type PlayerId, type Room, type PlayerState } from "./types";
import { rooms, playerRoom, disconnectTimers, disconnectDeadlines } from "./state";
import { DEFAULT_ABILITY_ID, type AbilityId, type SkinId } from "schema/loadout";
import { achievementForItem } from "schema/achievements";

export function clearDisconnect(pid: PlayerId) {
  clearTimeout(disconnectTimers.get(pid));
  disconnectTimers.delete(pid);
  disconnectDeadlines.delete(pid);
}

export function joinRoom(pid: PlayerId, roomId: string, io: Server, skinId: SkinId = "classic", abilityId: AbilityId = DEFAULT_ABILITY_ID) {
  const room = rooms.get(roomId);
  if (!room || !room.open || !room.players.includes(pid)) {
    io.to(playerChannel(pid)).emit("message", { t: "reject", reason: !room ? "room_not_found" : "not_in_room" } satisfies S2C);
    return;
  }
  // Freeze the loadout on first join, including across reconnects.
  if (room.state[pid].skinId === undefined) {
    const account = room.accounts[pid];
    room.state[pid].skinId = account && (!achievementForItem("skin", skinId) || account.skinId === skinId) ? skinId : "classic";
    room.state[pid].ability.id = account ? abilityId : DEFAULT_ABILITY_ID;
  }
  clearDisconnect(pid);
  room.ready.add(pid);
  if (room.ready.size === 2 && room.pausedAt !== undefined) {
    const elapsed = Date.now() - room.pausedAt;
    for (const state of Object.values(room.state)) {
      if (state.ability.slowEndsAt > room.pausedAt) {
        state.ability.slowStartsAt += elapsed;
        state.ability.slowEndsAt += elapsed;
        state.ability.nextMoveAt += elapsed;
      }
    }
    delete room.pausedAt;
  }
  broadcast(room, io);
}

export function handleInput(pid: PlayerId, dir: Dir, io: Server) {
  const room = rooms.get(playerRoom.get(pid) ?? "");
  if (!room?.open || room.ready.size !== 2) return;
  const me = room.state[pid];
  const now = Date.now();
  if (now >= me.ability.slowStartsAt && now < me.ability.slowEndsAt && now < me.ability.nextMoveAt) {
    io.to(playerChannel(pid)).emit("message", { t: "actionRejected", reason: "slowed" } satisfies S2C);
    return;
  }
  const result = applyMove(me.board, dir, room.rng, me.pending, me.ability.spawnPauseMoves === 0);
  if (!result.moved) return;
  const charged = chargeAttacks(result.board, me.attacks);
  me.telemetry.moves++;
  for (const type of ["xblock", "hardblock"] as const) {
    me.telemetry.charged[type] += charged[type] - me.attacks[type];
    me.telemetry.received[type] += me.pending.filter(effect => effect.type === "addBlock" && effect.blockType === type).length
      - result.pendingEffects.filter(effect => effect.type === "addBlock" && effect.blockType === type).length;
  }
  me.board = result.board;
  me.ability.charge = Math.min(ABILITY_CHARGE, me.ability.charge + result.scoreDelta);
  me.ability.nextMoveAt = now + SLOW_MOVE_MS;
  if (me.ability.spawnPauseMoves > 0) me.ability.spawnPauseMoves--;
  if (me.ability.anchorMoves > 0 && --me.ability.anchorMoves === 0) {
    me.board = me.board.map(tile => tile.anchored ? { ...tile, anchored: false } : tile);
  }
  me.attacks = charged;
  me.pending = result.pendingEffects;
  me.score += result.scoreDelta;
  me.maxTile = Math.max(...me.board.filter(t => !t.ghost).map(t => t.value), 0);
  if (me.maxTile >= 2048) return endGame(room, pid, "reached_2048", io);
  if (finishLockedGame(room, io)) return;
  broadcast(room, io);
}

function finishLockedGame(room: Room, io: Server): boolean {
  const [a, b] = room.players;
  const aLocked = !hasMoves(room.state[a].board), bLocked = !hasMoves(room.state[b].board);
  if (!aLocked && !bLocked) return false;
  endGame(room, aLocked && bLocked ? null : aLocked ? b : a, aLocked && bLocked ? "draw" : "opponent_locked", io);
  return true;
}

export function handleAbility(pid: PlayerId, io: Server) {
  const room = rooms.get(playerRoom.get(pid) ?? "");
  if (!room?.open) return;
  const me = room.state[pid], opp = room.state[room.players.find(p => p !== pid)!];
  const reject = (reason: ActionRejected["reason"]) => io.to(playerChannel(pid)).emit("message", { t: "actionRejected", reason } satisfies S2C);
  if (room.ready.size !== 2) { reject("paused"); return; }
  if (me.ability.charge < ABILITY_CHARGE) { reject("ability_not_ready"); return; }
  switch (me.ability.id) {
    case "clear-x": {
      const board = clearOldestX(me.board);
      if (board === me.board) { reject("ability_no_target"); return; }
      me.board = board;
      break;
    }
    case "spawn-pause":
      if (me.ability.spawnPauseMoves > 0) { reject("ability_active"); return; }
      me.ability.spawnPauseMoves = 3;
      break;
    case "frost-wave": {
      const now = Date.now();
      if (opp.ability.slowEndsAt > now) { reject("ability_active"); return; }
      opp.ability.slowStartsAt = now + SLOW_WARNING_MS;
      opp.ability.slowEndsAt = opp.ability.slowStartsAt + SLOW_DURATION_MS;
      break;
    }
    case "anchor-tile": {
      if (me.ability.anchorMoves > 0) { reject("ability_active"); return; }
      const board = anchorHighest(me.board);
      if (board === me.board || !hasMoves(board)) { reject("ability_no_target"); return; }
      me.board = board;
      me.ability.anchorMoves = 3;
      break;
    }
    case "swap-32": {
      const board = swap32(opp.board, room.rng);
      if (board === opp.board) { reject("ability_no_target"); return; }
      opp.board = board;
      break;
    }
  }
  me.ability.charge = 0;
  if (!finishLockedGame(room, io)) broadcast(room, io);
}

export function handleAttack(pid: PlayerId, blockType: AttackType, io: Server) {
  const room = rooms.get(playerRoom.get(pid) ?? "");
  if (!room?.open) return;
  const me = room.state[pid];
  const opponent = room.players.find(p => p !== pid)!;
  const opp = room.state[opponent];
  const reason: ActionRejected["reason"] | undefined = room.ready.size !== 2 ? "paused"
    : me.attacks[blockType] <= 0 ? "no_charge"
    : opp.pending.length >= MAX_PENDING_ATTACKS ? "incoming_full" : undefined;
  if (reason) {
    io.to(playerChannel(pid)).emit("message", { t: "actionRejected", reason } satisfies S2C);
    return;
  }
  me.attacks[blockType]--;
  me.telemetry.sent[blockType]++;
  // Delivery waits for the recipient's next valid move; inventory is spent now.
  opp.pending.push({ type: "addBlock", blockType });
  broadcast(room, io);
}

export function handleSurrender(pid: PlayerId, io: Server) {
  const room = rooms.get(playerRoom.get(pid) ?? "");
  if (room?.open) endGame(room, room.players.find(p => p !== pid)!, "surrender", io);
}

export function waitForPlayer(pid: PlayerId, io: Server, timeout = RECONNECT_TIMEOUT) {
  const room = rooms.get(playerRoom.get(pid) ?? "");
  if (!room?.open) return;
  room.ready.delete(pid);
  room.pausedAt ??= Date.now();
  // Repeated reconnect attempts must not extend the forfeit deadline.
  if (!disconnectTimers.has(pid)) {
    disconnectDeadlines.set(pid, Date.now() + timeout);
    disconnectTimers.set(pid, setTimeout(() => {
      if (room.open) endGame(room, room.players.find(p => p !== pid)!, "opponent_disconnected", io);
    }, timeout));
  }
  broadcast(room, io);
}

export function endGame(room: Room, winner: PlayerId | null, reason: EndReason, io: Server) {
  if (!room.open) return;
  room.open = false;
  const record: MatchRecord = {
    id: room.id, mode: room.mode, startedAt: room.startedAt, endedAt: new Date().toISOString(), reason,
    winnerSlot: winner === null ? null : winner === room.players[0] ? 1 : 2,
    participants: room.players.map(pid => ({ userId: room.accounts[pid]?.id ?? null, score: room.state[pid].score, maxTile: room.state[pid].maxTile, telemetry: room.state[pid].telemetry })),
  };
  for (const pid of room.players) {
    const opp = room.players.find(p => p !== pid)!;
    const recording: ResultStatus = !room.accounts[pid] ? "guest" : room.persistResult ? "saving" : "unavailable";
    io.to(playerChannel(pid)).emit("message", {
      t: "end", matchId: room.id, mode: room.mode, recording, winner: winner === null ? "draw" : winner === pid ? "you" : "opp",
      reason, you: publicState(room.state[pid]), opp: publicState(room.state[opp]),
    } satisfies S2C);
    clearDisconnect(pid);
    playerRoom.delete(pid);
  }
  rooms.delete(room.id);
  if (room.persistResult) {
    void room.persistResult(record).then(() => {
      for (const pid of room.players) if (room.accounts[pid]) io.to(playerChannel(pid)).emit("message", { t: "recordStatus", matchId: room.id, status: "saved" } satisfies S2C);
    }).catch(() => {
      console.error(`Result storage delayed for match ${room.id}`);
      for (const pid of room.players) if (room.accounts[pid]) io.to(playerChannel(pid)).emit("message", { t: "recordStatus", matchId: room.id, status: "delayed" } satisfies S2C);
    });
  }
}

function publicState(state: PlayerState) {
  return { skinId: state.skinId ?? "classic", board: state.board, score: state.score, maxTile: state.maxTile, attacks: state.attacks, ability: { ...state.ability } };
}
export function snapshot(room: Room, viewer: PlayerId): S2C {
  const opponent = room.players.find(p => p !== viewer)!;
  const deadlines = room.players.flatMap(p => disconnectDeadlines.has(p) ? [disconnectDeadlines.get(p)!] : []);
  return {
    t: "state", mode: room.mode, you: publicState(room.state[viewer]), opp: publicState(room.state[opponent]),
    paused: room.ready.size !== 2,
    serverTime: room.pausedAt ?? Date.now(),
    reconnectDeadline: deadlines.length ? Math.min(...deadlines) : undefined,
    pendingAttacks: room.state[viewer].pending.length,
    incomingAttacks: {
      xblock: room.state[viewer].pending.filter(effect => effect.type === "addBlock" && effect.blockType === "xblock").length,
      hardblock: room.state[viewer].pending.filter(effect => effect.type === "addBlock" && effect.blockType === "hardblock").length,
    },
    names: { you: room.accounts[viewer]?.name ?? "Guest", opp: room.accounts[opponent]?.name ?? "Guest" },
  };
}
export function broadcast(room: Room, io: Server) {
  for (const pid of room.players) io.to(playerChannel(pid)).emit("message", snapshot(room, pid));
}
