import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createGameServer } from "../src/server";
import { ResultStore } from "../src/result-store";
import { createSupabaseServices } from "../src/supabase";
import { rooms, matchmakingQueue, playerSockets, waitingByCode } from "../src/state";
import type { Room } from "../src/types";
import type { MatchRecord } from "schema/results";

test("operations requires a fresh verified admin token; health never leaks diagnostics", async (t) => {
  let admin = true;
  let unavailable = false;
  const server = createGameServer({
    checkAdmin: async (token) => {
      if (unavailable) throw Error("DB down");
      return token === "verified" && admin;
    },
  });
  await new Promise<void>((r) => server.httpServer.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const get = (token?: string) =>
    fetch(`${base}/admin/operations`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  assert.equal((await get()).status, 401);
  assert.equal((await get("invalid")).status, 403);
  rooms.set("ready", { open: true, ready: new Set(), players: ["p1", "p2"] } as Room);
  rooms.set("playing", { open: true, ready: new Set(["p1", "p2"]), players: ["p1", "p2"] } as Room);
  rooms.set("reconnecting", {
    open: true,
    ready: new Set(["p1", "p2"]),
    players: ["p1", "p2"],
    pausedAt: Date.now(),
  } as Room);
  rooms.set("closed", { open: false, ready: new Set(), players: [] } as unknown as Room);
  matchmakingQueue.push({ pid: "p1", mode: "ranked", rating: 1200, joinedAt: Date.now() - 5000 });
  playerSockets.set("p1", "s1");
  waitingByCode.set("TEST", "p1");
  const ok = await get("verified");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const body = await ok.json();
  assert.equal(body.sessions, 1);
  assert.equal(body.storage, null);
  assert.equal(body.queues.ranked.count, 1);
  assert.ok(body.queues.ranked.oldestWaitMs >= 5000);
  assert.deepEqual(body.rooms, { ready: 1, playing: 1, reconnecting: 1 });
  assert.equal(body.queues.friend, 1);
  assert.ok(body.startedAt);
  admin = false;
  assert.equal((await get("verified")).status, 403);
  unavailable = true;
  assert.equal((await get("verified")).status, 503);
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { ok: true });
  assert.equal((await fetch(`${base}/admin/operations`, { method: "POST" })).status, 405);
});

test("outbox diagnostics distinguish remote failures, disk failure and successful recovery", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "duo-ops-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const record: MatchRecord = {
    id: randomUUID(),
    mode: "ranked",
    startedAt: "2026-10-15T00:00:00Z",
    endedAt: "2026-10-15T00:01:00Z",
    reason: "draw",
    winnerSlot: null,
    participants: [
      { userId: randomUUID(), score: 0, maxTile: 2 },
      { userId: randomUUID(), score: 0, maxTile: 2 },
    ],
  };
  let online = false;
  const store = new ResultStore(
    directory,
    async () => {
      if (!online) throw Error("offline");
    },
    () => {},
  );
  t.after(() => store.close());
  await assert.rejects(store.save(record));
  assert.equal(store.diagnostics().pendingCount, 1);
  assert.equal(store.diagnostics().blockedRankedAccounts, 2);
  assert.equal(store.diagnostics().writeErrorAt, null);
  online = true;
  await store.retryPending();
  assert.equal(store.diagnostics().pendingCount, 0);
  assert.ok(store.diagnostics().lastRemoteSuccessAt);
  const failedId = randomUUID();
  const temporary = join(directory, `${failedId}.json.tmp`);
  await mkdir(temporary);
  await assert.rejects(store.save({ ...record, id: failedId }));
  await store.save({ ...record, id: randomUUID() });
  assert.ok(
    store.diagnostics().writeErrorAt,
    "another successful write must not hide an outstanding disk failure",
  );
  await rm(temporary, { recursive: true });
  await store.retryPending();
  assert.equal(store.diagnostics().writeErrorAt, null);

  const blocked = join(directory, "blocked");
  await writeFile(blocked, "file");
  const disk = new ResultStore(
    blocked,
    async () => {},
    () => {},
  );
  t.after(() => disk.close());
  await assert.rejects(disk.save({ ...record, id: randomUUID() }));
  assert.ok(disk.diagnostics().writeErrorAt);
  assert.equal(disk.diagnostics().pendingCount, 1);
  await disk.retryPending();
  assert.ok(disk.diagnostics().readErrorAt);
  await unlink(blocked);
  await disk.retryPending();
  assert.equal(disk.diagnostics().pendingCount, 0);
  assert.equal(disk.diagnostics().writeErrorAt, null);
  assert.equal(disk.diagnostics().readErrorAt, null);
});

test("operations limits concurrent authentication attempts before calling the provider and recovers after the window", async (t) => {
  let checks = 0;
  const now = Date.now();
  let elapsed = 0;
  t.mock.method(Date, "now", () => now + elapsed);
  const server = createGameServer({
    checkAdmin: async () => {
      checks++;
      return false;
    },
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const get = () =>
    fetch(`http://127.0.0.1:${address.port}/admin/operations`, {
      headers: { Authorization: "Bearer invalid-fixture" },
    });
  const responses = await Promise.all(Array.from({ length: 30 }, get));
  assert.equal(checks, 20);
  assert.equal(responses.filter((response) => response.status === 403).length, 20);
  const limited = responses.filter((response) => response.status === 429);
  assert.equal(limited.length, 10);
  assert.ok(limited.every((response) => response.headers.get("retry-after") === "60"));
  elapsed = 60001;
  assert.equal((await get()).status, 403);
  assert.equal(checks, 21);
});

test("socket verifies user tokens through public credentials and rechecks DB role on every request", async (t) => {
  let allowed = true,
    roleError = false;
  const calls: { url: string; authorization: string | null; apikey: string | null }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get("authorization"), apikey: headers.get("apikey") });
    if (url.endsWith("/auth/v1/user"))
      return new Response(
        JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", is_anonymous: false }),
        { status: 200 },
      );
    return new Response(
      JSON.stringify(roleError ? { message: "database unavailable", code: "XX000" } : allowed),
      { status: roleError ? 500 : 200 },
    );
  });
  const services = createSupabaseServices({
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-fixture-key",
  });
  assert.equal(await services.checkAdmin!("user-token"), true);
  allowed = false;
  assert.equal(await services.checkAdmin!("user-token"), false);
  roleError = true;
  await assert.rejects(services.checkAdmin!("user-token"), /admin_verification_failed/);
  assert.equal(calls.filter((c) => c.url.endsWith("/rest/v1/rpc/is_game_admin")).length, 3);
  assert.ok(
    calls.every(
      (c) => c.authorization === "Bearer user-token" && c.apikey === "public-fixture-key",
    ),
  );
});
