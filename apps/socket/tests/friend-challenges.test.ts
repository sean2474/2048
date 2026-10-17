import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { io, type Socket } from "socket.io-client";
import type { ChallengeEvent, ChallengeReply, FriendChallengeCommand } from "schema/social";
import type { ServerMessage } from "schema/in-game";
import { createGameServer } from "../src/server";
import { createMatch } from "../src/matchmaking";
import { rooms, playerRoom, playerSockets } from "../src/state";

const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
function event<T>(socket: Socket, name: string, predicate: (value: T) => boolean, timeout = 3000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(Error(`${name} timed out`)); }, timeout);
    const receive = (value: T) => { if (predicate(value)) { clearTimeout(timer); socket.off(name, receive); resolve(value); } };
    socket.on(name, receive);
  });
}
const challenge = (socket: Socket, command: FriendChallengeCommand) => socket.timeout(3000).emitWithAck("challenge", command) as Promise<ChallengeReply>;
const next = (socket: Socket, kind: ChallengeEvent["t"], timeout?: number) => event<ChallengeEvent>(socket, "challenge", value => value.t === kind, timeout);
async function setup(t: TestContext, friends = async (id: string) => id === ids[0] ? [ids[1]] : id === ids[1] ? [ids[0]] : []) {
  const server = createGameServer({ readFriends: friends, resolveAccount: async id => ({ id, name: `Player ${ids.indexOf(id) + 1}` }), writeSolo: async () => {}, readSuspensions: async () => [] });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const sockets: Socket[] = [];
  t.after(async () => { sockets.forEach(socket => socket.disconnect()); await server.close(); });
  const connect = async (account?: string, spectator = true, token = randomBytes(32).toString("hex")) => {
    const socket = io(`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`, { auth: { sessionToken: token, accessToken: account, spectator }, autoConnect: false, reconnection: false, transports: ["websocket"] });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
    if (spectator) { const ready = event(socket, "friendPresence", () => true); socket.emit("friends"); await ready; }
    return { socket, token, pid: createHash("sha256").update(token).digest("hex") };
  };
  const a = await connect(ids[0]), b = await connect(ids[1]);
  const invite = async () => {
    const pending = next(b.socket, "pending");
    assert.deepEqual(await challenge(a.socket, { t: "send", playerId: ids[1] }), {});
    const value = await pending; assert.equal(value.t, "pending");
    if (value.t !== "pending") throw Error("Expected invitation");
    return value.invitation;
  };
  return { ...server, a, b, connect, invite };
}

test("accepting from multiple tabs creates one friend match and both original sessions can play", async t => {
  const server = await setup(t);
  const secondTab = await server.connect(ids[1]);
  const stranger = await server.connect(ids[2]);
  const invitation = await server.invite();
  assert.equal(rooms.size, 0);
  assert.deepEqual(Object.keys(invitation).sort(), ["expiresAt", "from", "id", "to"]);
  assert.equal(invitation.from.name, "Player 1"); assert.equal(invitation.to.name, "Player 2");
  assert.deepEqual(await challenge(stranger.socket, { t: "accept", id: invitation.id }), { error: "expired" });
  assert.deepEqual(await challenge(server.a.socket, { t: "accept", id: invitation.id }), { error: "expired" });
  const started = next(server.a.socket, "start");
  const starts: { socket: Socket; token: string; pid: string }[] = [];
  for (const tab of [server.b, secondTab]) tab.socket.on("challenge", value => { if (value.t === "start") starts.push(tab); });
  const replies = await Promise.all([server.b, secondTab].map(tab => challenge(tab.socket, { t: "accept", id: invitation.id })));
  assert.equal(replies.filter(reply => !reply.error).length, 1);
  const result = await started; assert.equal(result.t, "start");
  assert.equal(rooms.size, 1); assert.equal(starts.length, 1);
  assert.equal(playerSockets.size, 0);
  const room = [...rooms.values()][0]; assert.equal(room.mode, "friend");
  assert.equal(room.accounts[server.a.pid]?.id, ids[0]); assert.equal(room.accounts[starts[0].pid]?.id, ids[1]);
  const aGame = await server.connect(ids[0], false, server.a.token);
  const bGame = await server.connect(ids[1], false, starts[0].token);
  const playingA = event<ServerMessage>(aGame.socket, "message", value => value.t === "state" && !value.paused);
  const playingB = event<ServerMessage>(bGame.socket, "message", value => value.t === "state" && !value.paused);
  aGame.socket.emit("message", { t: "joinRoom", roomId: room.id }); bGame.socket.emit("message", { t: "joinRoom", roomId: room.id });
  await Promise.all([playingA, playingB]);
  assert.equal(server.a.socket.connected, true); assert.equal(starts[0].socket.connected, true);
  assert.deepEqual(await challenge(starts[0].socket, { t: "accept", id: invitation.id }), { error: "expired" });
});

