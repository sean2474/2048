import { test } from "node:test";
import assert from "node:assert/strict";
import { createLesson, tutorialReducer } from "../../web/src/lib/tutorial";

test("tutorial merges send attacks automatically and wait for the opponent's next move", () => {
  const initial = createLesson();
  assert.equal(tutorialReducer(initial, { type: "advance" }), initial);
  assert.equal(tutorialReducer(initial, { type: "opponentMove" }), initial);
  const merged = tutorialReducer(initial, { type: "move", dir: "left" });
  assert.equal(merged.complete, true);
  assert.equal(merged.score, 4);
  assert.deepEqual(merged.attacksSent, { xblock: 0, hardblock: 0 });
  assert.equal(tutorialReducer(merged, { type: "move", dir: "right" }), merged);
  let lesson = tutorialReducer(merged, { type: "advance" });
  for (const blockType of ["xblock", "hardblock"] as const) {
    const sent = tutorialReducer(lesson, { type: "move", dir: "right" });
    assert.equal(sent.complete, false);
    assert.equal(sent.attacksSent[blockType], 1);
    assert.equal(sent.score, blockType === "xblock" ? 256 : 512);
    assert.equal(sent.opponent, lesson.opponent);
    assert.deepEqual(sent.opponentPending, [{ type: "addBlock", blockType }]);
    assert.equal(tutorialReducer(sent, { type: "move", dir: "left" }), sent);
    assert.equal(tutorialReducer(sent, { type: "advance" }), sent);
    const landed = tutorialReducer(sent, { type: "opponentMove" });
    assert.equal(landed.complete, true);
    assert.equal(landed.board, sent.board);
    assert.equal(landed.opponentPending.length, 0);
    assert.equal(landed.opponent.filter((tile) => tile.blockType === blockType).length, 1);
    assert.equal(tutorialReducer(landed, { type: "opponentMove" }), landed);
    assert.deepEqual(tutorialReducer(landed, { type: "restart" }), createLesson(landed.step));
    lesson = tutorialReducer(landed, { type: "advance" });
  }
  assert.equal(lesson.step, 3);
  assert.deepEqual(initial, createLesson());
});

test("incoming attacks arrive after a move, then X slides while hard blocks stay fixed", () => {
  const incoming = createLesson(3);
  assert.equal(incoming.pending.length, 2);
  assert.equal(
    incoming.board.some((tile) => tile.blockType),
    false,
  );
  const arrived = tutorialReducer(incoming, { type: "move", dir: "left" });
  assert.equal(arrived.pending.length, 0);
  assert.equal(arrived.complete, false);
  const x = arrived.board.find((tile) => tile.blockType === "xblock")!;
  const hard = arrived.board.find((tile) => tile.blockType === "hardblock")!;
  const moved = tutorialReducer(arrived, { type: "move", dir: "down" });
  assert.equal(moved.complete, true);
  assert.notEqual(moved.board.find((tile) => tile.id === x.id)?.row, x.row);
  const fixed = moved.board.find((tile) => tile.id === hard.id)!;
  assert.deepEqual([fixed.row, fixed.col], [hard.row, hard.col]);
  assert.deepEqual(moved.attacksSent, { xblock: 0, hardblock: 0 });
  assert.equal(tutorialReducer(moved, { type: "advance" }).step, 4);
  assert.deepEqual(tutorialReducer(arrived, { type: "restart" }), incoming);
});

test("the default ability clears exactly the oldest X without moving tiles or consuming queued attacks", () => {
  const initial = createLesson(4);
  const lesson = {
    ...initial,
    pending: [{ type: "addBlock" as const, blockType: "xblock" as const }],
  };
  const oldestX = lesson.board.find((tile) => tile.blockType === "xblock")!;
  assert.equal(tutorialReducer(lesson, { type: "advance" }), lesson);
  assert.equal(tutorialReducer(lesson, { type: "move", dir: "left" }), lesson);
  const cleared = tutorialReducer(lesson, { type: "ability" });
  assert.equal(cleared.complete, true);
  assert.equal(cleared.board.filter((tile) => tile.blockType === "xblock").length, 1);
  assert.deepEqual(
    cleared.board,
    lesson.board.filter((tile) => tile.id !== oldestX.id),
  );
  assert.equal(cleared.pending, lesson.pending);
  assert.equal(cleared.attacksSent, lesson.attacksSent);
  assert.equal(cleared.score, lesson.score);
  assert.equal(cleared.opponent, lesson.opponent);
  assert.equal(tutorialReducer(cleared, { type: "ability" }), cleared);
  assert.equal(tutorialReducer(cleared, { type: "advance" }), cleared);
  assert.deepEqual(tutorialReducer(cleared, { type: "restart" }), initial);
});

test("the ability does not spend its practice use without an X or outside the ability lesson", () => {
  const initial = createLesson(4);
  const noX = { ...initial, board: initial.board.filter((tile) => tile.blockType !== "xblock") };
  assert.equal(tutorialReducer(noX, { type: "ability" }), noX);
  for (const step of [0, 1, 2, 3] as const) {
    const lesson = createLesson(step);
    assert.equal(tutorialReducer(lesson, { type: "ability" }), lesson);
  }
});

test("a different first direction stays playable and invalid moves never send attacks", () => {
  const initial = createLesson(1);
  const up = tutorialReducer(initial, { type: "move", dir: "up" });
  assert.deepEqual(up.attacksSent, { xblock: 0, hardblock: 0 });
  const blocked = tutorialReducer(up, { type: "move", dir: "up" });
  assert.equal(blocked.board, up.board);
  assert.equal(blocked.score, 0);
  assert.equal(blocked.attacksSent.xblock, 0);
  assert.ok(blocked.notice.startsWith("Nothing moved."));
  const sent = tutorialReducer(blocked, { type: "move", dir: "left" });
  assert.equal(sent.attacksSent.xblock, 1);
  assert.equal(sent.opponentPending.length, 1);
  assert.deepEqual(tutorialReducer(up, { type: "restart" }), initial);
});
