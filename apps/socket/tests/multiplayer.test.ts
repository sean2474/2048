import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { io as client, type Socket } from "socket.io-client";
import { ABILITY_CHARGE, SLOW_MOVE_MS, type ServerMessage, type ServerState } from "schema/in-game";
import type { MatchRecord } from "schema/results";
import type { AbilityId, SkinId } from "schema/loadout";
import { createGameServer } from "../src/server";
import { rooms, playerRoom, disconnectTimers, waitingByCode, matchmakingQueue } from "../src/state";
import { clearDisconnect, waitForPlayer, handleInput, handleAttack, handleAbility, joinRoom, snapshot } from "../src/game";
import { matchWaitingPlayers } from "../src/matchmaking";
import { ResultStore } from "../src/result-store";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const playerId = (token: string) => createHash("sha256").update(token).digest("hex");
const accounts = {
  alice: { id: "10000000-0000-4000-8000-000000000001", name: "Alice" },
  bob: { id: "10000000-0000-4000-8000-000000000002", name: "Bob" },
  carol: { id: "10000000-0000-4000-8000-000000000003", name: "Carol" },
};
const resolveAccount = async (token: string) => {
  const account = accounts[token as keyof typeof accounts];
  if (!account) throw Error("invalid_token");
  return account;
};
async function eventually(check: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(check(), "Server did not reach expected state");
}

