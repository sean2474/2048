import { test } from "node:test";
import assert from "node:assert/strict";
import { move, hasMoves, applyMove, applyPendingEffects, applyEffects, chargeAttacks, clearOldestX, swap32, anchorHighest } from "game-core";
import type { Board, Effect } from "schema/in-game";
const tile = (value: number, row: number, col: number) => ({ id: 100_000 + row * 5 + col, value, row, col });
const values = (board: Board) => board.filter(t => !t.ghost).map(t => t.value);

test("spawn pause suppresses only the normal tile, keeping incoming attacks and invalid moves unchanged", () => {
  const board = [tile(2, 0, 1)];
  const pending: Effect[] = [{ type: "addBlock", blockType: "xblock" }];
  const moved = applyMove(board, "left", () => 0, pending, false);
  assert.equal(moved.board.filter(t => !t.ghost).length, 2);
  assert.equal(moved.board.filter(t => t.blockType === "xblock").length, 1);
  assert.equal(moved.pendingEffects.length, 0);
  const invalid = applyMove([tile(2, 0, 0)], "left", () => { throw Error("No random draws"); }, pending, false);
  assert.equal(invalid.moved, false);
  assert.equal(invalid.pendingEffects, pending);
});

test("Clear X removes only the oldest active X and never a hard block or ghost", () => {
  const board: Board = [tile(32, 0, 0), { ...tile(-1, 1, 0), blockType: "xblock" }, { ...tile(-1, 0, 1), blockType: "xblock" }, { ...tile(-2, 0, 2), blockType: "hardblock" }];
  const before = structuredClone(board);
  const cleared = clearOldestX(board);
  assert.deepEqual(cleared, board.filter(t => t.id !== board[2].id));
  assert.deepEqual(board, before);
  const noX = [board[0], board[3], { ...board[2], ghost: true }];
  assert.equal(clearOldestX(noX), noX);
});

test("32 swap always pairs exactly 32 with 2, 4, 8 or 16 without changing values or obstacles", () => {
  const board: Board = [tile(32, 0, 0), tile(32, 0, 1), tile(8, 0, 2), tile(64, 0, 3), { ...tile(-1, 1, 0), blockType: "xblock" }];
  const before = structuredClone(board);
  const swapped = swap32(board, () => 0);
  assert.deepEqual(swapped.map(t => [t.value, t.row, t.col]), [[32, 0, 2], [32, 0, 1], [8, 0, 0], [64, 0, 3], [-1, 1, 0]]);
  assert.deepEqual(board, before);
  for (const missing of [[tile(32, 0, 0), tile(32, 0, 1)], [tile(2, 0, 0), tile(16, 0, 1)]]) assert.equal(swap32(missing, () => { throw Error("No target"); }), missing);
});

test("anchored tiles stay fixed, accept a matching merge from every direction, and never merge twice", () => {
  for (const [dir, row, col] of [["left", 2, 4], ["right", 2, 0], ["up", 4, 2], ["down", 0, 2]] as const) {
    const board: Board = [{ ...tile(32, 2, 2), anchored: true }, tile(32, row, col)];
    const before = structuredClone(board);
    const result = move(board, dir);
    assert.equal(result.gain, 64);
    assert.deepEqual(result.board.filter(t => !t.ghost).map(t => [t.value, t.row, t.col, t.anchored]), [[64, 2, 2, true]]);
    assert.deepEqual(board, before);
  }
  const result = move([{ ...tile(4, 0, 0), anchored: true }, tile(2, 0, 2), tile(2, 0, 4)], "left");
  assert.equal(result.gain, 4);
  assert.deepEqual(result.board.filter(t => !t.ghost).sort((a, b) => a.col - b.col).map(t => [t.value, t.col]), [[4, 0], [4, 1]]);
  assert.equal(hasMoves([{ ...tile(32, 0, 0), anchored: true }]), false);
  assert.equal(hasMoves([{ ...tile(32, 0, 0), anchored: true }, tile(32, 0, 1)]), true);
  assert.equal(anchorHighest([tile(8, 0, 0), tile(64, 2, 3)]).find(t => t.anchored)?.value, 64);
});

