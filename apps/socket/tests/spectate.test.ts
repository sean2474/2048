import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import type { SpectateUpdate } from "schema/social";
import { createGameServer } from "../src/server";
import { createMatch } from "../src/matchmaking";
import { joinRoom, handleInput, endGame } from "../src/game";
import { playerRoom, rooms, playerSockets } from "../src/state";

const ids = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];
function update(
  socket: Socket,
  predicate: (message: SpectateUpdate) => boolean = () => true,
): Promise<SpectateUpdate> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("spectate", handler);
      reject(Error("No spectator update"));
    }, 7000);
    const handler = (message: SpectateUpdate) => {
      if (predicate(message)) {
        clearTimeout(timer);
        socket.off("spectate", handler);
        resolve(message);
      }
    };
    socket.on("spectate", handler);
  });
}
async function setup(
  t: TestContext,
  canSpectate: NonNullable<Parameters<typeof createGameServer>[0]>["canSpectate"],
) {
  const server = createGameServer({
    canSpectate,
    resolveAccount: async (token) => ({ id: token, name: `Player ${ids.indexOf(token) + 1}` }),
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  const sockets: Socket[] = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await server.close();
  });
  const connect = async (
    account?: string,
    spectator = false,
    token = randomBytes(32).toString("hex"),
  ) => {
    const socket = io(`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`, {
      auth: { sessionToken: token, accessToken: account, spectator },
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      socket.connect();
    });
    return { socket, token, pid: createHash("sha256").update(token).digest("hex") };
  };
  const a = await connect(ids[0]),
    b = await connect(ids[1]);
  createMatch(a.pid, b.pid, server.io, "matchFound");
  const room = rooms.get(playerRoom.get(a.pid)!)!;
  joinRoom(a.pid, room.id, server.io);
  joinRoom(b.pid, room.id, server.io);
  return { ...server, connect, a, b, room };
}

test("spectators see live boards, pause and result without becoming players or accepting controls", async (t) => {
  const server = await setup(
    t,
    async (viewer, target, ranked) => viewer === ids[2] && target === ids[0] && !ranked,
  );
  const { socket } = await server.connect(ids[2], true, server.a.token);
  const first = update(socket);
  socket.emit("watch", { playerId: ids[0] });
  const message = await first;
  assert.ok("state" in message && message.state.t === "state");
  if (!("state" in message) || message.state.t !== "state") return;
  assert.equal(message.state.names.you, "Player 1");
  assert.equal(message.state.paused, false);
  assert.equal(playerSockets.size, 2);
  assert.equal(server.a.socket.connected, true);
  assert.equal(JSON.stringify(message).includes(server.a.pid), false);
  const before = JSON.stringify(server.room.state);
  socket.emit("message", { t: "input", dir: "left" });
  socket.emit("message", { t: "ability" });
  socket.emit("message", { t: "surrender" });
  socket.emit("message", { t: "findMatch" });
  socket.emit("message", { t: "joinRoom", roomId: server.room.id });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(JSON.stringify(server.room.state), before);
  assert.equal(server.room.open, true);
  assert.equal(playerRoom.size, 2);
  server.room.state[server.a.pid].board = [
    { id: 1, row: 0, col: 0, value: 2 },
    { id: 2, row: 0, col: 1, value: 2 },
  ];
  const moved = update(socket);
  handleInput(server.a.pid, "left", server.io);
  const next = await moved;
  assert.ok("state" in next && next.state.you.score === 4);
  const paused = update(socket, (m) => "state" in m && m.state.t === "state" && m.state.paused);
  server.b.socket.disconnect();
  await paused;
  const resumed = update(socket, (m) => "state" in m && m.state.t === "state" && !m.state.paused);
  const reconnected = await server.connect(ids[1], false, server.b.token);
  joinRoom(reconnected.pid, server.room.id, server.io);
  await resumed;
  const ended = update(socket, (m) => "state" in m && m.state.t === "end");
  endGame(server.room, server.a.pid, "surrender", server.io);
  const result = await ended;
  assert.ok("state" in result && result.state.t === "end" && result.state.winner === "you");
});

test("spectating fails closed for guests, missing permission, malformed targets and failed access checks", async (t) => {
  const server = await setup(t, async () => false);
  const guest = await server.connect(undefined, true);
  let reply = update(guest.socket);
  guest.socket.emit("watch", { playerId: ids[0] });
  assert.deepEqual(await reply, { error: "login_required" });
  const denied = await server.connect(ids[2], true);
  reply = update(denied.socket);
  denied.socket.emit("watch", { playerId: ids[0] });
  assert.deepEqual(await reply, { error: "not_spectatable" });
  const invalid = await server.connect(ids[2], true);
  reply = update(invalid.socket);
  invalid.socket.emit("watch", { playerId: ids[0], roomId: server.room.id });
  assert.deepEqual(await reply, { error: "invalid" });
});

test("removing friendship revokes an existing spectator stream", async (t) => {
  let allowed = true;
  const server = await setup(t, async () => allowed);
  const viewer = await server.connect(ids[2], true);
  const first = update(viewer.socket);
  viewer.socket.emit("watch", { playerId: ids[0] });
  await first;
  allowed = false;
  assert.deepEqual(await update(viewer.socket, (m) => "error" in m), { error: "not_spectatable" });
  const channels = server.io.sockets.sockets.get(viewer.socket.id!)!.rooms;
  assert.equal(
    [...channels].some((channel) => channel.startsWith("spectate:")),
    false,
  );
});