function packet(socket: Socket, predicate: (message: ServerMessage) => boolean) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("message", handler); reject(Error("Timed out waiting for game packet")); }, 3000);
    const handler = (message: ServerMessage) => {
      if (!predicate(message)) return;
      clearTimeout(timeout); socket.off("message", handler); resolve(message);
    };
    socket.on("message", handler);
  });
}
async function setup(t: TestContext, options: Parameters<typeof createGameServer>[0] = {}) {
  const server = createGameServer({ readSuspensions: async () => [], ...options });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await server.close(); });
  async function connect(token = randomBytes(32).toString("hex"), accessToken?: string, iconId?: unknown) {
    const socket = client(url, { auth: { sessionToken: token, accessToken, iconId }, transports: ["websocket"], reconnection: false, autoConnect: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
    return { socket, token };
  }
  async function pair(accessTokenA?: string, accessTokenB?: string, mode: "casual" | "ranked" = "casual", skins: [SkinId, SkinId] = ["classic", "classic"], abilities: [AbilityId, AbilityId] = ["clear-x", "clear-x"]) {
    const a = await connect(undefined, accessTokenA), b = await connect(undefined, accessTokenB);
    const foundA = packet(a.socket, m => m.t === "matchFound"), foundB = packet(b.socket, m => m.t === "matchFound");
    a.socket.emit("message", { t: "findMatch", mode }); b.socket.emit("message", { t: "findMatch", mode });
    const [match] = await Promise.all([foundA, foundB]);
    assert.equal(match.t, "matchFound");
    if (match.t !== "matchFound") throw Error("No match");
    const states = [a, b].map(p => packet(p.socket, m => m.t === "state" && !m.paused));
    for (const [index, p] of [a, b].entries()) p.socket.emit("message", { t: "joinRoom", roomId: match.roomId, skinId: skins[index], abilityId: abilities[index] });
    await Promise.all(states);
    return { a, b, roomId: match.roomId };
  }
  return { ...server, connect, pair };
}
test("WebSocket handshakes reject unapproved origins and allow configured origins or native clients", async t => {
  const server = await setup(t);
  const endpoint = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const allowedOrigin = process.env.CORS_ORIGINS?.split(",")[0].trim() || "http://localhost:3001";
  for (const [origin, expected] of [[allowedOrigin, true], ["https://unapproved-socket-smoke.invalid", false], [undefined, true]] as const) {
    const socket = client(endpoint, { auth: { sessionToken: randomBytes(32).toString("hex") },
      transports: ["websocket"], reconnection: false, autoConnect: false, timeout: 3000,
      ...(origin ? { extraHeaders: { Origin: origin } } : {}),
    });
    t.after(() => socket.disconnect());
    const connected = await new Promise<boolean>(resolve => {
      socket.once("connect", () => resolve(true)); socket.once("connect_error", () => resolve(false)); socket.connect();
    });
    assert.equal(connected, expected, origin ?? "Native client without an Origin header");
    socket.disconnect();
  }
});
test("private rooms, malformed messages, membership checks, surrender and replay", async t => {
  const server = await setup(t, { resolveAccount }), a = await server.connect(undefined, "alice"), b = await server.connect(), outsider = await server.connect();
  const invalid = packet(a.socket, m => m.t === "reject");
  a.socket.emit("message", null); assert.equal((await invalid).t, "reject");
  const waiting = packet(a.socket, m => m.t === "waitingForPlayer");
  a.socket.emit("message", { t: "createRoomWithCode" });
  const created = await waiting;
  if (created.t !== "waitingForPlayer") throw Error("No code");
  assert.match(created.joinCode, /^[A-Z0-9]{6}$/);
  const readyA = packet(a.socket, m => m.t === "roomReady"), readyB = packet(b.socket, m => m.t === "roomReady");
  b.socket.emit("message", { t: "joinRoomWithCode", joinCode: created.joinCode });
  const [match] = await Promise.all([readyA, readyB]);
  if (match.t !== "roomReady") throw Error("No room");
  assert.equal(waitingByCode.size, 0);
  const forbidden = packet(outsider.socket, m => m.t === "reject");
  outsider.socket.emit("message", { t: "joinRoom", roomId: match.roomId });
  assert.deepEqual(await forbidden, { t: "reject", reason: "not_in_room" });
  const active = [a, b].map(p => packet(p.socket, m => m.t === "state" && !m.paused));
  a.socket.emit("message", { t: "joinRoom", roomId: match.roomId, skinId: "kitty" });
  const invalidSkin = packet(b.socket, m => m.t === "reject");
  b.socket.emit("message", { t: "joinRoom", roomId: match.roomId, skinId: "not-a-skin" });
  assert.deepEqual(await invalidSkin, { t: "reject", reason: "invalid" });
  b.socket.emit("message", { t: "joinRoom", roomId: match.roomId, skinId: "bunny" });
  const states = await Promise.all(active) as ServerState[];
  assert.equal(states[0].mode, "friend");
  assert.equal(states[0].you.skinId, "kitty");
  assert.equal(states[0].opp?.skinId, "classic", "Guests cannot equip a custom skin through the socket");
  assert.equal(states[1].you.skinId, "classic");
  assert.equal(states[1].opp?.skinId, "kitty");
  assert.deepEqual(states[0].you.board, states[1].you.board);
  assert.equal("userId" in states[0].you, false);
  const ends = [a, b].map(p => packet(p.socket, m => m.t === "end"));
  a.socket.emit("message", { t: "surrender" });
  const [loss, win] = await Promise.all(ends);
  assert.equal(loss.t === "end" && loss.winner, "opp"); assert.equal(win.t === "end" && win.winner, "you");
  assert.equal(rooms.size, 0); assert.equal(playerRoom.size, 0); assert.equal(disconnectTimers.size, 0);
  const replay = packet(a.socket, m => m.t === "matchFound");
  a.socket.emit("message", { t: "findMatch" }); b.socket.emit("message", { t: "findMatch" });
  assert.equal((await replay).t, "matchFound");
});
for (const mode of ["casual", "ranked"] as const) test(`${mode} keeps player skins distinct through updates, reconnect and result`, async t => {
  const server = await setup(t, { resolveAccount, readRating: async () => 1200, writeMatch: async () => {} });
  const { a, b, roomId } = await server.pair("alice", "bob", mode, ["sentinel", "arcanist"]);
  const updated = [a, b].map(p => packet(p.socket, m => m.t === "state" && !m.paused));
  a.socket.emit("message", { t: "joinRoom", roomId, skinId: "kitty" });
  const [first, second] = await Promise.all(updated) as ServerState[];
  assert.deepEqual([first.you.skinId, first.opp?.skinId], ["sentinel", "arcanist"]);
  assert.deepEqual([second.you.skinId, second.opp?.skinId], ["arcanist", "sentinel"]);
  const paused = packet(b.socket, m => m.t === "state" && m.paused);
  a.socket.disconnect(); await paused;
  const restored = await server.connect(a.token, "alice");
  const resumes = [restored, b].map(p => packet(p.socket, m => m.t === "state" && !m.paused));
  restored.socket.emit("message", { t: "joinRoom", roomId, skinId: "classic" });
  const resumed = await Promise.all(resumes) as ServerState[];
  assert.deepEqual([resumed[0].you.skinId, resumed[0].opp?.skinId], ["sentinel", "arcanist"]);
  assert.deepEqual([resumed[1].you.skinId, resumed[1].opp?.skinId], ["arcanist", "sentinel"]);
  const ends = [restored, b].map(p => packet(p.socket, m => m.t === "end"));
  restored.socket.emit("message", { t: "surrender" });
  const [loss, win] = await Promise.all(ends);
  assert.deepEqual(loss.t === "end" && [loss.you.skinId, loss.opp?.skinId], ["sentinel", "arcanist"]);
  assert.deepEqual(win.t === "end" && [win.you.skinId, win.opp?.skinId], ["arcanist", "sentinel"]);
});
for (const skinId of ["dawn-oath", "rune-sanctum"] as const) test(`reward skin ${skinId} requires the server-resolved equipped skin and stays frozen`, async t => {
  const otherSkin = skinId === "dawn-oath" ? "rune-sanctum" : "dawn-oath";
  let savedSkin: SkinId = skinId;
  const server = await setup(t, { resolveAccount: async token => ({ ...await resolveAccount(token), skinId: token === "alice" ? savedSkin : otherSkin }) });
  const { a, b, roomId } = await server.pair("alice", "bob", "casual", [skinId, skinId]);
  const states = [a, b].map(player => packet(player.socket, message => message.t === "state" && !message.paused));
  a.socket.emit("message", { t: "joinRoom", roomId, skinId: otherSkin });
  const [own, opponent] = await Promise.all(states) as ServerState[];
  assert.deepEqual([own.you.skinId, own.opp?.skinId], [skinId, "classic"]);
  assert.deepEqual([opponent.you.skinId, opponent.opp?.skinId], ["classic", skinId]);
  const paused = packet(b.socket, message => message.t === "state" && message.paused);
  a.socket.disconnect(); await paused;
  savedSkin = "classic";
  const restored = await server.connect(a.token, "alice");
  const resumes = [restored, b].map(player => packet(player.socket, message => message.t === "state" && !message.paused));
  restored.socket.emit("message", { t: "joinRoom", roomId, skinId: "classic" });
  const [resumed, rival] = await Promise.all(resumes) as ServerState[];
  assert.deepEqual([resumed.you.skinId, resumed.opp?.skinId], [skinId, "classic"]);
  assert.deepEqual([rival.you.skinId, rival.opp?.skinId], ["classic", skinId]);
});
test("guests and accounts without authoritative preferences cannot request reward skins", async t => {
  const server = await setup(t, { resolveAccount });
  const { a, b, roomId } = await server.pair(undefined, "alice", "casual", ["dawn-oath", "rune-sanctum"]);
  const states = [a, b].map(player => packet(player.socket, message => message.t === "state" && !message.paused));
  a.socket.emit("message", { t: "joinRoom", roomId, skinId: "rune-sanctum" });
  for (const state of await Promise.all(states) as ServerState[]) assert.deepEqual([state.you.skinId, state.opp?.skinId], ["classic", "classic"]);
});
test("reconnect pauses both players and restores the same board without new socket loops", async t => {
  const server = await setup(t), { a, b, roomId } = await server.pair();
  const room = rooms.get(roomId)!;
  room.state[playerId(a.token)].board = [0, 1].map(col => ({ id: 300_000 + col, row: 0, col, value: 2 }));
  const update = packet(a.socket, m => m.t === "state" && !m.paused);
  a.socket.emit("message", { t: "input", dir: "left" });
  await update;
  const paused = packet(b.socket, m => m.t === "state" && m.paused);
  a.socket.disconnect();
  const state = await paused as ServerState;
  assert.ok(state.reconnectDeadline);
  const board = structuredClone(room.state[playerId(a.token)].board);
  room.state[playerId(a.token)].attacks = { xblock: 2, hardblock: 1 };
  room.state[playerId(a.token)].pending.push({ type: "addBlock", blockType: "xblock" });
  const opponentBefore = structuredClone(room.state[playerId(b.token)].board);
  handleInput(playerId(b.token), "down", server.io);
  assert.deepEqual(room.state[playerId(b.token)].board, opponentBefore);
  const restored = await server.connect(a.token);
  const resumeA = packet(restored.socket, m => m.t === "state" && !m.paused), resumeB = packet(b.socket, m => m.t === "state" && !m.paused);
  restored.socket.emit("message", { t: "joinRoom", roomId });
  const [resumed] = await Promise.all([resumeA, resumeB]) as ServerState[];
  assert.deepEqual(resumed.you.board, board);
  assert.deepEqual(resumed.you.attacks, { xblock: 2, hardblock: 1 });
  assert.equal(resumed.pendingAttacks, 1);
  assert.equal(disconnectTimers.size, 0);
  assert.equal(rooms.size, 1);
});
test("a disconnected opponent forfeits and all room state is released", async t => {
  const server = await setup(t), { a, b, roomId } = await server.pair();
  const paused = packet(b.socket, m => m.t === "state" && m.paused);
  a.socket.disconnect(); await paused;
  const room = rooms.get(roomId)!;
  const missing = room.players.find(pid => !room.ready.has(pid))!;
  clearDisconnect(missing);
  const ended = packet(b.socket, m => m.t === "end");
  waitForPlayer(missing, server.io, 25);
  const result = await ended;
  assert.equal(result.t === "end" && result.reason, "opponent_disconnected");
  assert.equal(result.t === "end" && result.winner, "you");
  assert.equal(rooms.size, 0); assert.equal(playerRoom.size, 0); assert.equal(disconnectTimers.size, 0);
});
test("a 2048 merge produces a terminal result and cannot be overwritten", async t => {
  const server = await setup(t), { a, b, roomId } = await server.pair();
  const room = rooms.get(roomId)!;
  room.state[playerId(a.token)].board = [0, 1].map(col => ({ id: 200_000 + col, row: 0, col, value: 1024 }));
  const endA = packet(a.socket, m => m.t === "end"), endB = packet(b.socket, m => m.t === "end");
  a.socket.emit("message", { t: "input", dir: "left" });
  const [result] = await Promise.all([endA, endB]);
  assert.equal(result.t === "end" && result.reason, "reached_2048");
  assert.equal(result.t === "end" && result.you.score, 2048);
  assert.equal(rooms.size, 0);
});

test("256 and 512 charge manual attacks; firing spends once and lands on the next valid move", async t => {
  const server = await setup(t), { a, b, roomId } = await server.pair();
  const room = rooms.get(roomId)!;
  room.state[playerId(a.token)].board = [128, 128, 256, 256].map((value, col) => ({ id: 400_000 + col, row: 0, col, value }));
  const before = structuredClone(room.state[playerId(b.token)].board);
  const changed = packet(a.socket, m => m.t === "state");
  a.socket.emit("message", { t: "input", dir: "left" });
  const result = await changed as ServerState;
  assert.deepEqual(result.you.attacks, { xblock: 1, hardblock: 1 });
  assert.deepEqual(room.state[playerId(b.token)].board, before);
  const warning = packet(b.socket, m => m.t === "state" && m.pendingAttacks === 1);
  a.socket.emit("message", { t: "attack", blockType: "hardblock" });
  const incoming = await warning as ServerState;
  assert.deepEqual(incoming.incomingAttacks, { xblock: 0, hardblock: 1 });
  assert.deepEqual(incoming.you.board, before);
  assert.deepEqual(room.state[playerId(a.token)].attacks, { xblock: 1, hardblock: 0 });
  const secondAttack = packet(b.socket, m => m.t === "state" && m.pendingAttacks === 2);
  a.socket.emit("message", { t: "attack", blockType: "xblock" });
  await secondAttack;
  assert.equal(room.state[playerId(a.token)].attacks.xblock, 0);
  // Invalid input must not deliver a queued attack.
  room.state[playerId(b.token)].board = [{ id: 450_000, row: 0, col: 0, value: 2 }];
  handleInput(playerId(b.token), "left", server.io);
  assert.equal(room.state[playerId(b.token)].pending.length, 2);
  const landed = packet(b.socket, m => m.t === "state" && m.pendingAttacks === 0);
  b.socket.emit("message", { t: "input", dir: "right" });
  const after = await landed as ServerState;
  assert.equal(after.you.board.filter(tile => tile.blockType === "hardblock").length, 1);
  assert.equal(after.you.board.filter(tile => tile.blockType === "xblock").length, 1);
  assert.equal(after.you.board.filter(tile => !tile.ghost).length, 4);
});

test("attack validation, full incoming queues and pauses never consume stock", async t => {
  const server = await setup(t), { a, b, roomId } = await server.pair();
  const room = rooms.get(roomId)!;
  const pid = playerId(a.token), me = room.state[pid], opponent = room.state[playerId(b.token)];
  let rejected = packet(a.socket, m => m.t === "actionRejected");
  a.socket.emit("message", { t: "attack", blockType: "xblock" });
  assert.deepEqual(await rejected, { t: "actionRejected", reason: "no_charge" });
  const invalid = packet(a.socket, m => m.t === "reject");
  a.socket.emit("message", { t: "attack", blockType: "normal", amount: 99 });
  assert.equal((await invalid).t, "reject");
  me.attacks.xblock = 3;
  opponent.pending = Array.from({ length: 6 }, () => ({ type: "addBlock", blockType: "xblock" }));
  rejected = packet(a.socket, m => m.t === "actionRejected");
  handleAttack(pid, "xblock", server.io);
  assert.deepEqual(await rejected, { t: "actionRejected", reason: "incoming_full" });
  assert.equal(me.attacks.xblock, 3);
  room.ready.delete(playerId(b.token));
  rejected = packet(a.socket, m => m.t === "actionRejected");
  handleAttack(pid, "xblock", server.io);
  assert.deepEqual(await rejected, { t: "actionRejected", reason: "paused" });
  assert.equal(me.attacks.xblock, 3);
});

test("128 and invalid moves do not charge or send attacks", async t => {
  const server = await setup(t), { a, b, roomId } = await server.pair();
  const room = rooms.get(roomId)!;
  const me = room.state[playerId(a.token)], opp = room.state[playerId(b.token)];
  me.board = [64, 64].map((value, col) => ({ id: 470_000 + col, row: 0, col, value }));
  handleInput(playerId(a.token), "left", server.io);
  assert.deepEqual(me.attacks, { xblock: 0, hardblock: 0 });
  assert.equal(opp.pending.length, 0);
  me.board = [{ id: 471_000, row: 0, col: 0, value: 2 }];
  const before = structuredClone(me.board);
  handleInput(playerId(a.token), "left", server.io);
  assert.deepEqual(me.board, before);
  assert.deepEqual(me.attacks, { xblock: 0, hardblock: 0 });
  assert.equal(opp.pending.length, 0);
});

test("ranked rejects guests and unavailable rating storage", async t => {
  const server = await setup(t, { resolveAccount });
  const guest = await server.connect(), account = await server.connect(undefined, "alice");
  const denied = packet(guest.socket, m => m.t === "error");
  guest.socket.emit("message", { t: "findMatch", mode: "ranked" });
  assert.deepEqual(await denied, { t: "error", reason: "login_required" });
  const unavailable = packet(account.socket, m => m.t === "error");
  account.socket.emit("message", { t: "findMatch", mode: "ranked" });
  assert.deepEqual(await unavailable, { t: "error", reason: "ranked_unavailable" });
  assert.equal(matchmakingQueue.length, 0);
});

test("ranked and casual queues stay separate and only ranked records carry ranked mode", async t => {
  const records: MatchRecord[] = [];
  const server = await setup(t, { resolveAccount, readRating: async () => 1200, writeMatch: async record => { records.push(record); } });
  const casual = await server.connect(undefined, "carol");
  casual.socket.emit("message", { t: "findMatch", mode: "casual" });
  await eventually(() => matchmakingQueue.length === 1);
  const { a, roomId } = await server.pair("alice", "bob", "ranked");
  assert.equal(rooms.get(roomId)?.mode, "ranked");
  assert.equal(matchmakingQueue[0].pid, playerId(casual.token));
  const ended = packet(a.socket, m => m.t === "end");
  a.socket.emit("message", { t: "surrender" });
  assert.equal((await ended).t, "end");
  await eventually(() => records.length === 1);
  assert.equal(records[0].mode, "ranked");
});

test("one account cannot queue in ranked twice and rating gaps stop at 300", async t => {
  const writer = async () => {};
  const server = await setup(t, { resolveAccount, readRating: async id => id === accounts.alice.id ? 1200 : 2100, writeMatch: writer });
  const a = await server.connect(undefined, "alice"), clone = await server.connect(undefined, "alice"), b = await server.connect(undefined, "bob");
  a.socket.emit("message", { t: "findMatch", mode: "ranked", rating: 2100 });
  await eventually(() => matchmakingQueue.length === 1);
  assert.equal(matchmakingQueue[0].rating, 1200);
  const denied = packet(clone.socket, m => m.t === "error");
  clone.socket.emit("message", { t: "findMatch", mode: "ranked" });
  assert.deepEqual(await denied, { t: "error", reason: "already_in_game" });
  b.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => matchmakingQueue.length === 2);
  assert.equal(rooms.size, 0);
  await matchWaitingPlayers(server.io, writer, Date.now() + 3_600_000, async (_players, current) => current() ? "allowed" : "stale");
  assert.equal(rooms.size, 0);
  assert.equal(matchmakingQueue.length, 2);
});