test("guests, malformed requests, self challenges and non-friends cannot invite", async t => {
  const server = await setup(t);
  const guest = await server.connect();
  assert.deepEqual(await challenge(guest.socket, { t: "send", playerId: ids[0] }), { error: "unavailable" });
  assert.deepEqual(await server.a.socket.timeout(3000).emitWithAck("challenge", { t: "send", playerId: "bad" }), { error: "invalid" });
  assert.deepEqual(await challenge(server.a.socket, { t: "send", playerId: ids[0] }), { error: "invalid" });
  assert.deepEqual(await challenge(server.a.socket, { t: "send", playerId: ids[2] }), { error: "not_friends" });
  assert.equal(rooms.size, 0);
});

test("offline friends are rejected and rapid invitations are limited", async t => {
  const server = await setup(t);
  server.b.socket.disconnect();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await challenge(server.a.socket, { t: "send", playerId: ids[1] }), { error: "offline" });
  assert.deepEqual(await challenge(server.a.socket, { t: "send", playerId: ids[1] }), { error: "rate_limited" });
  assert.equal(rooms.size, 0);
});

test("decline and sender cancellation close the request for both players", async t => {
  const server = await setup(t);
  const invitation = await server.invite();
  const closedA = next(server.a.socket, "closed"), closedB = next(server.b.socket, "closed");
  assert.deepEqual(await challenge(server.b.socket, { t: "decline", id: invitation.id }), {});
  for (const result of await Promise.all([closedA, closedB])) assert.deepEqual(result, { t: "closed", id: invitation.id, reason: "declined" });
  const pending = next(server.a.socket, "pending");
  assert.deepEqual(await challenge(server.b.socket, { t: "send", playerId: ids[0] }), {});
  const inverse = await pending; if (inverse.t !== "pending") throw Error("Expected invitation");
  const cancelled = next(server.a.socket, "closed");
  assert.deepEqual(await challenge(server.b.socket, { t: "cancel", id: inverse.invitation.id }), {});
  assert.deepEqual(await cancelled, { t: "closed", id: inverse.invitation.id, reason: "cancelled" });
  assert.equal(rooms.size, 0);
});

test("friendship is rechecked at acceptance and disconnect cancels pending invitations", async t => {
  let friends = true;
  const server = await setup(t, async id => friends ? [id === ids[0] ? ids[1] : ids[0]] : []);
  const invitation = await server.invite(); friends = false;
  const closed = next(server.a.socket, "closed");
  assert.deepEqual(await challenge(server.b.socket, { t: "accept", id: invitation.id }), { error: "not_friends" });
  assert.deepEqual(await closed, { t: "closed", id: invitation.id, reason: "unavailable" });
  friends = true;
  const pending = next(server.a.socket, "pending");
  assert.deepEqual(await challenge(server.b.socket, { t: "send", playerId: ids[0] }), {});
  const inverse = await pending; if (inverse.t !== "pending") throw Error("Expected invitation");
  const disconnected = next(server.a.socket, "closed"); server.b.socket.disconnect();
  assert.deepEqual(await disconnected, { t: "closed", id: inverse.invitation.id, reason: "unavailable" });
  assert.equal(rooms.size, 0);
});

test("starting another game while invited cannot create a second match", async t => {
  const server = await setup(t);
  const invitation = await server.invite();
  const game = await server.connect(ids[1], false, server.b.token);
  const solo = await game.socket.timeout(3000).emitWithAck("solo", { t: "start", mode: "endless" });
  assert.equal(solo.error, undefined);
  const reply = await challenge(server.b.socket, { t: "accept", id: invitation.id });
  assert.ok(reply.error === "busy" || reply.error === "expired");
  assert.equal(rooms.size, 0);
});

test("an account change cannot overwrite another active match sharing the tab session", async t => {
  const server = await setup(t);
  const invitation = await server.invite();
  const previousAccount = await server.connect(ids[2], false, server.a.token);
  const opponent = await server.connect(undefined, false);
  const existing = createMatch(previousAccount.pid, opponent.pid, server.io, "matchFound");
  assert.deepEqual(await challenge(server.b.socket, { t: "accept", id: invitation.id }), { error: "busy" });
  assert.equal(rooms.size, 1);
  assert.equal(playerRoom.get(previousAccount.pid), existing);
  assert.equal(rooms.get(existing)?.accounts[previousAccount.pid]?.id, ids[2]);
});

test("requests expire after thirty seconds and cannot be accepted later", { timeout: 35000 }, async t => {
  const server = await setup(t);
  const invitation = await server.invite();
  const expired = await next(server.b.socket, "closed", 32000);
  assert.deepEqual(expired, { t: "closed", id: invitation.id, reason: "expired" });
  assert.deepEqual(await challenge(server.b.socket, { t: "accept", id: invitation.id }), { error: "expired" });
  assert.deepEqual(await challenge(server.b.socket, { t: "accept", id: randomUUID() }), { error: "expired" });
  assert.equal(rooms.size, 0);
});
