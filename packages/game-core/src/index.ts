import type { Board, Cell, Dir, Effect } from "schema";
import { SIZE } from "schema";

export type ApplyResult = {
  board: Board;
  scoreDelta: number;
  mergedMaxTile: number;   // 이번 턴에 만들어진 가장 큰 타일(공격 트리거용)
  moved: boolean;          // 유효한 이동 여부
};

// ========== 내부 상태 ==========
let nextId = 1;

// ========== 헬퍼 함수 ==========
const clone = (b: Board): Board => b.map(t => ({ ...t }));
const active = (b: Board): Board => b.filter(t => !t.ghost); // 로직은 고스트 제외

function emptyCoords(b: Board): Array<{ row: number; col: number }> {
  const occ = new Set(active(b).map(t => `${t.row},${t.col}`));
  const out: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const k = `${r},${c}`;
    if (!occ.has(k)) out.push({ row: r, col: c });
  }
  return out;
}

function getLine(b: Board, dir: Dir, index: number): Cell[] {
  const line = active(b).filter(t => (dir === "left" || dir === "right") ? t.row === index : t.col === index);
  if (dir === "left") line.sort((a, b) => a.col - b.col);
  if (dir === "right") line.sort((a, b) => b.col - a.col);
  if (dir === "up") line.sort((a, b) => a.row - b.row);
  if (dir === "down") line.sort((a, b) => b.row - a.row);
  return line;
}

function targetCoord(dir: Dir, lineIndex: number, offset: number) {
  switch (dir) {
    case "left":  return { row: lineIndex, col: offset };
    case "right": return { row: lineIndex, col: SIZE - 1 - offset };
    case "up":    return { row: offset,      col: lineIndex };
    case "down":  return { row: SIZE - 1 - offset, col: lineIndex };
  }
}

// ========== 공개 함수 ==========
export function initBoard(range?: number, numTiles?: number): Board {
  let b: Board = [];
  for (let i = 0; i < (numTiles || 2); i++) {
    b = spawnRandom(b, range);
  }
  return b;
}

export function spawnRandom(board: Board, range?: number): Board {
  const empties = emptyCoords(board);
  if (!empties.length) return board;
  const spot = empties[Math.floor(Math.random() * empties.length)];

  let value = 0;
  if (range) value = Math.pow(2, Math.round(Math.random() * range + 1));
  else value = Math.random() < 0.9 ? 2 : 4;

  return [
    ...board,
    { id: nextId++, value, row: spot.row, col: spot.col, spawned: true }
  ];
}

export function hasMoves(board: Board): boolean {
  const act = active(board);
  if (act.length < SIZE * SIZE) return true;
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (const t of act) grid[t.row][t.col] = t.value;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c];
      if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
      if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
    }
  }
  return false;
}

export function move(board: Board, dir: Dir): { board: Board; moved: boolean; gain: number } {
  const src = clone(active(board)).map(t => ({ ...t, spawned: false, merged: false })); // 고스트 제거하고 플래그 리셋
  
  let moved = false;
  let gain = 0;
  const out: Board = [];

  for (let i = 0; i < SIZE; i++) {
    const line = getLine(src, dir, i);
    if (!line.length) continue;

    const logicalPlaced: Cell[] = [];   // 실제 칸을 차지하는 타일(고스트 제외)
    const visuals: Cell[] = [];         // 한 턴만 렌더할 고스트(뒤에 깔릴 원본들)

    for (let k = 0; k < line.length; k++) {
      const cur = line[k];

      const canMerge =
        logicalPlaced.length > 0 &&
        logicalPlaced[logicalPlaced.length - 1].value === cur.value &&
        !logicalPlaced[logicalPlaced.length - 1].merged;

      if (canMerge) {
        // 직전 칸의 offset(=논리적 자리)
        const prev = logicalPlaced.pop()!;
        const posIndex = logicalPlaced.length;
        const { row, col } = targetCoord(dir, i, posIndex);

        // 이동 여부 판단(슬라이드 발생)
        if (prev.row !== row || prev.col !== col) moved = true;
        if (cur.row !== row || cur.col !== col) moved = true;

        // 새 병합 타일 (pop 애니메이션)
        const mergedVal = prev.value * 2;
        gain += mergedVal;
        const mergedTile: Cell = {
          id: nextId++,
          value: mergedVal,
          row, col,
          merged: true
        };
        logicalPlaced.push(mergedTile);

        visuals.push({ id: prev.id, value: prev.value, row, col, ghost: true, spawned: false, merged: false });
        visuals.push({ id: cur.id, value: cur.value, row, col, ghost: true, spawned: false, merged: false });

      } else {
        const posIndex = logicalPlaced.length;
        const { row, col } = targetCoord(dir, i, posIndex);
        if (cur.row !== row || cur.col !== col) moved = true;
        logicalPlaced.push({ id: cur.id, value: cur.value, row, col });
      }
    }

    out.push(...logicalPlaced, ...visuals);
  }

  out.sort((a, b) => a.id - b.id);

  return { board: out, moved, gain };
}

export function applyMove(board: Board, dir: Dir, rng: () => number): ApplyResult {
  const moveResult = move(board, dir);
  
  if (!moveResult.moved) {
    return {
      board: moveResult.board,
      scoreDelta: 0,
      mergedMaxTile: 0,
      moved: false
    };
  }

  // 새 타일 스폰 (rng 사용)
  const empties = emptyCoords(moveResult.board);
  let newBoard = moveResult.board;
  
  if (empties.length > 0) {
    const spot = empties[Math.floor(rng() * empties.length)];
    const value = rng() < 0.9 ? 2 : 4;
    newBoard = [
      ...moveResult.board,
      { id: nextId++, value, row: spot.row, col: spot.col, spawned: true }
    ];
  }

  // 이번 턴에 만들어진 최대 타일 찾기
  const mergedTiles = moveResult.board.filter(t => t.merged);
  const mergedMaxTile = mergedTiles.length > 0 
    ? Math.max(...mergedTiles.map(t => t.value))
    : 0;

  return {
    board: newBoard,
    scoreDelta: moveResult.gain,
    mergedMaxTile,
    moved: true
  };
}

export function emitDebuffEvents(mergedMaxTile: number): Effect[] {
  if (mergedMaxTile >= 1024) return [{ type: "removeBlock", rows: 1 }];
  if (mergedMaxTile >= 128)  return [{ type: "addBlock", count: 1 }];
  return [{ type: "none" }];
}

export function applyEffects(board: Board, effects: Effect[], rng: () => number): Board {
  // 예시: addBlock은 랜덤 빈 칸에 -1 같은 '장애물' 기입 등
  return board;
}

export function newBoard(rng: () => number): Board {
  let b: Board = [];
  for (let i = 0; i < 2; i++) {
    const empties = emptyCoords(b);
    if (empties.length === 0) break;
    
    const spot = empties[Math.floor(rng() * empties.length)];
    const value = rng() < 0.9 ? 2 : 4;
    b = [
      ...b,
      { id: nextId++, value, row: spot.row, col: spot.col, spawned: true }
    ];
  }
  return b;
}