for (const gap of [151, 200, 250, 300, 301]) test(`ranked gap ${gap} respects both waits and the expansion boundary`, async t => {
  const writer = async () => {};
  const server = await setup(t, { resolveAccount, readRating: async id => id === accounts.alice.id ? 1200 : 1200 + gap, writeMatch: writer });
  const a = await server.connect(undefined, "alice"), b = await server.connect(undefined, "bob");
  a.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => matchmakingQueue.length === 1);
  b.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => matchmakingQueue.length === 2);
  const now = Date.now();
  matchmakingQueue.find(entry => entry.pid === playerId(a.token))!.joinedAt = now - 60_000;
  matchmakingQueue.find(entry => entry.pid === playerId(b.token))!.joinedAt = now;
  const access = async (_players: string[], current: () => boolean) => current() ? "allowed" as const : "stale" as const;
  await matchWaitingPlayers(server.io, writer, now, access);
  assert.equal(rooms.size, 0, "The longer wait cannot widen a new arrival's range");
  if (gap > 300) {
    await matchWaitingPlayers(server.io, writer, now + 3_600_000, access);
    assert.equal(rooms.size, 0, "The maximum gap stays capped even after an hour");
    return;
  }
  const requiredWait = Math.ceil((gap - 150) / 50) * 10_000;
  await matchWaitingPlayers(server.io, writer, now + requiredWait - 1, access);
  assert.equal(rooms.size, 0, "The range does not expand before the full interval");
  const found = packet(a.socket, message => message.t === "matchFound");
  await matchWaitingPlayers(server.io, writer, now + requiredWait, access);
  assert.equal((await found).t, "matchFound");
  assert.equal(matchmakingQueue.length, 0);
});

