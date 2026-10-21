import { test } from "node:test";
import assert from "node:assert/strict";
import { ABILITIES } from "schema/loadout";
import { consumedAbility, boardEffects, type EffectPlayers } from "../../web/src/lib/board-effects";

test("ability effects require confirmed charge consumption of the same equipped ability", () => {
  for (const { id } of ABILITIES) {
    const ready = { id, charge: 1024 },
      used = { id, charge: 0 };
    assert.equal(consumedAbility(ready, used), id);
    assert.equal(
      consumedAbility(undefined, used),
      null,
      "initial and reconnect snapshots cannot replay a cast",
    );
    assert.equal(consumedAbility(ready, undefined), null);
    assert.equal(consumedAbility(ready, ready), null, "rejected requests keep their charge");
    assert.equal(consumedAbility(used, used), null, "later state packets cannot repeat the effect");
    assert.equal(consumedAbility(used, ready), null, "charging is not a cast");
    assert.equal(consumedAbility({ id, charge: 1023 }, used), null);
    assert.equal(consumedAbility(ready, { ...used, charge: 1 }), null);
    assert.equal(
      consumedAbility(ready, { id: id === "clear-x" ? "frost-wave" : "clear-x", charge: 0 }),
      null,
    );
  }
});

const players = (): EffectPlayers => ({
  you: {
    score: 256,
    attacksSent: { xblock: 2, hardblock: 2 },
    board: [{ id: 1, row: 0, col: 0, value: 2 }],
  },
  opp: {
    score: 0,
    attacksSent: { xblock: 1, hardblock: 1 },
    board: [{ id: 2, row: 0, col: 0, value: 4 }],
  },
});

test("accepted attacks create sent and queued effects on their correct boards for both players", () => {
  for (const owner of ["you", "opp"] as const)
    for (const id of ["xblock", "hardblock"] as const) {
      const previous = players(),
        current = structuredClone(previous);
      current[owner]!.attacksSent[id] += 5;
      assert.deepEqual(boardEffects(previous, current, owner), [
        { kind: "attack", id, phase: "sent", owner },
      ]);
      assert.deepEqual(boardEffects(previous, current, owner === "you" ? "opp" : "you"), [
        { kind: "attack", id, phase: "incoming", owner },
      ]);
    }
});

test("attack effects ignore counter resets, unchanged state, initial and resumed snapshots", () => {
  const previous = players(),
    current = players();
  current.you!.attacksSent.xblock--;
  assert.deepEqual(boardEffects(previous, current, "you"), []);
  assert.deepEqual(boardEffects(previous, previous, "you"), []);
  current.you!.attacksSent = { xblock: 0, hardblock: 0 };
  current.you!.board.push({ id: 3, row: 1, col: 1, value: -1, blockType: "xblock", spawned: true });
  assert.deepEqual(boardEffects(undefined, current, "you"), []);
  assert.deepEqual(boardEffects(current, current, "you"), []);
  assert.deepEqual(
    boardEffects({ you: previous.you }, { you: previous.you, opp: current.you }, "opp"),
    [],
  );
  current.you!.score = 0;
  current.you!.board = previous.you!.board;
  assert.deepEqual(
    boardEffects(previous, current, "you"),
    [],
    "restarting a tutorial resets counters without firing",
  );
});

test("only newly landed live blocks cause impacts, including mixed volleys", () => {
  const previous = players(),
    current = players();
  current.opp!.board.push(
    { id: 3, row: 1, col: 1, value: -1, blockType: "xblock", spawned: true },
    { id: 4, row: 1, col: 2, value: -2, blockType: "hardblock", spawned: true },
    { id: 5, row: 1, col: 3, value: -1, blockType: "xblock", spawned: true },
    { id: 6, row: 1, col: 4, value: -2, blockType: "hardblock", spawned: true, ghost: true },
  );
  assert.deepEqual(boardEffects(previous, current, "opp"), [
    { kind: "attack", id: "xblock", phase: "landed", owner: "you" },
    { kind: "attack", id: "hardblock", phase: "landed", owner: "you" },
  ]);
  assert.deepEqual(boardEffects(previous, current, "you"), []);
  assert.deepEqual(boardEffects(current, current, "opp"), []);
  const moved = structuredClone(current);
  moved.opp!.board.forEach((tile) => {
    tile.col = 0;
  });
  assert.deepEqual(
    boardEffects(current, moved, "opp"),
    [],
    "moving an existing X block is not another hit",
  );
  current.you!.board.push({ id: 9, row: 2, col: 2, value: -1, blockType: "xblock" });
  assert.deepEqual(
    boardEffects(previous, current, "you"),
    [],
    "new lesson or fixture boards do not replay attacks",
  );
});

test("missing counters during a rolling socket deployment do not crash or replay effects", () => {
  const previous = players(),
    current = players();
  delete (previous.you as Partial<NonNullable<EffectPlayers["you"]>>).attacksSent;
  delete (current.you as Partial<NonNullable<EffectPlayers["you"]>>).attacksSent;
  assert.deepEqual(boardEffects(previous, current, "you"), []);
});
