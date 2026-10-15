import { applyMove, chargeAttacks, clearOldestX } from "game-core";
import type { AttackInventory, AttackType, Board, Dir, Effect } from "schema/in-game";

export type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5;
type Lesson = { step: TutorialStep; board: Board; opponent: Board; score: number; attacks: AttackInventory; pending: Effect[]; charged: boolean; complete: boolean; notice: string };
type Action = { type: "move"; dir: Dir } | { type: "attack"; blockType: AttackType } | { type: "ability" | "advance" | "restart" };
const rng = () => 0;

export function createLesson(step: TutorialStep = 0): Lesson {
  const value = step === 0 ? 2 : step === 1 ? 128 : 256;
  return {
    step,
    // Negative seed IDs cannot collide with IDs created by the game engine.
    board: step === 5
      ? [{ id: -1, value: 32, row: 2, col: 0 }, { id: -2, value: 16, row: 2, col: 3 },
        { id: -4, value: 0, row: 2, col: 1, blockType: "xblock" }, { id: -3, value: 0, row: 3, col: 3, blockType: "xblock" },
        { id: -5, value: 0, row: 1, col: 2, blockType: "hardblock" }]
      : step === 4
      ? [128, 128, 128, 128, 256, 256, 256, 256].map((value, index) => ({ id: -10 - index, value, row: index < 4 ? 1 : 3, col: index % 4 }))
      : step === 3 ? [{ id: -1, value: 2, row: 2, col: 2 }, { id: -2, value: 4, row: 2, col: 3 }]
      : [{ id: -1, value, row: 2, col: 1 }, { id: -2, value, row: 2, col: 3 }],
    opponent: [{ id: -3, value: 2, row: 2, col: 2 }, { id: -4, value: 4, row: 2, col: 3 }],
    score: 0, attacks: { xblock: 0, hardblock: 0 },
    pending: step === 3 ? [{ type: "addBlock", blockType: "xblock" }, { type: "addBlock", blockType: "hardblock" }] : [],
    charged: false, complete: false, notice: "",
  };
}

export function tutorialReducer(lesson: Lesson, action: Action): Lesson {
  switch (action.type) {
    case "restart": return createLesson(lesson.step);
    case "advance": return lesson.complete && lesson.step < 5 ? createLesson((lesson.step + 1) as TutorialStep) : lesson;
    case "ability": {
      if (lesson.step !== 5 || lesson.complete) return lesson;
      const board = clearOldestX(lesson.board);
      if (board === lesson.board) return lesson;
      return { ...lesson, board, complete: true, notice: "" };
    }
    case "move": {
      if (lesson.step === 5 || lesson.charged || lesson.complete) return lesson;
      const result = applyMove(lesson.board, action.dir, rng, lesson.step === 3 ? lesson.pending : []);
      if (!result.moved) return { ...lesson, notice: "Nothing moved. Try left or right, or restart this step." };
      if (lesson.step === 3) {
        const before = lesson.board.find(tile => tile.blockType === "xblock");
        const after = result.board.find(tile => tile.blockType === "xblock");
        const complete = !!before && !!after && (before.row !== after.row || before.col !== after.col);
        return { ...lesson, board: result.board, score: lesson.score + result.scoreDelta, pending: result.pendingEffects, complete, notice: "" };
      }
      const attacks = chargeAttacks(result.board, lesson.attacks);
      const charged = lesson.step === 1 ? attacks.xblock > 0 : lesson.step === 2 ? attacks.hardblock > 0 : lesson.step === 4 && attacks.xblock >= 2 && attacks.hardblock >= 2;
      return { ...lesson, board: result.board, score: lesson.score + result.scoreDelta, attacks, charged, complete: lesson.step === 0 && result.mergedMaxTile >= 4, notice: "Good move. Now bring the matching tiles together." };
    }
    case "attack": {
      if (!lesson.charged || lesson.complete || lesson.attacks[action.blockType] < 1) return lesson;
      const attacks = { ...lesson.attacks, [action.blockType]: lesson.attacks[action.blockType] - 1 };
      const pending: Effect[] = [...lesson.pending, { type: "addBlock", blockType: action.blockType }];
      const complete = attacks.xblock + attacks.hardblock === 0;
      // The practice opponent waits for the volley, then takes one valid move.
      const opponent = complete ? applyMove(lesson.opponent, "left", rng, pending).board : lesson.opponent;
      return { ...lesson, attacks, pending: complete ? [] : pending, opponent, complete, notice: "" };
    }
  }
}