test("ranked players at the initial 150-point boundary can match immediately", async t => {
  const server = await setup(t, { resolveAccount, readRating: async id => id === accounts.alice.id ? 1200 : 1350, writeMatch: async () => {} });
  const { roomId } = await server.pair("alice", "bob", "ranked");
  assert.ok(rooms.has(roomId));
});

test("cancelled ranked lookup cannot requeue a player after switching to a friend room", async t => {
  let finishLookup: ((rating: number) => void) | undefined;
  let lookups = 0;
  const server = await setup(t, { resolveAccount, readRating: () => { lookups++; return new Promise(resolve => { finishLookup = resolve; }); }, writeMatch: async () => {} });
  const a = await server.connect(undefined, "alice");
  for (let i = 0; i < 10; i++) a.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => !!finishLookup);
  const room = packet(a.socket, m => m.t === "waitingForPlayer");
  a.socket.emit("message", { t: "createRoomWithCode" });
  assert.equal((await room).t, "waitingForPlayer");
  assert.equal(lookups, 1);
  finishLookup!(1200);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(matchmakingQueue.length, 0);
  assert.equal(waitingByCode.size, 1);
});
test("leaving a private lobby removes its join code", async t => {
  const server = await setup(t), a = await server.connect(), b = await server.connect();
  const created = packet(a.socket, m => m.t === "waitingForPlayer");
  a.socket.emit("message", { t: "createRoomWithCode" });
  const waiting = await created;
  if (waiting.t !== "waitingForPlayer") throw Error("No room code");
  const disconnected = new Promise<void>(resolve => server.io.of("/").sockets.get(a.socket.id!)!.once("disconnect", () => resolve()));
  a.socket.disconnect(); await disconnected;
  assert.equal(waitingByCode.size, 0);
  const rejected = packet(b.socket, m => m.t === "error");
  b.socket.emit("message", { t: "joinRoomWithCode", joinCode: waiting.joinCode });
  assert.deepEqual(await rejected, { t: "error", reason: "code_not_found" });
});

