import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import type { FriendPresence } from "schema/social";
import { createGameServer } from "../src/server";
import { createMatch } from "../src/matchmaking";
import { joinRoom, endGame } from "../src/game";
import { rooms, playerRoom, playerSockets } from "../src/state";

const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
function next(socket: Socket, predicate: (value: FriendPresence) => boolean = () => true) {
  return new Promise<FriendPresence>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("friendPresence", receive); reject(Error("Presence update timed out")); }, 7500);
    const receive = (value: FriendPresence) => {
      if (predicate(value)) { clearTimeout(timeout); socket.off("friendPresence", receive); resolve(value); }
    };
    socket.on("friendPresence", receive);
  });
}

test("friend presence follows authenticated connections and game lifecycle without taking over players", { timeout: 55000 }, async t => {
  let allowed = [ids[1], ids[2]], fail = false, reads = 0;
  const server = createGameServer({
    resolveAccount: async token => ({ id: token, name: "Fixture" }),
    readFriends: async token => { reads++; assert.equal(token, ids[0]); if (fail) throw Error("offline"); return allowed; },
    writeSolo: async () => {}, readSuspensions: async () => [],
  });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const sockets: Socket[] = [];
  t.after(async () => { sockets.forEach(socket => socket.disconnect()); await server.close(); });
  const connect = async (account?: string, spectator = true, sessionToken = randomBytes(32).toString("hex")) => {
    const socket = io(`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`, { auth: { accessToken: account, sessionToken, spectator }, transports: ["websocket"], reconnection: false, autoConnect: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
    return { socket, sessionToken, pid: createHash("sha256").update(sessionToken).digest("hex") };
  };
  const a = await connect(ids[0], false), b = await connect(ids[1], false);
  const viewer = await connect(ids[0], true, a.sessionToken);
  let update = next(viewer.socket);
  for (let i = 0; i < 20; i++) viewer.socket.emit("friends", { ids: ["unrelated-player"] });
  assert.deepEqual(await update, { friends: { [ids[1]]: "online", [ids[2]]: "offline" } });
  assert.equal(reads, 1); assert.equal(a.socket.connected, true); assert.equal(playerSockets.size, 2);
  viewer.socket.emit("message", { t: "findMatch" });
  update = next(viewer.socket, value => "friends" in value && value.friends[ids[1]] === "playing");
  createMatch(a.pid, b.pid, server.io, "matchFound");
  const room = rooms.get(playerRoom.get(a.pid)!)!;
  joinRoom(a.pid, room.id, server.io); joinRoom(b.pid, room.id, server.io);
  await update;
  update = next(viewer.socket, value => "friends" in value && value.friends[ids[1]] === "online");
  endGame(room, a.pid, "surrender", server.io); await update;
  update = next(viewer.socket, value => "friends" in value && value.friends[ids[1]] === "solo");
  const solo = await b.socket.timeout(2000).emitWithAck("solo", { t: "start", mode: "endless" });
  assert.equal(solo.error, undefined); await update;
  const otherTab = await connect(ids[1]);
  update = next(viewer.socket, value => "friends" in value && value.friends[ids[1]] === "online");
  b.socket.disconnect(); await update;
  update = next(viewer.socket, value => "friends" in value && value.friends[ids[1]] === "offline");
  otherTab.socket.disconnect(); await update;
  update = next(viewer.socket, value => "friends" in value && !Object.keys(value.friends).length);
  allowed = []; await update;
  update = next(viewer.socket, value => "error" in value);
  fail = true; assert.deepEqual(await update, { error: "presence_unavailable" });
  update = next(viewer.socket, value => "friends" in value);
  fail = false; allowed = [ids[2]]; assert.deepEqual(await update, { friends: { [ids[2]]: "offline" } });

  const guest = await connect(); const before = reads;
  update = next(guest.socket); guest.socket.emit("friends");
  assert.deepEqual(await update, { error: "presence_unavailable" }); assert.equal(reads, before);
});
