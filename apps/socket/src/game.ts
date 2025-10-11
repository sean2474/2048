import { Server } from "socket.io";
import { applyMove, emitDebuffEvents, applyEffects, hasMoves } from "game-core";
import type { S2C, Effect, EndReason } from "schema/in-game";
import type { PlayerId, UserId, RoomId, Room } from "./types";
import { rooms, playerRoom, disconnectTimers, userIdToPlayerId, playerIdToUserId } from "./state";

export function joinRoom(pid: PlayerId, roomId: RoomId, userId: UserId, socket: any, io: Server) {
  const room = rooms.get(roomId);

  if (!room) {
    io.to(pid).emit("message", { t: "reject", reason: "room_not_found" } satisfies S2C);
    return;
  }

  if (!room.open) {
    io.to(pid).emit("message", { t: "reject", reason: "room_closed" } satisfies S2C);
    return;
  }

  // userId로 재연결 확인
  if (room.userIds.includes(userId)) {
    console.log(`User ${userId} (new socket: ${pid}) reconnecting to room ${roomId}`);
    
    // 기존 플레이어 찾기
    const playerIndex = room.userIds.indexOf(userId);
    const oldPid = room.players[playerIndex];
    
    // 재연결 타이머 취소
    const timer = disconnectTimers.get(oldPid);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(oldPid);
      console.log(`Cancelled reconnect timer for ${oldPid}`);
    }

    // 플레이어 ID 업데이트
    room.players[playerIndex] = pid;
    const playerState = room.state[oldPid];
    delete room.state[oldPid];
    room.state[pid] = playerState;
    
    playerRoom.delete(oldPid);
    playerRoom.set(pid, roomId);
    
    userIdToPlayerId.set(userId, pid);
    playerIdToUserId.delete(oldPid);
    playerIdToUserId.set(pid, userId);
    
    socket.join(roomId);
    
    io.to(pid).emit("message", snapshot(room, pid));
    return;
  }

  // 새 플레이어는 접속 불가
  io.to(pid).emit("message", { t: "reject", reason: "not_in_room" } satisfies S2C);
}

export function handleInput(pid: PlayerId, dir: "up" | "down" | "left" | "right", io: Server) {
  const rid = playerRoom.get(pid);
  if (!rid) return;
  const room = rooms.get(rid);
  if (!room || !room.open) return;

  const me = room.state[pid];
  const res = applyMove(me.board, dir, room.rng);
  if (res.moved) {
    me.board = res.board;
    me.score += res.scoreDelta;
    me.maxTile = Math.max(me.maxTile, res.mergedMaxTile);
  }

  const effects: Effect[] = emitDebuffEvents(res.mergedMaxTile);
  const oppId = room.players.find(p => p !== pid);
  if (oppId) {
    const opp = room.state[oppId];
    opp.board = applyEffects(opp.board, effects, room.rng);
  }

  room.turnId += 1;

  // 승리 조건 체크
  const endResult = checkWinCondition(room, pid);
  if (endResult) {
    endGame(room, endResult.winner, endResult.reason, io);
    return;
  }

  // 상태 전송 후 다시 한 번 체크 (상대방이 움직일 수 있는지)
  for (const p of room.players) {
    io.to(p).emit("message", snapshot(room, p, effects));
  }

  // 모든 플레이어가 움직일 수 있는지 최종 체크
  const finalCheck = checkAllPlayersLocked(room);
  if (finalCheck) {
    endGame(room, finalCheck.winner, finalCheck.reason, io);
    return;
  }
}

// 항복 처리
export function handleSurrender(pid: PlayerId, io: Server) {
  const rid = playerRoom.get(pid);
  if (!rid) return;
  const room = rooms.get(rid);
  if (!room || !room.open) return;

  const oppId = room.players.find(p => p !== pid);
  if (!oppId) return;

  endGame(room, oppId, "surrender", io);
}

// 승리 조건 체크
function checkWinCondition(room: Room, lastPlayer: PlayerId): { winner: PlayerId; reason: EndReason } | null {
  const oppId = room.players.find(p => p !== lastPlayer);
  if (!oppId) return null;

  const myState = room.state[lastPlayer];
  const oppState = room.state[oppId];

  // 1. 2048 타일 달성 (본인)
  if (myState.maxTile >= 2048) {
    return { winner: lastPlayer, reason: "reached_2048" };
  }

  // 2. 상대방이 움직일 수 없음
  if (!hasMoves(oppState.board)) {
    return { winner: lastPlayer, reason: "opponent_locked" };
  }

  return null;
}

// 모든 플레이어 체크 (누군가 못 움직이면 상대방 승리)
function checkAllPlayersLocked(room: Room): { winner: PlayerId; reason: EndReason } | null {
  for (const pid of room.players) {
    const playerState = room.state[pid];
    if (!hasMoves(playerState.board)) {
      // 이 플레이어가 못 움직임 → 상대방 승리
      const oppId = room.players.find(p => p !== pid);
      if (oppId) {
        return { winner: oppId, reason: "opponent_locked" };
      }
    }
  }
  return null;
}

// 게임 종료 처리
function endGame(room: Room, winner: PlayerId, reason: EndReason, io: Server) {
  room.open = false;

  for (const pid of room.players) {
    const isWinner = pid === winner;
    const oppId = room.players.find(p => p !== pid);
    const opp = oppId ? room.state[oppId] : undefined;
    const endMsg: S2C = {
      t: "end",
      winner: isWinner ? "you" : "opp",
      reason,
      you: room.state[pid],
      opp: opp
    };
    io.to(pid).emit("message", endMsg);
  }

  console.log(`Game ended in room ${room.id}: winner=${winner}, reason=${reason}`);
}

export function snapshot(room: Room, viewer: PlayerId, effects?: Effect[]): S2C {
  const you = room.state[viewer];
  const oppId = room.players.find(p => p !== viewer);
  const opp = oppId ? room.state[oppId] : undefined;

  return {
    t: "state",
    you: { board: you.board, score: you.score, maxTile: you.maxTile },
    opp: opp,
    effects,
  };
}