import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import seedrandom from "seedrandom";
import { newBoard } from "game-core";
import type { PlayerId, UserId, Room } from "./types";
import { matchmakingQueue, rooms, playerRoom, userIdToPlayerId, playerIdToUserId } from "./state";
import { snapshot } from "./game";

export function findMatch(pid: PlayerId, userId: UserId, socket: any, io: Server) {
  if (matchmakingQueue.includes(pid) || playerRoom.has(pid)) {
    return;
  }

  console.log(`Player ${pid} (userId: ${userId}) entered matchmaking queue`);
  
  // userId 매핑 저장
  userIdToPlayerId.set(userId, pid);
  playerIdToUserId.set(pid, userId);
  
  matchmakingQueue.push(pid);

  if (matchmakingQueue.length >= 2) {
    const p1 = matchmakingQueue.shift()!;
    const p2 = matchmakingQueue.shift()!;
    console.log(`Matching ${p1} with ${p2}`);
    createMatch(p1, p2, io);
  }
}

export function cancelMatch(pid: PlayerId) {
  const index = matchmakingQueue.indexOf(pid);
  if (index > -1) {
    matchmakingQueue.splice(index, 1);
    console.log(`Player ${pid} cancelled matchmaking`);
  }
}

function createMatch(p1: PlayerId, p2: PlayerId, io: Server) {
  const roomId = uuid();
  const seed = `${roomId}-${Date.now()}`;
  const rng = seedrandom(seed);
  
  const u1 = playerIdToUserId.get(p1)!;
  const u2 = playerIdToUserId.get(p2)!;

  const room: Room = {
    id: roomId,
    players: [p1, p2],
    userIds: [u1, u2],
    state: {
      [p1]: { board: newBoard(rng), score: 0, maxTile: 0, userId: u1 },
      [p2]: { board: newBoard(rng), score: 0, maxTile: 0, userId: u2 },
    },
    turnId: 0,
    rng,
    open: true,
  };

  rooms.set(roomId, room);
  playerRoom.set(p1, roomId);
  playerRoom.set(p2, roomId);

  const socket1 = io.sockets.sockets.get(p1);
  const socket2 = io.sockets.sockets.get(p2);
  
  if (socket1) socket1.join(roomId);
  if (socket2) socket2.join(roomId);

  console.log(`Match created: ${roomId}`);

  io.to(p1).emit("message", { t: "matchFound", roomId });
  io.to(p2).emit("message", { t: "matchFound", roomId });

  for (const p of room.players) {
    io.to(p).emit("message", snapshot(room, p));
  }
}