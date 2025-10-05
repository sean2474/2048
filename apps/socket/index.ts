import { createServer } from "http";
import { Server } from "socket.io";
import type { S2C } from "schema/in-game";
import type { PlayerId } from "./src/types";
import { RECONNECT_TIMEOUT } from "./src/types";
import {
  rooms,
  playerRoom,
  matchmakingQueue,
  waitingByCode,
  codeToRoom,
  disconnectTimers,
} from "./src/state";
import { findMatch, cancelMatch } from "./src/matchmaking";
import { createRoomWithCode, joinRoomWithCode } from "./src/rooms";
import { joinRoom, handleInput } from "./src/game";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  const pid: PlayerId = socket.id;
  console.log(`Player connected: ${pid}`);

  socket.on("message", (raw: unknown) => {
    let msg: any;
    try {
      msg = raw as any;
    } catch {
      return;
    }
    console.log(msg);

    // Matchmaking
    if (msg.t === "findMatch") {
      findMatch(pid, msg.userId, socket, io);
      return;
    }
    if (msg.t === "cancelMatch") {
      cancelMatch(pid);
      return;
    }

    // Room creation/joining with code
    if (msg.t === "createRoomWithCode") {
      createRoomWithCode(pid, msg.userId, msg.joinCode, socket, io);
      return;
    }
    if (msg.t === "joinRoomWithCode") {
      joinRoomWithCode(pid, msg.userId, msg.joinCode, socket, io);
      return;
    }

    // Game
    if (msg.t === "joinRoom") {
      joinRoom(pid, msg.roomId, msg.userId, socket, io);
      return;
    }
    if (msg.t === "input") {
      handleInput(pid, msg.dir, io);
      return;
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${pid}`);

    // 매칭 큐에서 제거
    const queueIndex = matchmakingQueue.indexOf(pid);
    if (queueIndex > -1) {
      matchmakingQueue.splice(queueIndex, 1);
    }

    // Join code 대기 중이면 제거
    for (const [code, waitingPid] of waitingByCode.entries()) {
      if (waitingPid === pid) {
        waitingByCode.delete(code);
        codeToRoom.delete(code);
      }
    }

    // 게임 중이면 재연결 타이머 시작
    const rid = playerRoom.get(pid);
    if (!rid) return;
    const room = rooms.get(rid);
    if (!room) return;

    // 30초 재연결 타이머 시작
    const timer = setTimeout(() => {
      console.log(`Player ${pid} reconnect timeout - closing room`);
      room.open = false;
      const opp = room.players.find((p) => p !== pid);
      if (opp) {
        const packet: S2C = { t: "end", winner: "you" };
        io.to(opp).emit("message", packet);
      }
      rooms.delete(rid);
      playerRoom.delete(pid);
      disconnectTimers.delete(pid);
    }, RECONNECT_TIMEOUT);

    disconnectTimers.set(pid, timer);
    console.log(`Started ${RECONNECT_TIMEOUT / 1000}s reconnect timer for ${pid}`);
  });
});

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`Authoritative game server listening on :${PORT}`);
});