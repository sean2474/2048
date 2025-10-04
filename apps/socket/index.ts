import { createServer } from "http";
import { Server } from "socket.io";
import seedrandom from "seedrandom";
import { applyMove, emitDebuffEvents, applyEffects, newBoard } from "game-core";
import type { Board, S2C, ClientMsg, Effect } from "schema/in-game";

type PlayerId = string;
type RoomId = string;

type PlayerState = {
  board: Board;
  score: number;
  maxTile: number;
};

type Room = {
  id: RoomId;
  players: PlayerId[];
  state: Record<PlayerId, PlayerState>;
  turnId: number;
  rng: () => number;
  open: boolean;
};

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const rooms = new Map<RoomId, Room>();
const playerRoom = new Map<PlayerId, RoomId>();
const matchmakingQueue: PlayerId[] = []; // 매칭 대기 큐

function mkRng(seed: string) { return seedrandom(seed); }

io.on("connection", (socket) => {
  const pid: PlayerId = socket.id;
  console.log(`Player connected: ${pid}`);

  socket.on("message", (raw: unknown) => {
    let msg: any;
    try { msg = raw as any; } catch { return; }
    console.log(msg);

    if (msg.t === "findMatch") {
      findMatch(pid, socket);
      return;
    }
    if (msg.t === "cancelMatch") {
      cancelMatch(pid);
      return;
    }
    if (msg.t === "joinRoom") {
      joinRoom(pid, msg.roomId, socket);
      return;
    }
    if (msg.t === "input") {
      handleInput(pid, msg.dir);
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

    const rid = playerRoom.get(pid);
    if (!rid) return;
    const room = rooms.get(rid);
    if (!room) return;
    room.open = false;
    const opp = room.players.find(p => p !== pid);
    if (opp) {
      const packet: S2C = { t: "end", winner: "you" };
      io.to(opp).emit("message", packet);
    }
    rooms.delete(rid);
    playerRoom.delete(pid);
  });
});

function findMatch(pid: PlayerId, socket: any) {
  if (matchmakingQueue.includes(pid) || playerRoom.has(pid)) {
    return;
  }

  console.log(`Player ${pid} entered matchmaking queue`);
  matchmakingQueue.push(pid);

  // 큐에 2명 이상이면 매칭
  if (matchmakingQueue.length >= 2) {
    const p1 = matchmakingQueue.shift()!;
    const p2 = matchmakingQueue.shift()!;
    console.log(`Matching ${p1} with ${p2}`);
    createMatch(p1, p2);
  }
}

function cancelMatch(pid: PlayerId) {
  const index = matchmakingQueue.indexOf(pid);
  if (index > -1) {
    matchmakingQueue.splice(index, 1);
    console.log(`Player ${pid} cancelled matchmaking`);
  }
}

function createMatch(p1: PlayerId, p2: PlayerId) {
  const roomId = `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const seed = `${roomId}-${Date.now()}`;
  const rng = mkRng(seed);

  const room: Room = {
    id: roomId,
    players: [p1, p2],
    state: {
      [p1]: { board: newBoard(rng), score: 0, maxTile: 0 },
      [p2]: { board: newBoard(rng), score: 0, maxTile: 0 },
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

  console.log(`Match created: ${roomId} with players ${p1} and ${p2}`);

  // 매칭 성공 알림
  io.to(p1).emit("message", { t: "matchFound", roomId });
  io.to(p2).emit("message", { t: "matchFound", roomId });

  // 게임 상태 전송
  for (const p of room.players) {
    io.to(p).emit("message", snapshot(room, p));
  }
}

function joinRoom(pid: PlayerId, roomId: RoomId, socket: any) {
  let room = rooms.get(roomId);

  if (!room) {
    const seed = `${roomId}-${Date.now()}`;
    const rng = mkRng(seed);
    room = {
      id: roomId,
      players: [pid],
      state: {} as any,
      turnId: 0,
      rng,
      open: true,
    };
    room.state[pid] = { board: newBoard(rng), score: 0, maxTile: 0 };
    rooms.set(roomId, room);
    playerRoom.set(pid, roomId);
    socket.join(roomId);
    io.to(pid).emit("message", snapshot(room, pid));
    return;
  }

  if (!room.open || room.players.length >= 2) {
    io.to(pid).emit("message", { t: "reject", reason: "room_closed" } satisfies S2C);
    return;
  }

  room.players.push(pid);
  room.state[pid] = { board: newBoard(room.rng), score: 0, maxTile: 0 };
  playerRoom.set(pid, roomId);
  socket.join(roomId);

  for (const p of room.players) {
    io.to(p).emit("message", snapshot(room!, p));
  }
}

function handleInput(pid: PlayerId, dir: "up"|"down"|"left"|"right") {
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
  for (const p of room.players) {
    io.to(p).emit("message", snapshot(room, p, effects));
  }
}

function snapshot(room: Room, viewer: PlayerId, effects?: Effect[]): S2C {
  const [p0, p1] = room.players;
  const you = room.state[viewer];
  const oppId = room.players.find(p => p !== viewer)!;
  const opp = room.state[oppId];

  return {
    t: "state",
    you: { board: you.board, score: you.score, maxTile: you.maxTile },
    opp:  opp,
    effects,
  };
}

httpServer.listen(4000, () => {
  console.log("Authoritative game server listening on :4000");
});