import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ResultStore } from "../src/result-store";
import type { MatchRecord } from "schema/results";

const result = (): MatchRecord => ({
  id: randomUUID(), startedAt: "2026-10-15T00:00:00.000Z", endedAt: "2026-10-15T00:01:00.000Z",
  reason: "surrender", winnerSlot: 2, mode: "casual",
  participants: [{ userId: randomUUID(), score: 16, maxTile: 8 }, { userId: randomUUID(), score: 32, maxTile: 16 }],
});
test("failed results survive a restart and are removed only after remote acknowledgement", async t => {
  const directory = await mkdtemp(join(tmpdir(), "duo-results-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const record = result();
  const failed = new ResultStore(directory, async () => { throw Error("offline"); }, () => {});
  await assert.rejects(failed.save(record), /offline/);
  assert.deepEqual(JSON.parse(await readFile(join(directory, `${record.id}.json`), "utf8")), record);
  await failed.close();
  const delivered: MatchRecord[] = [];
  const restarted = new ResultStore(directory, async value => { delivered.push(value); });
  await restarted.start();
  await restarted.retryPending();
  await restarted.close();
  assert.deepEqual(delivered, [record]);
  assert.deepEqual(await readdir(directory), []);
});
test("concurrent saves of a match share the same write and reject invalid data before writing", async t => {
  const directory = await mkdtemp(join(tmpdir(), "duo-results-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const record = result();
  let writes = 0;
  const store = new ResultStore(directory, async () => { writes++; });
  await Promise.all([store.save(record), store.save(record), store.save(record)]);
  assert.equal(writes, 1);
  await assert.rejects(store.save({ ...record, id: "../escape" }));
  await assert.rejects(store.save({ ...record, participants: [{ ...record.participants[0], maxTile: 3 }, record.participants[1]] }));
  assert.deepEqual(await readdir(directory), []);
  await store.close();
});

test("ranked accounts stay blocked through failure and restart until the result is acknowledged", async t => {
  const directory = await mkdtemp(join(tmpdir(), "duo-ranked-results-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ranked = { ...result(), mode: "ranked" as const }, casual = result();
  const failed = new ResultStore(directory, async () => { throw Error("offline"); }, () => {});
  const saving = failed.save(ranked);
  for (const p of ranked.participants) assert.equal(failed.hasPendingRanked(p.userId!), true);
  await assert.rejects(saving, /offline/);
  await assert.rejects(failed.save(casual), /offline/);
  assert.equal(failed.hasPendingRanked(casual.participants[0].userId!), false);
  assert.equal(failed.hasPendingAccount(casual.participants[0].userId!), true);
  await failed.close();
  let online = false;
  const restarted = new ResultStore(directory, async () => { if (!online) throw Error("offline"); }, () => {});
  await restarted.start();
  await restarted.retryPending();
  for (const p of ranked.participants) assert.equal(restarted.hasPendingRanked(p.userId!), true);
  assert.equal(restarted.hasPendingAccount(casual.participants[0].userId!), true);
  online = true;
  await restarted.retryPending();
  for (const p of ranked.participants) assert.equal(restarted.hasPendingRanked(p.userId!), false);
  assert.equal(restarted.hasPendingAccount(casual.participants[0].userId!), false);
  await restarted.close();
});

test("a failed local write is retried after storage recovers before sending to the database", async t => {
  const parent = await mkdtemp(join(tmpdir(), "duo-storage-recovery-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const directory = join(parent, "results"), record = { ...result(), mode: "ranked" as const };
  await writeFile(directory, "temporarily unavailable directory");
  const delivered: MatchRecord[] = [];
  const store = new ResultStore(directory, async value => {
    assert.deepEqual(JSON.parse(await readFile(join(directory, `${value.id}.json`), "utf8")), value);
    delivered.push(value);
  }, () => {});
  t.after(() => store.close());
  await assert.rejects(store.save(record));
  assert.deepEqual(delivered, []);
  assert.equal(store.hasPendingRanked(record.participants[0].userId!), true);
  await rm(directory);
  await store.retryPending();
  assert.deepEqual(delivered, [record]);
  assert.equal(store.hasPendingAccount(record.participants[0].userId!), false);
  assert.deepEqual(await readdir(directory), []);
});
