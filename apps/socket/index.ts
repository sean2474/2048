import { createServer } from "http";
import { Server } from "socket.io";
import seedrandom from "seedrandom";
import { applyMove, emitDebuffEvents, applyEffects, newBoard } from "game-core";
import type { Board, S2C, ClientMsg, Effect } from "schema";

type PlayerId = string;
type RoomId = string;

type PlayerState = {
  board: Board;
  score: number;
  maxTile: number;
};

type Room = {
  id: RoomId;
  players: PlayerId[];                 // [p0, p1]
  state: Record<PlayerId, PlayerState>;
  turnId: number;
  rng: () => number;
  open: boolean;
};

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*" },               // 개발용 (프로덕션에서 도메인 제한)
});

const rooms = new Map<RoomId, Room>();
const playerRoom = new Map<PlayerId, RoomId>();

function mkRng(seed: string) { return seedrandom(seed); }

io.on("connection", (socket) => {
  const pid: PlayerId = socket.id;

  socket.on("message", (raw: unknown) => {
    // 모든 메시지는 JSON으로
    let msg: ClientMsg;
    try { msg = raw as ClientMsg; } catch { return; }

    if (msg.t === "joinRoom") {
      joinRoom(pid, msg.roomId, socket);
      return;
    }
    if (msg.t === "input") {
      handleInput(pid, msg.turnId, msg.dir);
      return;
    }
  });

  socket.on("disconnect", () => {
    const rid = playerRoom.get(pid);
    if (!rid) return;
    const room = rooms.get(rid);
    if (!room) return;
    // 간단 처리: 나가면 방 닫고 상대 승리
    room.open = false;
    const opp = room.players.find(p => p !== pid);
    if (opp) {
      const packet: S2C = { t: "end", winner: "you" }; // 남은 쪽 기준
      io.to(opp).emit("message", packet);
    }
    rooms.delete(rid);
    playerRoom.delete(pid);
  });
});

function joinRoom(pid: PlayerId, roomId: RoomId, socket: any) {
  let room = rooms.get(roomId);

  if (!room) {
    // 첫 입장자: 방 생성
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
    // 대기 알림
    io.to(pid).emit("message", snapshot(room, pid));
    return;
  }

  if (!room.open || room.players.length >= 2) {
    io.to(pid).emit("message", { t: "reject", reason: "room_closed" } satisfies S2C);
    return;
  }

  // 두 번째 입장자
  room.players.push(pid);
  room.state[pid] = { board: newBoard(room.rng), score: 0, maxTile: 0 };
  playerRoom.set(pid, roomId);
  socket.join(roomId);

  // 둘 다에게 상태 전송
  for (const p of room.players) {
    io.to(p).emit("message", snapshot(room!, p));
  }
}

function handleInput(pid: PlayerId, clientTurnId: number, dir: "up"|"down"|"left"|"right") {
  const rid = playerRoom.get(pid);
  if (!rid) return;
  const room = rooms.get(rid);
  if (!room || !room.open) return;

  // 간단 권위: 클라가 보낸 turnId가 현재가 아니면 거절
  if (clientTurnId !== room.turnId) {
    io.to(pid).emit("message", { t: "reject", reason: "stale_turn" } as S2C);
    return;
  }

  // 내 보드 판정
  const me = room.state[pid];
  const res = applyMove(me.board, dir, room.rng);
  if (res.moved) {
    me.board = res.board;
    me.score += res.scoreDelta;
    me.maxTile = Math.max(me.maxTile, res.mergedMaxTile);
  }

  // 공격 이벤트 생성 & 상대에게 적용
  const effects: Effect[] = emitDebuffEvents(res.mergedMaxTile);
  const oppId = room.players.find(p => p !== pid);
  if (oppId) {
    const opp = room.state[oppId];
    opp.board = applyEffects(opp.board, effects, room.rng);
  }

  // 턴 증가 + 브로드캐스트(스냅샷)
  room.turnId += 1;
  for (const p of room.players) {
    io.to(p).emit("message", snapshot(room, p, effects));
  }

  // 간단한 종료 조건(보드 꽉참 등) 체크는 이후에 추가
}

function snapshot(room: Room, viewer: PlayerId, effects?: Effect[]): S2C {
  const [p0, p1] = room.players;
  const you = room.state[viewer];
  const oppId = room.players.find(p => p !== viewer)!;
  const opp = room.state[oppId];

  return {
    t: "state",
    turnId: room.turnId,
    you: { board: you.board, score: you.score, maxTile: you.maxTile },
    opp:  { board: opp.board, score: opp.score, maxTile: opp.maxTile },
    effects,
  };
}

httpServer.listen(4000, () => {
  console.log("Authoritative game server listening on :4000");
});
