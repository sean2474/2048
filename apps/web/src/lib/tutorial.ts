import { applyMove, attacksFromMerges, clearOldestX } from "game-core";
import type { AttackCounts, Board, Dir, Effect } from "schema/in-game";

export type TutorialStep = 0 | 1 | 2 | 3 | 4;
type Lesson = { step: TutorialStep; board: Board; opponent: Board; score: number; attacksSent: AttackCounts; pending: Effect[]; opponentPending: Effect[]; complete: boolean; notice: string };
type Action = { type: "move"; dir: Dir } | { type: "opponentMove" | "ability" | "advance" | "restart" };
const rng = () => 0;

export function createLesson(step: TutorialStep = 0): Lesson {
  const value = step === 0 ? 2 : step === 1 ? 128 : 256;
  return {
    step,
    // Negative seed IDs cannot collide with IDs created by the game engine.
    board: step === 4
      ? [{ id: -1, value: 32, row: 2, col: 0 }, { id: -2, value: 16, row: 2, col: 3 },
        { id: -4, value: -1, row: 2, col: 1, blockType: "xblock" }, { id: -3, value: -1, row: 3, col: 3, blockType: "xblock" },
        { id: -5, value: -2, row: 1, col: 2, blockType: "hardblock" }]
      : step === 3 ? [{ id: -1, value: 2, row: 2, col: 2 }, { id: -2, value: 4, row: 2, col: 3 }]
      : [{ id: -1, value, row: 2, col: 1 }, { id: -2, value, row: 2, col: 3 }],
    opponent: [{ id: -3, value: 2, row: 2, col: 2 }, { id: -4, value: 4, row: 2, col: 3 }],
    score: 0, attacksSent: { xblock: 0, hardblock: 0 },
    pending: step === 3 ? [{ type: "addBlock", blockType: "xblock" }, { type: "addBlock", blockType: "hardblock" }] : [],
    opponentPending: [], complete: false, notice: "",
  };
}

export function tutorialReducer(lesson: Lesson, action: Action): Lesson {
  switch (action.type) {
    case "restart": return createLesson(lesson.step);
    case "advance": return lesson.complete && lesson.step < 4 ? createLesson((lesson.step + 1) as TutorialStep) : lesson;
    case "ability": {
      if (lesson.step !== 4 || lesson.complete) return lesson;
      const board = clearOldestX(lesson.board);
      return board === lesson.board ? lesson : { ...lesson, board, complete: true, notice: "" };
    }
    case "opponentMove": {
      if (!lesson.opponentPending.length || lesson.complete) return lesson;
      const result = applyMove(lesson.opponent, "left", rng, lesson.opponentPending);
      return { ...lesson, opponent: result.board, opponentPending: result.pendingEffects, complete: result.pendingEffects.length === 0 };
    }
    case "move": {
      if (lesson.step === 4 || lesson.opponentPending.length || lesson.complete) return lesson;
      const result = applyMove(lesson.board, action.dir, rng, lesson.pending);
      if (!result.moved) return { ...lesson, notice: "Nothing moved. Try left or right, or restart this step." };
      if (lesson.step === 3) {
        const before = lesson.board.find(tile => tile.blockType === "xblock");
        const after = result.board.find(tile => tile.blockType === "xblock");
        const complete = !!before && !!after && (before.row !== after.row || before.col !== after.col);
        return { ...lesson, board: result.board, score: lesson.score + result.scoreDelta, pending: result.pendingEffects, complete, notice: "" };
      }
      const attacks = attacksFromMerges(result.board);
      const opponentPending: Effect[] = (["xblock", "hardblock"] as const).flatMap(blockType =>
        Array.from({ length: attacks[blockType] }, () => ({ type: "addBlock" as const, blockType })));
      return {
        ...lesson, board: result.board, score: lesson.score + result.scoreDelta,
        attacksSent: { xblock: lesson.attacksSent.xblock + attacks.xblock, hardblock: lesson.attacksSent.hardblock + attacks.hardblock },
        opponentPending, complete: lesson.step === 0 && result.mergedMaxTile >= 4,
        notice: "Good move. Now bring the matching tiles together.",
      };
    }
  }
}
