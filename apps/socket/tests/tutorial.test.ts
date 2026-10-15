import { test } from "node:test";
import assert from "node:assert/strict";
import { createLesson, tutorialReducer } from "../../web/src/lib/tutorial";

test("the tutorial teaches controls, X and hard blocks before receiving attacks", () => {
  const initial = createLesson();
  assert.equal(tutorialReducer(initial, { type: "advance" }), initial);
  assert.equal(tutorialReducer(initial, { type: "attack", blockType: "xblock" }), initial);
  const merged = tutorialReducer(initial, { type: "move", dir: "left" });
  assert.equal(merged.complete, true);
  assert.equal(merged.score, 4);
  assert.equal(merged.attacks.xblock, 0);
  assert.equal(tutorialReducer(merged, { type: "move", dir: "right" }), merged);
  let lesson = tutorialReducer(merged, { type: "advance" });
  assert.deepEqual(lesson.board.map(tile => tile.value), [128, 128]);
  for (const blockType of ["xblock", "hardblock"] as const) {
    const charged = tutorialReducer(lesson, { type: "move", dir: "right" });
    assert.equal(charged.charged, true);
    assert.equal(charged.complete, false);
    assert.equal(charged.attacks[blockType], 1);
    assert.equal(charged.score, blockType === "xblock" ? 256 : 512);
    const sent = tutorialReducer(charged, { type: "attack", blockType });
    assert.equal(sent.complete, true);
    assert.equal(sent.attacks[blockType], 0);
    assert.equal(sent.board, charged.board);
    assert.equal(sent.opponent.filter(tile => tile.blockType === blockType).length, 1);
    assert.equal(tutorialReducer(sent, { type: "attack", blockType }), sent);
    assert.deepEqual(tutorialReducer(sent, { type: "restart" }), createLesson(sent.step));
    lesson = tutorialReducer(sent, { type: "advance" });
  }
  assert.equal(lesson.step, 3);
  assert.deepEqual(initial, createLesson());
});

test("incoming attacks arrive after a move, then X slides while hard blocks stay fixed", () => {
  const incoming = createLesson(3);
  assert.equal(incoming.pending.length, 2);
  assert.equal(incoming.board.some(tile => tile.blockType), false);
  const arrived = tutorialReducer(incoming, { type: "move", dir: "left" });
  assert.equal(arrived.pending.length, 0);
  assert.equal(arrived.complete, false);
  const x = arrived.board.find(tile => tile.blockType === "xblock")!;
  const hard = arrived.board.find(tile => tile.blockType === "hardblock")!;
  const moved = tutorialReducer(arrived, { type: "move", dir: "down" });
  assert.equal(moved.complete, true);
  assert.notEqual(moved.board.find(tile => tile.id === x.id)?.row, x.row);
  const fixed = moved.board.find(tile => tile.id === hard.id)!;
  assert.deepEqual([fixed.row, fixed.col], [hard.row, hard.col]);
  assert.deepEqual(moved.attacks, { xblock: 0, hardblock: 0 });
  assert.equal(tutorialReducer(moved, { type: "advance" }).step, 4);
  assert.deepEqual(tutorialReducer(arrived, { type: "restart" }), incoming);
});

test("four saved attacks queue without moving and land together on one opponent move", () => {
  let lesson = tutorialReducer(createLesson(4), { type: "move", dir: "left" });
  assert.deepEqual(lesson.attacks, { xblock: 2, hardblock: 2 });
  assert.equal(lesson.charged, true);
  const board = lesson.board, opponent = lesson.opponent;
  for (const blockType of ["xblock", "hardblock", "xblock"] as const) {
    lesson = tutorialReducer(lesson, { type: "attack", blockType });
    assert.equal(lesson.complete, false);
    assert.equal(lesson.opponent, opponent);
    assert.equal(lesson.board, board);
  }
  assert.equal(lesson.pending.length, 3);
  lesson = tutorialReducer(lesson, { type: "attack", blockType: "hardblock" });
  assert.equal(lesson.complete, true);
  assert.deepEqual(lesson.attacks, { xblock: 0, hardblock: 0 });
  assert.equal(lesson.pending.length, 0);
  assert.equal(lesson.opponent.filter(tile => tile.blockType === "xblock").length, 2);
  assert.equal(lesson.opponent.filter(tile => tile.blockType === "hardblock").length, 2);
  assert.equal(tutorialReducer(lesson, { type: "advance" }).step, 5);
});

test("the default ability clears exactly the oldest X without moving tiles or consuming queued attacks", () => {
  const initial = createLesson(5);
  const lesson = { ...initial, pending: [{ type: "addBlock" as const, blockType: "xblock" as const }] };
  const oldestX = lesson.board.find(tile => tile.blockType === "xblock")!;
  assert.equal(tutorialReducer(lesson, { type: "advance" }), lesson);
  assert.equal(tutorialReducer(lesson, { type: "move", dir: "left" }), lesson);
  const cleared = tutorialReducer(lesson, { type: "ability" });
  assert.equal(cleared.complete, true);
  assert.equal(cleared.board.filter(tile => tile.blockType === "xblock").length, 1);
  assert.deepEqual(cleared.board, lesson.board.filter(tile => tile.id !== oldestX.id));
  assert.equal(cleared.pending, lesson.pending);
  assert.equal(cleared.attacks, lesson.attacks);
  assert.equal(cleared.score, lesson.score);
  assert.equal(cleared.opponent, lesson.opponent);
  assert.equal(tutorialReducer(cleared, { type: "ability" }), cleared);
  assert.equal(tutorialReducer(cleared, { type: "advance" }), cleared);
  assert.deepEqual(tutorialReducer(cleared, { type: "restart" }), initial);
  assert.deepEqual(createLesson(5), initial);
});

test("the ability does not spend its practice use without an X or outside the ability lesson", () => {
  const initial = createLesson(5);
  const noX = { ...initial, board: initial.board.filter(tile => tile.blockType !== "xblock") };
  assert.equal(tutorialReducer(noX, { type: "ability" }), noX);
  for (const step of [0, 1, 2, 3, 4] as const) {
    const lesson = createLesson(step);
    assert.equal(tutorialReducer(lesson, { type: "ability" }), lesson);
  }
});

test("a different first direction keeps the lesson playable and invalid moves do not charge", () => {
  const initial = createLesson(1);
  const up = tutorialReducer(initial, { type: "move", dir: "up" });
  assert.equal(up.charged, false);
  const blocked = tutorialReducer(up, { type: "move", dir: "up" });
  assert.equal(blocked.board, up.board);
  assert.equal(blocked.score, 0);
  assert.equal(blocked.attacks.xblock, 0);
  assert.ok(blocked.notice.startsWith("Nothing moved."));
  const charged = tutorialReducer(blocked, { type: "move", dir: "left" });
  assert.equal(charged.charged, true);
  assert.equal(charged.attacks.xblock, 1);
  assert.deepEqual(tutorialReducer(up, { type: "restart" }), initial);
});
