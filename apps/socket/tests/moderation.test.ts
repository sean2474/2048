import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { io as client, type Socket } from "socket.io-client";
import type { ServerMessage } from "schema/in-game";
import { createGameServer } from "../src/server";
import { createSupabaseServices } from "../src/supabase";
import { matchmakingQueue, rooms, waitingByCode } from "../src/state";

const accounts = {
  alice: { id: "10000000-0000-4000-8000-000000000001", name: "Alice" },
  bob: { id: "10000000-0000-4000-8000-000000000002", name: "Bob" },
};
const playerId = (token: string) => createHash("sha256").update(token).digest("hex");
async function eventually(check: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(check(), "Server did not reach expected state");
}
function packet(socket: Socket, predicate: (message: ServerMessage) => boolean) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off("message", handler); reject(Error("Timed out waiting for game packet")); }, 2000);
    const handler = (message: ServerMessage) => {
      if (!predicate(message)) return;
      clearTimeout(timeout); socket.off("message", handler); resolve(message);
    };
    socket.on("message", handler);
  });
}
async function setup(t: TestContext, readSuspensions: ((ids: string[]) => Promise<string[]>) | null = async () => []) {
  const server = createGameServer({
    resolveAccount: async token => accounts[token as keyof typeof accounts], readSuspensions: readSuspensions ?? undefined,
    readRating: async () => 1200, writeMatch: async () => {},
  });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];
  t.after(async () => { for (const socket of sockets) socket.disconnect(); await server.close(); });
  async function connect(account?: keyof typeof accounts, token = randomBytes(32).toString("hex")) {
    const socket = client(url, { auth: { sessionToken: token, accessToken: account }, transports: ["websocket"], reconnection: false, autoConnect: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
    return { socket, token };
  }
  return { ...server, connect };
}

test("suspended accounts cannot queue in either mode or create friend codes", async t => {
  const server = await setup(t, async () => [accounts.alice.id]), alice = await server.connect("alice");
  for (const message of [{ t: "findMatch", mode: "casual" }, { t: "findMatch", mode: "ranked" }, { t: "createRoomWithCode" }]) {
    const error = packet(alice.socket, m => m.t === "error");
    alice.socket.emit("message", message);
    assert.deepEqual(await error, { t: "error", reason: "account_suspended" });
    assert.equal(matchmakingQueue.length, 0); assert.equal(waitingByCode.size, 0);
  }
});

test("a player suspended while waiting is removed before a new opponent is paired", async t => {
  let suspended = false;
  const server = await setup(t, async ids => suspended ? ids.filter(id => id === accounts.alice.id) : []);
  const alice = await server.connect("alice"), bob = await server.connect("bob");
  alice.socket.emit("message", { t: "findMatch" });
  await eventually(() => matchmakingQueue.length === 1);
  suspended = true;
  const error = packet(alice.socket, m => m.t === "error");
  bob.socket.emit("message", { t: "findMatch" });
  assert.deepEqual(await error, { t: "error", reason: "account_suspended" });
  assert.equal(rooms.size, 0);
  assert.deepEqual(matchmakingQueue.map(entry => entry.pid), [playerId(bob.token)]);
});

test("joining a private room rechecks its host and rejects a suspended guest", async t => {
  const banned = new Set<string>();
  const server = await setup(t, async ids => ids.filter(id => banned.has(id)));
  const alice = await server.connect("alice"), bob = await server.connect("bob");
  const waiting = packet(alice.socket, m => m.t === "waitingForPlayer");
  alice.socket.emit("message", { t: "createRoomWithCode" });
  const created = await waiting;
  assert.equal(created.t, "waitingForPlayer");
  if (created.t !== "waitingForPlayer") return;
  banned.add(accounts.bob.id);
  const denied = packet(bob.socket, m => m.t === "error");
  bob.socket.emit("message", { t: "joinRoomWithCode", joinCode: created.joinCode });
  assert.deepEqual(await denied, { t: "error", reason: "account_suspended" });
  assert.equal(waitingByCode.get(created.joinCode), playerId(alice.token));
  banned.clear(); banned.add(accounts.alice.id);
  const hostDenied = packet(alice.socket, m => m.t === "error"), guestDenied = packet(bob.socket, m => m.t === "error");
  bob.socket.emit("message", { t: "joinRoomWithCode", joinCode: created.joinCode });
  assert.deepEqual(await hostDenied, { t: "error", reason: "account_suspended" });
  assert.deepEqual(await guestDenied, { t: "error", reason: "code_not_found" });
  assert.equal(waitingByCode.size, 0); assert.equal(rooms.size, 0);
});

test("status lookup failure blocks new authenticated matches but guests can play", async t => {
  const server = await setup(t, async () => { throw Error("database offline"); });
  const alice = await server.connect("alice"), guestA = await server.connect(), guestB = await server.connect();
  const denied = packet(alice.socket, m => m.t === "error");
  alice.socket.emit("message", { t: "findMatch" });
  assert.deepEqual(await denied, { t: "error", reason: "account_check_failed" });
  const found = packet(guestA.socket, m => m.t === "matchFound");
  guestA.socket.emit("message", { t: "findMatch" }); guestB.socket.emit("message", { t: "findMatch" });
  assert.equal((await found).t, "matchFound");
});

test("canceling while a status lookup runs cannot restore the canceled queue request", async t => {
  let complete: ((ids: string[]) => void) | undefined;
  const server = await setup(t, () => new Promise(resolve => { complete = resolve; }));
  const alice = await server.connect("alice");
  alice.socket.emit("message", { t: "findMatch" });
  await eventually(() => !!complete);
  alice.socket.emit("message", { t: "cancelMatch" });
  const invalid = packet(alice.socket, m => m.t === "reject");
  alice.socket.emit("message", null); await invalid;
  complete!([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(matchmakingQueue.length, 0); assert.equal(rooms.size, 0);
});

test("pairing rechecks canceled requests after the shared status lookup and never double matches", async t => {
  let holdPairs = false, complete: ((ids: string[]) => void) | undefined;
  const server = await setup(t, ids => holdPairs && ids.length === 2 ? new Promise(resolve => { complete = resolve; }) : Promise.resolve([]));
  const alice = await server.connect("alice"), bob = await server.connect("bob");
  alice.socket.emit("message", { t: "findMatch" });
  await eventually(() => matchmakingQueue.length === 1);
  holdPairs = true;
  bob.socket.emit("message", { t: "findMatch" });
  await eventually(() => !!complete);
  alice.socket.emit("message", { t: "cancelMatch" });
  const invalid = packet(alice.socket, m => m.t === "reject");
  alice.socket.emit("message", null); await invalid;
  complete!([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rooms.size, 0);
  assert.deepEqual(matchmakingQueue.map(entry => entry.pid), [playerId(bob.token)]);
});

test("suspension does not interrupt an existing match or its authenticated reconnect", async t => {
  let suspended = false;
  const server = await setup(t, async ids => suspended ? ids : []);
  const alice = await server.connect("alice"), bob = await server.connect("bob");
  const found = packet(alice.socket, m => m.t === "matchFound");
  alice.socket.emit("message", { t: "findMatch" }); bob.socket.emit("message", { t: "findMatch" });
  const matched = await found;
  if (matched.t !== "matchFound") throw Error("No room");
  const active = packet(alice.socket, m => m.t === "state" && !m.paused);
  for (const p of [alice, bob]) p.socket.emit("message", { t: "joinRoom", roomId: matched.roomId });
  await active; suspended = true;
  const paused = packet(bob.socket, m => m.t === "state" && m.paused);
  alice.socket.disconnect(); await paused;
  const restored = await server.connect("alice", alice.token);
  const resumed = packet(restored.socket, m => m.t === "state" && !m.paused);
  restored.socket.emit("message", { t: "joinRoom", roomId: matched.roomId });
  assert.equal((await resumed).t, "state");
  const ended = packet(restored.socket, m => m.t === "end");
  restored.socket.emit("message", { t: "surrender" });
  assert.equal((await ended).t, "end");
});

test("Supabase suspension status uses the private client, a bounded fetch and propagates DB errors", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let fail = false, requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    assert.equal(url.pathname, "/rest/v1/players");
    assert.equal(url.searchParams.get("select"), "id,suspended_at");
    assert.equal(new Headers(init?.headers).get("apikey"), "private-test-key");
    assert.ok(init?.signal);
    return new Response(JSON.stringify(fail ? { code: "XX000", message: "offline" } : [{ id: accounts.alice.id, suspended_at: "2026-10-15T00:00:00Z" }, { id: accounts.bob.id, suspended_at: null }]), { status: fail ? 500 : 200, headers: { "Content-Type": "application/json" } });
  };
  const services = createSupabaseServices({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-test-key", SUPABASE_SECRET_KEY: "private-test-key" });
  assert.ok(services.readSuspensions);
  assert.deepEqual(await services.readSuspensions!([]), []);
  assert.equal(requests, 0);
  assert.deepEqual(await services.readSuspensions!([accounts.alice.id, accounts.bob.id]), [accounts.alice.id]);
  assert.deepEqual(await services.readSuspensions!(["deleted-user"]), ["deleted-user"]);
  fail = true;
  await assert.rejects(services.readSuspensions!([accounts.bob.id]), /Suspension lookup failed/);
  assert.equal(createSupabaseServices({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "public-test-key" }).readSuspensions, undefined);
});


test("an authenticated player fails closed when moderation storage is not configured", async t => {
  const server = await setup(t, null), alice = await server.connect("alice");
  const denied = packet(alice.socket, m => m.t === "error");
  alice.socket.emit("message", { t: "createRoomWithCode" });
  assert.deepEqual(await denied, { t: "error", reason: "account_check_failed" });
  assert.equal(waitingByCode.size, 0);
});

test("concurrent queue changes share one pairing check and create one room", async t => {
  let complete: ((ids: string[]) => void) | undefined, pairChecks = 0;
  const server = await setup(t, ids => ids.length === 2 ? (pairChecks++, new Promise(resolve => { complete = resolve; })) : Promise.resolve([]));
  const alice = await server.connect("alice"), bob = await server.connect("bob"), guest = await server.connect();
  alice.socket.emit("message", { t: "findMatch" });
  await eventually(() => matchmakingQueue.length === 1);
  bob.socket.emit("message", { t: "findMatch" });
  await eventually(() => !!complete);
  guest.socket.emit("message", { t: "findMatch" });
  await eventually(() => matchmakingQueue.length === 3);
  const found = packet(alice.socket, m => m.t === "matchFound");
  complete!([]); await found;
  assert.equal(pairChecks, 1); assert.equal(rooms.size, 1);
  assert.deepEqual(matchmakingQueue.map(entry => entry.pid), [playerId(guest.token)]);
});

test("closing the server cancels pending checks without creating rooms later", async t => {
  let complete: ((ids: string[]) => void) | undefined;
  const server = await setup(t, () => new Promise(resolve => { complete = resolve; }));
  const alice = await server.connect("alice");
  alice.socket.emit("message", { t: "findMatch" });
  await eventually(() => !!complete);
  await server.close();
  complete!([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(matchmakingQueue.length, 0); assert.equal(rooms.size, 0);
});


test("a failed private-room account lookup reports its root cause only once", async t => {
  let fail = false;
  const server = await setup(t, async () => { if (fail) throw Error("database offline"); return []; });
  const alice = await server.connect("alice"), bob = await server.connect("bob");
  const waiting = packet(alice.socket, m => m.t === "waitingForPlayer");
  alice.socket.emit("message", { t: "createRoomWithCode" });
  const created = await waiting;
  if (created.t !== "waitingForPlayer") throw Error("No code");
  fail = true;
  const errors: ServerMessage[] = [];
  bob.socket.on("message", m => { if (m.t === "error") errors.push(m); });
  const denied = packet(bob.socket, m => m.t === "error");
  bob.socket.emit("message", { t: "joinRoomWithCode", joinCode: created.joinCode });
  assert.deepEqual(await denied, { t: "error", reason: "account_check_failed" });
  const invalid = packet(bob.socket, m => m.t === "reject");
  bob.socket.emit("message", null); await invalid;
  assert.deepEqual(errors, [{ t: "error", reason: "account_check_failed" }]);
  assert.equal(rooms.size, 0);
});
