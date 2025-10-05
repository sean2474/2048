import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import seedrandom from "seedrandom";
import { newBoard } from "game-core";
import type { PlayerId, UserId, JoinCode, Room } from "./types";
import { waitingByCode, codeToRoom, rooms, playerRoom, userIdToPlayerId, playerIdToUserId } from "./state";

export function createRoomWithCode(pid: PlayerId, userId: UserId, joinCode: JoinCode, socket: any, io: Server) {
  console.log(`Player ${pid} (userId: ${userId}) creating room with code: ${joinCode}`);
  
  // 이미 대기 중인 코드인지 확인
  if (waitingByCode.has(joinCode)) {
    io.to(pid).emit("message", { t: "error", reason: "code_already_used" });
    return;
  }

  // userId 매핑 저장
  userIdToPlayerId.set(userId, pid);
  playerIdToUserId.set(pid, userId);

  // 대기 상태로 등록
  waitingByCode.set(joinCode, pid);
  io.to(pid).emit("message", { t: "waitingForPlayer" });
}

export function joinRoomWithCode(pid: PlayerId, userId: UserId, joinCode: JoinCode, socket: any, io: Server) {
  console.log(`Player ${pid} (userId: ${userId}) joining room with code: ${joinCode}`);
  
  const waitingPlayer = waitingByCode.get(joinCode);
  
  if (!waitingPlayer) {
    io.to(pid).emit("message", { t: "error", reason: "code_not_found" });
    return;
  }

  if (waitingPlayer === pid) {
    io.to(pid).emit("message", { t: "error", reason: "cannot_join_own_room" });
    return;
  }

  // userId 매핑 저장
  userIdToPlayerId.set(userId, pid);
  playerIdToUserId.set(pid, userId);

  // 매칭 성공! 실제 roomId 생성
  const roomId = uuid();
  const seed = `${roomId}-${Date.now()}`;
  const rng = seedrandom(seed);

  const u1 = playerIdToUserId.get(waitingPlayer)!;
  const u2 = userId;

  const room: Room = {
    id: roomId,
    players: [waitingPlayer, pid],
    userIds: [u1, u2],
    state: {
      [waitingPlayer]: { board: newBoard(rng), score: 0, maxTile: 0, userId: u1 },
      [pid]: { board: newBoard(rng), score: 0, maxTile: 0, userId: u2 },
    },
    turnId: 0,
    rng,
    open: true,
  };

  rooms.set(roomId, room);
  playerRoom.set(waitingPlayer, roomId);
  playerRoom.set(pid, roomId);

  // 양쪽 소켓을 방에 조인
  const socket1 = io.sockets.sockets.get(waitingPlayer);
  const socket2 = io.sockets.sockets.get(pid);
  
  if (socket1) socket1.join(roomId);
  if (socket2) socket2.join(roomId);

  console.log(`Room created: ${roomId}`);

  // 양쪽에 roomId 전송
  io.to(waitingPlayer).emit("message", { t: "roomReady", roomId });
  io.to(pid).emit("message", { t: "roomReady", roomId });

  // 대기 상태 제거
  waitingByCode.delete(joinCode);
  codeToRoom.set(joinCode, roomId);
}