test("a tile merges once per turn, scores correctly and never mutates input", () => {
  const board = [2, 2, 2, 2].map((v, c) => tile(v, 0, c));
  const before = structuredClone(board);
  const result = move(board, "left");
  assert.deepEqual(values(result.board), [4, 4]);
  assert.equal(result.gain, 8);
  assert.deepEqual(board, before);
});
test("all directions compress and merge toward the requested edge", () => {
  for (const [dir, row, col] of [["left", 0, 0], ["right", 0, 4], ["up", 0, 0], ["down", 4, 0]] as const) {
    const horizontal = dir === "left" || dir === "right";
    const result = move([tile(2, 0, 0), tile(2, horizontal ? 0 : 1, horizontal ? 1 : 0)], dir);
    assert.deepEqual(result.board.filter(t => !t.ghost).map(t => [t.value, t.row, t.col]), [[4, row, col]]);
  }
});
test("hard blocks split a line and X blocks slide without merging", () => {
  const board: Board = [tile(2, 0, 0), { ...tile(-2, 0, 1), blockType: "hardblock" }, tile(2, 0, 2), { ...tile(-1, 1, 3), blockType: "xblock" }, { ...tile(-1, 1, 4), blockType: "xblock" }];
  const result = move(board, "left");
  assert.equal(result.gain, 0);
  assert.equal(result.board.find(t => t.blockType === "hardblock")?.col, 1);
  assert.deepEqual(result.board.filter(t => t.blockType === "xblock").map(t => t.col), [0, 1]);
});
test("isolated empty spaces do not hide a locked board", () => {
  const board: Board = [tile(2, 0, 0), { ...tile(-2, 0, 1), blockType: "hardblock" }, { ...tile(-2, 1, 0), blockType: "hardblock" }];
  assert.equal(hasMoves(board), false);
  assert.equal(hasMoves([tile(2, 0, 0)]), true);
});
test("attacks wait on full boards and occupy newly freed cells before normal spawns", () => {
  const board = Array.from({ length: 25 }, (_, i) => tile(i < 2 ? 2 : 2 ** (i + 2), Math.floor(i / 5), i % 5));
  const attacks: Effect[] = [{ type: "addBlock", blockType: "hardblock" }, { type: "addBlock", blockType: "xblock" }];
  const queued = applyPendingEffects(board, attacks, () => 0);
  assert.equal(queued.pending.length, 2);
  const result = applyMove(board, "left", () => 0, queued.pending);
  assert.equal(result.pendingEffects.length, 1);
  assert.equal(result.board.filter(t => !t.ghost).length, 25);
  assert.equal(result.board.filter(t => t.blockType === "hardblock").length, 1);
});
test("invalid moves do not spawn tiles or consume queued effects", () => {
  const attacks: Effect[] = [{ type: "addBlock", blockType: "xblock" }];
  const result = applyMove([tile(2, 0, 0)], "left", () => { throw Error("RNG must not run"); }, attacks);
  assert.equal(result.moved, false);
  assert.deepEqual(result.pendingEffects, attacks);
  assert.deepEqual(values(result.board), [2]);
});
test("obstacle placement uses the supplied RNG", () => {
  const effect: Effect[] = [{ type: "addBlock", blockType: "hardblock" }];
  const first = applyEffects([], effect, () => 0)[0];
  const last = applyEffects([], effect, () => 0.999)[0];
  assert.deepEqual([first.row, first.col], [0, 0]);
  assert.deepEqual([last.row, last.col], [4, 4]);
});

test("only newly merged 256 and 512 tiles charge the matching attacks", () => {
  for (const value of [4, 64, 128, 256, 512, 1024, 2048]) {
    const board = [{ ...tile(value, 0, 0), merged: true }];
    assert.deepEqual(chargeAttacks(board, { xblock: 0, hardblock: 0 }), {
      xblock: value === 256 ? 1 : 0,
      hardblock: value === 512 ? 1 : 0,
    });
  }
});

test("every qualifying merge charges one attack, without sending obstacles", () => {
  const board = [128, 128, 128, 128, 256, 256].map((value, i) => tile(value, Math.floor(i / 4), i % 4));
  const result = applyMove(board, "left", () => 0);
  assert.equal(result.moved, true);
  assert.deepEqual(chargeAttacks(result.board, { xblock: 0, hardblock: 0 }), { xblock: 2, hardblock: 1 });
  assert.equal(result.board.some(t => t.blockType === "xblock" || t.blockType === "hardblock"), false);
  assert.deepEqual(result.pendingEffects, []);
});

test("each attack stock caps independently at three without mutating inputs", () => {
  const board = [256, 256, 512, 512].map((value, col) => ({ ...tile(value, 0, col), merged: true }));
  const inventory = { xblock: 2, hardblock: 3 };
  const before = structuredClone(board);
  const result = chargeAttacks(board, inventory);
  assert.deepEqual(result, { xblock: 3, hardblock: 3 });
  assert.notEqual(result, inventory);
  assert.deepEqual(inventory, { xblock: 2, hardblock: 3 });
  assert.deepEqual(board, before);
});

test("existing tiles, ghost tiles and obstacles never charge attacks", () => {
  const board: Board = [
    tile(256, 0, 0),
    { ...tile(512, 0, 1), merged: false },
    { ...tile(256, 0, 2), merged: true, ghost: true },
    { ...tile(512, 0, 3), merged: true, ghost: true },
    { ...tile(256, 1, 0), merged: true, blockType: "xblock" },
    { ...tile(512, 1, 1), merged: true, blockType: "hardblock" },
  ];
  assert.deepEqual(chargeAttacks(board, { xblock: 1, hardblock: 2 }), { xblock: 1, hardblock: 2 });
  assert.deepEqual(chargeAttacks([], { xblock: 0, hardblock: 0 }), { xblock: 0, hardblock: 0 });
});

test("moving an already merged tile on a later turn does not charge it again", () => {
  const first = applyMove([tile(128, 0, 0), tile(128, 0, 1)], "left", () => 0);
  const inventory = chargeAttacks(first.board, { xblock: 0, hardblock: 0 });
  assert.deepEqual(inventory, { xblock: 1, hardblock: 0 });
  const second = applyMove(first.board, "down", () => 0);
  assert.equal(second.moved, true);
  assert.deepEqual(chargeAttacks(second.board, inventory), inventory);
});