test("verified accounts survive reconnect and finished games are recorded once", async t => {
  const accounts = {
    alice: { id: "10000000-0000-4000-8000-000000000001", name: "Alice" },
    bob: { id: "10000000-0000-4000-8000-000000000002", name: "Bob" },
  };
  const records: MatchRecord[] = [];
  const server = await setup(t, {
    resolveAccount: async token => {
      if (!(token in accounts)) throw Error("invalid_token");
      return accounts[token as keyof typeof accounts];
    },
    writeMatch: async record => { records.push(record); },
  });
  await assert.rejects(server.connect(undefined, "forged"), /authentication_failed/);
  const { a, b, roomId } = await server.pair("alice", "bob");
  const paused = packet(b.socket, m => m.t === "state" && m.paused);
  a.socket.disconnect(); await paused;
  await assert.rejects(server.connect(a.token, "bob"), /authentication_failed/);
  await assert.rejects(server.connect(a.token), /authentication_failed/);
  const restored = await server.connect(a.token, "alice");
  const resumed = packet(restored.socket, m => m.t === "state" && !m.paused);
  restored.socket.emit("message", { t: "joinRoom", roomId });
  assert.deepEqual((await resumed as ServerState).names, { you: "Alice", opp: "Bob" });
  const ended = packet(restored.socket, m => m.t === "end");
  const saved = packet(restored.socket, m => m.t === "recordStatus");
  restored.socket.emit("message", { t: "surrender" });
  restored.socket.emit("message", { t: "surrender" });
  const end = await ended;
  assert.equal(end.t === "end" && end.recording, "saving");
  assert.deepEqual(await saved, { t: "recordStatus", matchId: roomId, status: "saved" });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].participants.map(p => p.userId), [accounts.alice.id, accounts.bob.id]);
  assert.equal(records[0].winnerSlot, 2);
});
test("a result write failure is reported without losing the game outcome", async t => {
  const server = await setup(t, {
    resolveAccount: async () => ({ id: "10000000-0000-4000-8000-000000000001", name: "Alice" }),
    writeMatch: async () => { throw Error("offline"); },
  });
  const { a, roomId } = await server.pair("alice");
  const ended = packet(a.socket, m => m.t === "end");
  const delayed = packet(a.socket, m => m.t === "recordStatus");
  a.socket.emit("message", { t: "surrender" });
  assert.equal((await ended).t, "end");
  assert.deepEqual(await delayed, { t: "recordStatus", matchId: roomId, status: "delayed" });
  assert.equal(rooms.size, 0);
});

test("a failed ranked result blocks requeue across sessions until retry saves Elo", async t => {
  const directory = await mkdtemp(join(tmpdir(), "duo-ranked-queue-"));
  let online = false;
  const ratingsRead: string[] = [];
  const store = new ResultStore(directory, async () => { if (!online) throw Error("offline"); }, () => {});
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  const server = await setup(t, {
    resolveAccount, writeMatch: record => store.save(record),
    readRating: async id => { ratingsRead.push(id); return 1200; },
    hasPendingRanked: id => store.hasPendingRanked(id),
  });
  const { a, b } = await server.pair("alice", "bob", "ranked");
  const delayed = packet(a.socket, m => m.t === "recordStatus" && m.status === "delayed");
  a.socket.emit("message", { t: "surrender" });
  await delayed;
  const anotherSession = await server.connect(undefined, "alice");
  for (const p of [a, b, anotherSession]) {
    const blocked = packet(p.socket, m => m.t === "error");
    p.socket.emit("message", { t: "findMatch", mode: "ranked" });
    assert.deepEqual(await blocked, { t: "error", reason: "ranked_result_pending" });
  }
  assert.equal(ratingsRead.length, 2);
  assert.equal(matchmakingQueue.length, 0);
  // Casual play remains available while ranked settlement is pending.
  const casual = packet(a.socket, m => m.t === "matchFound");
  a.socket.emit("message", { t: "findMatch", mode: "casual" });
  b.socket.emit("message", { t: "findMatch", mode: "casual" });
  assert.equal((await casual).t, "matchFound");
  online = true;
  await store.retryPending();
  anotherSession.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => matchmakingQueue.some(entry => entry.pid === playerId(anotherSession.token)));
  assert.equal(ratingsRead.length, 3);
});

