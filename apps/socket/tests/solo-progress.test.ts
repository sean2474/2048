import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PGlite } from "@electric-sql/pglite";
import {
  SoloCheckpointSchema,
  SOLO_LIMIT_MS,
  type SoloCheckpoint,
  type SoloState,
} from "schema/solo";
import { createSoloService, createSoloRun, advanceSolo, type SoloProgressStore } from "../src/solo";

function storage() {
  const rows = new Map<string, SoloCheckpoint>();
  let writes = 0,
    failRead = false,
    failWrite = false;
  const store: SoloProgressStore = {
    async read(key) {
      if (failRead) throw Error("offline");
      return structuredClone(rows.get(key) ?? null);
    },
    async write(key, _player, value) {
      writes++;
      if (failWrite) throw Error("offline");
      rows.set(key, structuredClone(SoloCheckpointSchema.parse(value)));
    },
  };
  return {
    rows,
    store,
    get writes() {
      return writes;
    },
    set failRead(value: boolean) {
      failRead = value;
    },
    set failWrite(value: boolean) {
      failWrite = value;
    },
  };
}
const options = (soloProgress: SoloProgressStore) => ({
  soloProgress,
  writeSolo: async () => {},
  readSuspensions: async () => [],
});
const board = (state: SoloState) =>
  state.board.filter((tile) => !tile.ghost).map(({ value, row, col }) => ({ value, row, col }));
const canStart = () => true;

test("account progress survives shutdown and another device, without inheriting another account's board", async (t) => {
  const db = storage();
  const first = createSoloService(options(db.store));
  t.after(() => first.close());
  const start = (await first.handle("tab", "alice", { t: "start", mode: "endless" }, canStart))
    .state!;
  let state = start;
  for (const dir of ["left", "down", "right", "up"])
    state = (
      await first.handle(
        "tab",
        "alice",
        { t: "move", id: start.id, seq: state.seq + 1, dir },
        canStart,
      )
    ).state!;
  assert.equal(db.writes, 1, "moves do not write to the database");
  await first.close();
  const second = createSoloService(options(db.store));
  t.after(() => second.close());
  const resumed = (await second.handle("other-device", "alice", { t: "state" }, canStart)).state!;
  assert.equal(resumed.id, state.id);
  assert.deepEqual(board(resumed), board(state));
  assert.equal(resumed.score, state.score);
  assert.equal(resumed.moves, state.moves);
  assert.equal(resumed.seq, state.seq);
  assert.equal(resumed.progress, "saved");
  assert.ok(resumed.elapsedMs >= state.elapsedMs);
  const moved = (
    await second.handle(
      "other-device",
      "alice",
      { t: "move", id: resumed.id, seq: resumed.seq + 1, dir: "left" },
      canStart,
    )
  ).state!;
  assert.equal(
    new Set(moved.board.map((tile) => tile.id)).size,
    moved.board.length,
    "restored IDs do not collide with spawns",
  );
  assert.equal((await second.handle("other-device", "bob", { t: "state" }, canStart)).state, null);
});

test("guest capability resumes across tabs, stays private, and cannot become ranked account progress", async (t) => {
  const db = storage(),
    service = createSoloService(options(db.store));
  t.after(() => service.close());
  const start = (
    await service.handle("tab-a", null, { t: "start", mode: "endless" }, canStart, "secret-a")
  ).state!;
  const moved = (
    await service.handle(
      "tab-a",
      null,
      { t: "move", id: start.id, seq: 1, dir: "left" },
      canStart,
      "secret-a",
    )
  ).state!;
  await service.disconnect("tab-a", null, "secret-a");
  const restored = createSoloService(options(db.store));
  t.after(() => restored.close());
  assert.deepEqual(
    board((await restored.handle("tab-b", null, { t: "state" }, canStart, "secret-a")).state!),
    board(moved),
  );
  assert.equal(
    (await restored.handle("tab-c", null, { t: "state" }, canStart, "secret-b")).state,
    null,
  );
  assert.equal(
    (await restored.handle("tab-d", "alice", { t: "state" }, canStart, "secret-a")).state,
    null,
  );
});

test("autosave batches dirty moves every ten seconds and does not write idle snapshots", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const db = storage(),
    service = createSoloService(options(db.store));
  t.after(() => service.close());
  const run = (await service.handle("tab", null, { t: "start", mode: "endless" }, canStart)).state!;
  await service.handle("tab", null, { t: "move", id: run.id, seq: 1, dir: "left" }, canStart);
  await service.handle("tab", null, { t: "state" }, canStart);
  t.mock.timers.tick(9999);
  await setImmediate();
  assert.equal(db.writes, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(db.writes, 2);
  t.mock.timers.tick(30_000);
  await setImmediate();
  assert.equal(db.writes, 2);
  assert.equal(db.rows.get("guest:tab")!.state.seq, 1);
});