test("server telemetry measures valid moves, actual charges, sent and landed attacks, including guest games", async t => {
  const records: MatchRecord[] = [];
  const server = await setup(t, { writeMatch: async record => { records.push(record); } });
  const { a, b, roomId } = await server.pair();
  const room = rooms.get(roomId)!;
  const me = room.state[playerId(a.token)], opponent = room.state[playerId(b.token)];
  me.board = [128, 128, 256, 256].map((value, col) => ({ id: 700_000 + col, row: 0, col, value }));
  me.attacks = { xblock: 2, hardblock: 3 };
  handleInput(playerId(a.token), "left", server.io);
  assert.deepEqual(me.telemetry.charged, { xblock: 1, hardblock: 0 });
  assert.equal(me.telemetry.moves, 1);
  handleAttack(playerId(a.token), "xblock", server.io);
  handleAttack(playerId(a.token), "hardblock", server.io);
  assert.deepEqual(me.telemetry.sent, { xblock: 1, hardblock: 1 });
  assert.deepEqual(opponent.telemetry.received, { xblock: 0, hardblock: 0 });
  opponent.board = [{ id: 710_000, row: 0, col: 0, value: 2 }];
  handleInput(playerId(b.token), "left", server.io);
  assert.equal(opponent.telemetry.moves, 0);
  handleInput(playerId(b.token), "right", server.io);
  assert.deepEqual(opponent.telemetry.received, { xblock: 1, hardblock: 1 });
  const ended = packet(a.socket, message => message.t === "end");
  a.socket.emit("message", { t: "surrender" });
  await ended;
  await eventually(() => records.length === 1);
  assert.deepEqual(records[0].participants.map(p => p.userId), [null, null]);
  assert.deepEqual(records[0].participants[0].telemetry, me.telemetry);
  assert.deepEqual(records[0].participants[1].telemetry, opponent.telemetry);
});

test("six saved attacks can fire without moving and a full queue preserves further tickets", async t => {
  const server = await setup(t), { a, b, roomId } = await server.pair();
  const room = rooms.get(roomId)!;
  const me = room.state[playerId(a.token)], opponent = room.state[playerId(b.token)];
  me.attacks = { xblock: 3, hardblock: 3 };
  const before = structuredClone(me.board);
  const incoming = packet(b.socket, m => m.t === "state" && m.pendingAttacks === 6);
  for (const blockType of ["xblock", "hardblock", "xblock", "hardblock", "xblock", "hardblock"] as const) {
    a.socket.emit("message", { t: "attack", blockType });
  }
  const state = await incoming as ServerState;
  assert.deepEqual(state.incomingAttacks, { xblock: 3, hardblock: 3 });
  assert.deepEqual(me.attacks, { xblock: 0, hardblock: 0 });
  assert.deepEqual(me.telemetry.sent, { xblock: 3, hardblock: 3 });
  assert.deepEqual(me.board, before);
  const empty = packet(a.socket, m => m.t === "actionRejected");
  a.socket.emit("message", { t: "attack", blockType: "xblock" });
  assert.deepEqual(await empty, { t: "actionRejected", reason: "no_charge" });
  me.attacks.xblock = 1;
  const full = packet(a.socket, m => m.t === "actionRejected");
  a.socket.emit("message", { t: "attack", blockType: "xblock" });
  assert.deepEqual(await full, { t: "actionRejected", reason: "incoming_full" });
  assert.equal(me.attacks.xblock, 1);
  assert.equal(opponent.pending.length, 6);
  opponent.board = [{ id: 820_000, row: 0, col: 0, value: 2 }];
  handleInput(playerId(b.token), "right", server.io);
  assert.equal(opponent.pending.length, 0);
  assert.equal(opponent.board.filter(tile => tile.blockType === "xblock").length, 3);
  assert.equal(opponent.board.filter(tile => tile.blockType === "hardblock").length, 3);
  handleAttack(playerId(a.token), "xblock", server.io);
  assert.equal(me.attacks.xblock, 0);
  assert.equal(opponent.pending.length, 1);
});


test("match intro shares only public profiles and uses verified icons and current ranked ratings", async t => {
  const server = await setup(t, {
    resolveAccount: async token => ({ ...await resolveAccount(token), iconId: token === "alice" ? "dragon" : "owl", rating: 999 }),
    readRating: async id => ({ rating: id === accounts.alice.id ? 1460 : 1500, rank: { tier: "Platinum", placement_games: 10 } }),
    writeMatch: async () => {},
  });
  const a = await server.connect(undefined, "alice", "robot"), b = await server.connect(undefined, "bob", "cat");
  const foundA = packet(a.socket, m => m.t === "matchFound"), foundB = packet(b.socket, m => m.t === "matchFound");
  for (const player of [a, b]) player.socket.emit("message", { t: "findMatch", mode: "ranked" });
  const [first, second] = await Promise.all([foundA, foundB]);
  if (first.t !== "matchFound" || second.t !== "matchFound") throw Error("No match");
  assert.equal(first.mode, "ranked");
  const rank = { tier: "Platinum", placement_games: 10 };
  assert.deepEqual(first.players, { you: { name: "Alice", iconId: "dragon", rating: 1460, rank }, opp: { name: "Bob", iconId: "owl", rating: 1500, rank } });
  assert.deepEqual(second.players, { you: first.players.opp, opp: first.players.you });
  assert.equal(JSON.stringify(first).includes(accounts.alice.id), false);
  const room = rooms.get(first.roomId)!;
  const before = structuredClone(room.state[playerId(a.token)].board);
  a.socket.emit("message", { t: "joinRoom", roomId: first.roomId });
  await eventually(() => room.ready.size === 1);
  handleInput(playerId(a.token), "down", server.io);
  assert.deepEqual(room.state[playerId(a.token)].board, before, "Skipping the intro cannot start play before the opponent joins");
});

test("waiting players refresh lifetime Elo after a late result without resetting placement", async t => {
  let settled = false;
  const rank = { tier: "Diamond" as const, placement_games: 10 };
  const server = await setup(t, {
    resolveAccount,
    readRating: async () => ({ rating: settled ? 1784 : 1800, rank: settled ? rank : { ...rank, tier: "Master" } }),
    writeMatch: async () => {},
  });
  const a = await server.connect(undefined, "alice");
  a.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => matchmakingQueue.length === 1);
  settled = true;
  const b = await server.connect(undefined, "bob");
  const found = packet(a.socket, message => message.t === "matchFound");
  b.socket.emit("message", { t: "findMatch", mode: "ranked" });
  const match = await found; if (match.t !== "matchFound") throw Error("No match");
  assert.deepEqual(match.players.you.rank, rank); assert.equal(match.players.you.rating, 1784);
  assert.deepEqual(match.players.opp.rank, rank);
});

for (const action of ["cancel", "close"] as const) test(`rank refresh preserves ${action} while database lookup is pending`, async t => {
  const rank = { tier: null, placement_games: 0 };
  let reads = 0;
  const pending: Array<(value: { rating: number; rank: typeof rank }) => void> = [];
  const server = await setup(t, { resolveAccount, writeMatch: async () => {}, readRating: async () => {
    if (++reads <= 2) return { rating: 1200, rank };
    return new Promise(resolve => pending.push(resolve));
  } });
  const a = await server.connect(undefined, "alice"), b = await server.connect(undefined, "bob");
  for (const player of [a, b]) player.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => pending.length === 2);
  if (action === "close") await server.close();
  else { a.socket.emit("message", { t: "cancelMatch" }); await eventually(() => matchmakingQueue.length === 1); }
  for (const resolve of pending) resolve({ rating: 1200, rank });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rooms.size, 0);
  assert.equal(matchmakingQueue.some(entry => entry.pid === playerId(a.token)), false);
});

test("new casual arrivals can match while ranked rating refresh is waiting on the database", async t => {
  const rank = { tier: null, placement_games: 0 };
  let reads = 0;
  const pending: Array<(value: { rating: number; rank: typeof rank }) => void> = [];
  const server = await setup(t, { resolveAccount, writeMatch: async () => {}, readRating: async () => {
    if (++reads <= 2) return { rating: 1200, rank };
    return new Promise(resolve => pending.push(resolve));
  } });
  const a = await server.connect(undefined, "alice"), b = await server.connect(undefined, "bob");
  for (const player of [a, b]) player.socket.emit("message", { t: "findMatch", mode: "ranked" });
  await eventually(() => pending.length === 2);
  const guest = await server.connect();
  guest.socket.emit("message", { t: "findMatch", mode: "casual" });
  await eventually(() => matchmakingQueue.some(entry => entry.pid === playerId(guest.token)));
  const laterGuest = await server.connect();
  const found = packet(guest.socket, message => message.t === "matchFound");
  laterGuest.socket.emit("message", { t: "findMatch", mode: "casual" });
  const match = await found; if (match.t !== "matchFound") throw Error("No match");
  assert.equal(match.mode, "casual"); assert.equal(rooms.size, 1);
  assert.equal(matchmakingQueue.filter(entry => entry.mode === "ranked").length, 2);
  for (const resolve of pending) resolve({ rating: 1200, rank });
  await eventually(() => rooms.size === 2);
});

test("guest match intro ignores claimed catalog icons and always uses the guest icon", async t => {
  const server = await setup(t);
  const a = await server.connect(undefined, undefined, "rabbit"), b = await server.connect(undefined, undefined, "https://untrusted.example/avatar.svg");
  const found = packet(a.socket, m => m.t === "matchFound");
  for (const player of [a, b]) player.socket.emit("message", { t: "findMatch" });
  const message = await found;
  if (message.t !== "matchFound") throw Error("No match");
  assert.deepEqual(message.players, { you: { name: "Guest", iconId: "guest", rating: null }, opp: { name: "Guest", iconId: "guest", rating: null } });
});

test("ability selection is frozen, guests use Clear X, and socket validation rejects forged ability actions", async t => {
  const server = await setup(t, { resolveAccount });
  const { a, b, roomId } = await server.pair("alice", undefined, "casual", undefined, ["swap-32", "anchor-tile"]);
  const room = rooms.get(roomId)!, pid = playerId(a.token), other = playerId(b.token);
  assert.equal(room.state[pid].ability.id, "swap-32");
  assert.equal(room.state[other].ability.id, "clear-x");
  joinRoom(pid, roomId, server.io, "classic", "clear-x");
  assert.equal(room.state[pid].ability.id, "swap-32");
  for (const message of [{ t: "ability", charge: 1024 }, { t: "ability", target: other }, { t: "joinRoom", roomId, abilityId: "shield" }]) {
    const rejected = packet(a.socket, m => m.t === "reject");
    a.socket.emit("message", message);
    assert.deepEqual(await rejected, { t: "reject", reason: "invalid" });
  }
  const uncharged = packet(a.socket, m => m.t === "actionRejected");
  a.socket.emit("message", { t: "ability" });
  assert.deepEqual(await uncharged, { t: "actionRejected", reason: "ability_not_ready" });
});

test("ability charge comes only from merges, caps at one use, and Clear X removes exactly one oldest obstacle", async t => {
  const server = await setup(t), { a, roomId } = await server.pair();
  const room = rooms.get(roomId)!, pid = playerId(a.token), me = room.state[pid];
  me.board = [0, 1].map(col => ({ id: 800_000 + col, row: 0, col, value: 512 }));
  handleInput(pid, "left", server.io);
  assert.equal(me.ability.charge, ABILITY_CHARGE);
  const noTarget = packet(a.socket, m => m.t === "actionRejected");
  a.socket.emit("message", { t: "ability" });
  assert.equal((await noTarget).t, "actionRejected");
  assert.equal(me.ability.charge, ABILITY_CHARGE);
  me.board.push({ id: 900_001, row: 2, col: 2, value: -1, blockType: "xblock" }, { id: 900_000, row: 2, col: 3, value: -1, blockType: "xblock" }, { id: 900_002, row: 3, col: 3, value: -2, blockType: "hardblock" });
  me.pending.push({ type: "addBlock", blockType: "xblock" });
  const board = structuredClone(me.board), score = me.score, attacks = { ...me.attacks };
  const used = packet(a.socket, m => m.t === "state" && m.you.ability.charge === 0);
  a.socket.emit("message", { t: "ability" });
  await used;
  assert.deepEqual(me.board, board.filter(tile => tile.id !== 900_000));
  assert.equal(me.score, score);
  assert.deepEqual(me.attacks, attacks);
  assert.equal(me.pending.length, 1);
  handleAbility(pid, server.io);
  assert.equal(me.board.filter(tile => tile.blockType === "xblock").length, 1);
  me.ability.charge = 1020;
  me.board = [{ id: 810_001, row: 0, col: 0, value: 4 }, { id: 810_002, row: 0, col: 1, value: 4 }];
  handleInput(pid, "left", server.io);
  assert.equal(me.ability.charge, ABILITY_CHARGE);
  me.ability.charge = 0;
  me.board = [{ id: 810_003, row: 0, col: 0, value: 2 }];
  handleInput(pid, "left", server.io);
  handleInput(pid, "down", server.io);
  assert.equal(me.ability.charge, 0);
});