test("read errors never replace a saved game and write errors retain the current board for retry", async (t) => {
  const db = storage(),
    service = createSoloService(options(db.store));
  t.after(() => service.close());
  db.failRead = true;
  assert.equal(
    (await service.handle("tab", null, { t: "start", mode: "endless" }, canStart)).error,
    "solo_unavailable",
  );
  assert.equal(db.writes, 0);
  db.failRead = false;
  const run = (await service.handle("tab", null, { t: "start", mode: "endless" }, canStart)).state!;
  const moved = (
    await service.handle("tab", null, { t: "move", id: run.id, seq: 1, dir: "down" }, canStart)
  ).state!;
  db.failWrite = true;
  assert.equal(
    (await service.handle("tab", null, { t: "save", id: run.id }, canStart)).state!.progress,
    "error",
  );
  db.failWrite = false;
  const retry = (await service.handle("tab", null, { t: "save", id: run.id }, canStart)).state!;
  assert.equal(retry.progress, "saved");
  assert.deepEqual(board(retry), board(moved));
  assert.equal(db.rows.get("guest:tab")!.state.seq, 1);
  const corrupt = structuredClone(db.rows.get("guest:tab")!);
  corrupt.state.board = corrupt.state.board.map((tile) => ({ ...tile, ghost: true }));
  db.rows.set("guest:corrupt", corrupt);
  const writes = db.writes;
  assert.equal(
    (await service.handle("corrupt", null, { t: "start", mode: "endless" }, canStart)).error,
    "solo_unavailable",
  );
  assert.equal(db.writes, writes, "invalid saved data is never silently overwritten");
});

test("a background tab resumes after its inactive in-memory game has been evicted", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let clock = 0;
  t.mock.method(performance, "now", () => clock);
  const db = storage(),
    service = createSoloService(options(db.store));
  t.after(() => service.close());
  const run = (await service.handle("tab", null, { t: "start", mode: "endless" }, canStart)).state!;
  clock = SOLO_LIMIT_MS + 600_001;
  t.mock.timers.tick(10_000);
  await setImmediate();
  const resumed = (await service.handle("tab", null, { t: "state" }, canStart)).state!;
  assert.equal(resumed.id, run.id);
  assert.equal(resumed.progress, "saved");
});

test("moves arriving during a checkpoint are not lost and new runs cannot be overwritten by an old save", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const db = storage();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  const service = createSoloService(
    options({
      ...db.store,
      async write(...args) {
        if (++writes === 2) await blocked;
        await db.store.write(...args);
      },
    }),
  );
  t.after(() => service.close());
  const run = (await service.handle("a", null, { t: "start", mode: "endless" }, canStart)).state!;
  await service.handle("a", null, { t: "move", id: run.id, seq: 1, dir: "left" }, canStart);
  t.mock.timers.tick(10_000);
  await setImmediate();
  await service.handle("a", null, { t: "move", id: run.id, seq: 2, dir: "down" }, canStart);
  release();
  await setImmediate();
  assert.equal(
    (await service.handle("a", null, { t: "state" }, canStart)).state!.progress,
    "pending",
  );
  await service.disconnect("a");
  assert.equal(db.rows.get("guest:a")!.state.seq, 2);
  const next = (await service.handle("a", null, { t: "start", mode: "endless" }, canStart)).state!;
  assert.equal(db.rows.get("guest:a")!.state.id, next.id);
  assert.equal(
    (await service.handle("a", null, { t: "move", id: run.id, seq: 3, dir: "left" }, canStart))
      .error,
    "run_expired",
  );
});

test("restored time attack includes offline time and restores a pending finish for an idempotent reward retry", async (t) => {
  const db = storage();
  const run = createSoloRun("alice", 0, "time-attack");
  const { progress: _, ...state } = run.state;
  db.rows.set("account:alice", {
    version: 1,
    startedAt: Date.now() - SOLO_LIMIT_MS - 1,
    savedTile: 0,
    state,
  });
  const expired = createSoloService(options(db.store));
  t.after(() => expired.close());
  assert.equal(
    (await expired.handle("tab", "alice", { t: "state" }, canStart)).state!.status,
    "expired",
  );
  await expired.close();
  run.state.board = [
    { id: 1, value: 1024, row: 0, col: 0 },
    { id: 2, value: 1024, row: 0, col: 1 },
  ];
  advanceSolo(run, "left", 120_000, () => 0);
  const { progress: ignored, ...finished } = run.state;
  db.rows.set("account:alice", {
    version: 1,
    startedAt: Date.now() - 120_000,
    savedTile: 0,
    state: finished,
  });
  let awards = 0;
  const restored = createSoloService({
    ...options(db.store),
    writeSolo: async (record) => {
      awards++;
      assert.equal(record.elapsedMs, 120_000);
    },
  });
  t.after(() => restored.close());
  assert.equal(
    (await restored.handle("new-tab", "alice", { t: "state" }, canStart)).state!.saving,
    "saved",
  );
  await restored.handle("new-tab", "alice", { t: "save", id: run.state.id }, canStart);
  assert.equal(awards, 1);
  assert.equal(db.rows.get("account:alice")!.savedTile, 2048);
});

test("database protects authoritative boards, validates ownership, and deletes account progress with the player", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create table public.players(id uuid primary key);",
  );
  await db.exec(
    await readFile(
      new URL("../../../supabase/migrations/20261017093226_solo_progress.sql", import.meta.url),
      "utf8",
    ),
  );
  const id = randomUUID();
  await db.query("insert into players values($1)", [id]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from solo_progress"), /permission denied/);
    await assert.rejects(
      db.query("insert into solo_progress(owner_key,checkpoint) values($1,'{}')", [
        `guest:${"a".repeat(64)}`,
      ]),
      /permission denied/,
    );
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await db.query("insert into solo_progress(owner_key,player_id,checkpoint) values($1,$2,'{}')", [
    `account:${id}`,
    id,
  ]);
  await assert.rejects(
    db.query("insert into solo_progress(owner_key,player_id,checkpoint) values($1,$2,'{}')", [
      `account:${randomUUID()}`,
      id,
    ]),
    /check constraint/,
  );
  assert.equal((await db.query("select * from solo_progress")).rows.length, 1);
  await db.exec("reset role");
  await db.query("delete from players where id=$1", [id]);
  assert.equal((await db.query("select * from solo_progress")).rows.length, 0);
});