for (const abilityId of ["spawn-pause", "anchor-tile"] as const) test(`${abilityId} lasts exactly three valid moves and survives a paused reconnect`, async t => {
  const server = await setup(t, { resolveAccount }), { a, b, roomId } = await server.pair("alice", "bob", "casual", undefined, [abilityId, "clear-x"]);
  const room = rooms.get(roomId)!, pid = playerId(a.token), other = playerId(b.token), me = room.state[pid];
  me.board = [{ id: 910_000, row: 0, col: 0, value: 64 }, { id: 910_001, row: 0, col: 1, value: 16 }];
  me.ability.charge = ABILITY_CHARGE;
  handleAbility(pid, server.io);
  const key = abilityId === "spawn-pause" ? "spawnPauseMoves" : "anchorMoves";
  assert.equal(me.ability[key], 3);
  const before = structuredClone(me.board);
  handleInput(pid, "left", server.io);
  assert.deepEqual(me.board, before);
  assert.equal(me.ability[key], 3);
  waitForPlayer(other, server.io);
  handleInput(pid, "down", server.io);
  me.ability.charge = ABILITY_CHARGE;
  handleAbility(pid, server.io);
  assert.equal(me.ability.charge, ABILITY_CHARGE);
  assert.equal(me.ability[key], 3);
  joinRoom(other, roomId, server.io, "classic", "swap-32");
  assert.equal(room.state[other].ability.id, "clear-x");
  handleAbility(pid, server.io);
  assert.equal(me.ability.charge, ABILITY_CHARGE, "An active effect cannot stack or consume a charge");
  for (const dir of ["down", "up", "down"] as const) handleInput(pid, dir, server.io);
  assert.equal(me.ability[key], 0);
  if (abilityId === "spawn-pause") assert.equal(me.board.filter(tile => !tile.ghost).length, 2);
  else assert.equal(me.board.some(tile => tile.anchored), false);
  const state = snapshot(room, pid) as ServerState;
  assert.equal(state.you.ability.id, abilityId);
  assert.equal(state.you.ability[key], 0);
});

test("slowdown gives a warning, limits server moves but not attacks, expires, and freezes during reconnect", async t => {
  const server = await setup(t, { resolveAccount }), { a, b, roomId } = await server.pair("alice", "bob", "casual", undefined, ["frost-wave", "clear-x"]);
  const room = rooms.get(roomId)!, pid = playerId(a.token), other = playerId(b.token), me = room.state[pid], opp = room.state[other];
  opp.board = [{ id: 915_000, row: 0, col: 0, value: 2 }];
  me.ability.charge = ABILITY_CHARGE;
  handleAbility(pid, server.io);
  assert.equal(opp.ability.slowEndsAt - opp.ability.slowStartsAt, 3000);
  assert.ok(opp.ability.slowStartsAt > Date.now());
  const moves = opp.telemetry.moves;
  handleInput(other, "down", server.io);
  assert.equal(opp.telemetry.moves, moves + 1, "The warning must not slow movement");
  opp.ability.slowStartsAt = Date.now() - 1;
  opp.ability.nextMoveAt = Date.now() + SLOW_MOVE_MS;
  const before = structuredClone(opp.board);
  handleInput(other, "up", server.io);
  assert.deepEqual(opp.board, before);
  opp.attacks.xblock = 1;
  handleAttack(other, "xblock", server.io);
  assert.equal(opp.attacks.xblock, 0);
  waitForPlayer(pid, server.io);
  room.pausedAt = Date.now() - 4000;
  const endsAt = opp.ability.slowEndsAt;
  const paused = snapshot(room, other) as ServerState;
  assert.equal(paused.serverTime, room.pausedAt);
  joinRoom(pid, roomId, server.io);
  assert.ok(opp.ability.slowEndsAt >= endsAt + 4000);
  assert.equal(me.ability.id, "frost-wave");
  opp.ability.slowEndsAt = Date.now() - 1;
  handleInput(other, "up", server.io);
  assert.notDeepEqual(opp.board, before, "Expired slowdown must allow movement even if nextMoveAt is later");
});

test("32 swap exchanges only valid opponent tiles, preserves scores, and cannot move an anchored tile", async t => {
  const server = await setup(t, { resolveAccount }), { a, b, roomId } = await server.pair("alice", "bob", "casual", undefined, ["swap-32", "anchor-tile"]);
  const room = rooms.get(roomId)!, pid = playerId(a.token), me = room.state[pid], opp = room.state[playerId(b.token)];
  opp.board = [{ id: 920_000, row: 0, col: 0, value: 32, anchored: true }, { id: 920_001, row: 1, col: 1, value: 8 }, { id: 920_002, row: 3, col: 3, value: 128 }];
  me.ability.charge = ABILITY_CHARGE;
  handleAbility(pid, server.io);
  assert.equal(me.ability.charge, ABILITY_CHARGE);
  opp.board[0].anchored = false;
  const score = opp.score, ownBoard = structuredClone(me.board);
  handleAbility(pid, server.io);
  assert.equal(me.ability.charge, 0);
  assert.equal(opp.score, score);
  assert.deepEqual(me.board, ownBoard);
  assert.deepEqual(opp.board.map(tile => [tile.value, tile.row, tile.col]), [[32, 1, 1], [8, 0, 0], [128, 3, 3]]);
});
