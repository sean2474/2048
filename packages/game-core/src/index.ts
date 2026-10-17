import type { AbilityState, AttackCounts, BlockType, Board, Cell, Dir, Effect } from "schema/in-game";
import { SIZE } from "schema/in-game";
import { DEFAULT_ABILITY_ID } from "schema/loadout";

export type ApplyResult = {
  board: Board;
  scoreDelta: number;
  mergedMaxTile: number;   // 이번 턴에 만들어진 가장 큰 타일(공격 트리거용)
  moved: boolean;          // 유효한 이동 여부
  pendingEffects: Effect[];
};

// ========== 내부 상태 ==========
let nextId = 1;

// ========== 헬퍼 함수 ==========
const clone = (b: Board): Board => b.map(t => ({ ...t }));
const active = (b: Board): Board => b.filter(t => !t.ghost); // 로직은 고스트 제외
const getBlockType = (cell: Cell): string => cell.blockType || "normal";
const isFixed = (cell: Cell) => getBlockType(cell) === "hardblock" || !!cell.anchored;

export function createAbilityState(): AbilityState {
  return { id: DEFAULT_ABILITY_ID, charge: 0, spawnPauseMoves: 0, anchorMoves: 0, slowStartsAt: 0, slowEndsAt: 0, nextMoveAt: 0 };
}

export function clearOldestX(board: Board): Board {
  const oldest = active(board).filter(tile => getBlockType(tile) === "xblock").sort((a, b) => a.id - b.id)[0];
  return oldest ? board.filter(tile => tile.id !== oldest.id) : board;
}

export function swap32(board: Board, rng: () => number): Board {
  const numbers = active(board).filter(tile => getBlockType(tile) === "normal" && !tile.anchored);
  const big = numbers.filter(tile => tile.value === 32);
  const small = numbers.filter(tile => [2, 4, 8, 16].includes(tile.value));
  if (!big.length || !small.length) return board;
  const a = big[Math.floor(rng() * big.length)], b = small[Math.floor(rng() * small.length)];
  return active(board).map(tile => tile.id === a.id ? { ...tile, row: b.row, col: b.col, spawned: false, merged: false }
    : tile.id === b.id ? { ...tile, row: a.row, col: a.col, spawned: false, merged: false } : tile);
}

export function anchorHighest(board: Board): Board {
  const highest = active(board).filter(tile => getBlockType(tile) === "normal").sort((a, b) => b.value - a.value || a.id - b.id)[0];
  return highest ? board.map(tile => tile.id === highest.id ? { ...tile, anchored: true } : tile) : board;
}

function emptyCoords(b: Board): Array<{ row: number; col: number }> {
  const occ = new Set(active(b).map(t => `${t.row},${t.col}`));
  const out: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const k = `${r},${c}`;
    if (!occ.has(k)) out.push({ row: r, col: c });
  }
  return out;
}

// Anchored number tiles split movement lanes but can receive a matching merge.
function getFixedPositions(b: Board): Set<string> {
  return new Set(
    active(b)
      .filter(isFixed)
      .map(t => `${t.row},${t.col}`)
  );
}

// ========== 공개 함수 ==========
export function initBoard(range?: number, numTiles?: number): Board {
  let b: Board = [];
  for (let i = 0; i < (numTiles || 2); i++) {
    b = spawnRandom(b, range);
  }
  return b;
}

export function spawnRandom(board: Board, range?: number, blockType?: BlockType, rng: () => number = Math.random): Board {
  const empties = emptyCoords(board);
  if (!empties.length) return board;
  const spot = empties[Math.floor(rng() * empties.length)];

  let value = 0;
  if (range) value = Math.pow(2, Math.round(range - Math.log2(rng() * Math.pow(2, range - 1))));
  else value = rng() < 0.9 ? 2 : 4;
  if (blockType) value = blockType === "xblock" ? -1 : blockType === "hardblock" ? -2 : value;

  return [
    ...board,
    { id: nextId++, value, row: spot.row, col: spot.col, spawned: true, blockType }
  ];
}

export function hasMoves(board: Board): boolean {
  const grid = Array.from({ length: SIZE }, () => Array<Cell | undefined>(SIZE));
  for (const tile of active(board)) grid[tile.row][tile.col] = tile;
  for (const tile of active(board)) {
    if (isFixed(tile)) continue;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const row = tile.row + dr, col = tile.col + dc;
      if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) continue;
      const other = grid[row][col];
      if (!other) return true;
      if (getBlockType(tile) === "normal" && getBlockType(other) === "normal" && tile.value === other.value) return true;
    }
  }
  return false;
}

export function move(board: Board, dir: Dir): { board: Board; moved: boolean; gain: number } {
  // 고스트 제거 + 플래그 리셋
  const src = clone(active(board)).map(t => ({ ...t, spawned: false, merged: false }));

  const fixed = src.filter(isFixed);
  const hardPos = getFixedPositions(src);
  const handledAnchors = new Set<number>();

  let moved = false;
  let gain = 0;
  const out: Board = [];

  const isHorizontal = dir === "left" || dir === "right";
  const forward = dir === "left" || dir === "up";      // 세그먼트의 앞쪽으로 압축
  const step = forward ? 1 : -1;

  // 라인 좌표 헬퍼: (lineIndex, pos) -> (row,col)
  const coordOf = (lineIndex: number, pos: number) =>
    isHorizontal ? { row: lineIndex, col: pos } : { row: pos, col: lineIndex };

  for (let i = 0; i < SIZE; i++) {
    // 1) 이 라인에서 hardblock이 있는 좌표(스칼라 pos) 수집
    const blockPositions: number[] = [];
    for (let p = 0; p < SIZE; p++) {
      const key = isHorizontal ? `${i},${p}` : `${p},${i}`;
      if (hardPos.has(key)) blockPositions.push(p);
    }
    blockPositions.sort((a, b) => a - b);

    // 2) hardblock 사이의 연속 구간(세그먼트) 만들기
    const segments: Array<[number, number]> = [];
    let start = 0;
    for (const bp of blockPositions) {
      if (bp - 1 >= start) segments.push([start, bp - 1]);
      start = bp + 1;
    }
    if (start <= SIZE - 1) segments.push([start, SIZE - 1]);

    // 3) 이 라인의 non-hardblock 타일 수집(원래 pos 함께)
    const lineTiles = src
      .filter(t => (isHorizontal ? t.row === i : t.col === i) && !isFixed(t))
      .map(t => ({ tile: t, pos: isHorizontal ? t.col : t.row }))
      .sort((a, b) => (forward ? a.pos - b.pos : b.pos - a.pos)); // 이동 방향 기준 정렬

    // 4) 세그먼트 단위로 압축/병합
    for (const [segStart, segEnd] of segments) {
      const segTiles = lineTiles
        .filter(x => x.pos >= segStart && x.pos <= segEnd)
        .map(x => x.tile);

      if (segTiles.length === 0) continue;

      let write = forward ? segStart : segEnd; // 다음에 채울 칸
      const boundary = coordOf(i, write - step);
      const anchor = fixed.find(tile => tile.anchored && tile.row === boundary.row && tile.col === boundary.col);
      const placed: Cell[] = anchor ? [anchor] : [];
      if (anchor) handledAnchors.add(anchor.id);
      const visuals: Cell[] = [];

      for (const cur of segTiles) {
        const curType = getBlockType(cur);

        const canMerge =
          curType === "normal" &&
          placed.length > 0 &&
          getBlockType(placed[placed.length - 1]) === "normal" &&
          placed[placed.length - 1].value === cur.value &&
          !placed[placed.length - 1].merged;

        if (canMerge) {
          // 직전에 둔 타일과 병합 (직전 칸 인덱스 = write - step)
          const prev = placed.pop()!;
          const lastPos = write - step;
          const target = coordOf(i, lastPos);

          // 이동 체크(현재 타일 기준)
          if (cur.row !== target.row || cur.col !== target.col) moved = true;

          const mergedVal = prev.value * 2;
          gain += mergedVal;

          const mergedTile: Cell = {
            id: nextId++,
            value: mergedVal,
            row: target.row,
            col: target.col,
            blockType: "normal",
            merged: true,
            ...(prev.anchored ? { anchored: true } : {}),
          };
          placed.push(mergedTile);

          // 고스트 2개(원본 두 개)를 병합 위치에 1프레임 남김
          visuals.push({ ...prev, row: target.row, col: target.col, ghost: true, spawned: false, merged: false });
          visuals.push({ ...cur,  row: target.row, col: target.col, ghost: true, spawned: false, merged: false });
          // write는 그대로 (병합은 개수 -1이므로 다음 빈칸은 변함 없음)
        } else {
          // 단순 슬라이드 배치
          const target = coordOf(i, write);
          if (cur.row !== target.row || cur.col !== target.col) moved = true;
          placed.push({ ...cur, row: target.row, col: target.col });
          write += step;
        }
      }

      out.push(...placed, ...visuals);
    }
  }

  out.push(...fixed.filter(tile => !handledAnchors.has(tile.id)));

  // (선택) 안정된 순서
  out.sort((a, b) => a.id - b.id);

  return { board: out, moved, gain };
}


export function applyMove(board: Board, dir: Dir, rng: () => number, pending: Effect[] = [], spawnNumber = true): ApplyResult {
  const moveResult = move(board, dir);
  
  if (!moveResult.moved) {
    return {
      board: moveResult.board,
      scoreDelta: 0,
      mergedMaxTile: 0,
      moved: false,
      pendingEffects: pending
    };
  }

  // 새 타일 스폰 (rng 사용)
  const applied = applyPendingEffects(moveResult.board, pending, rng);
  let newBoard = applied.board;
  const empties = emptyCoords(newBoard);
  
  if (spawnNumber && empties.length > 0) {
    const spot = empties[Math.floor(rng() * empties.length)];
    const value = rng() < 0.9 ? 2 : 4;
    newBoard = [
      ...newBoard,
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
    moved: true,
    pendingEffects: applied.pending
  };
}

export function attacksFromMerges(board: Board): AttackCounts {
  const attacks: AttackCounts = { xblock: 0, hardblock: 0 };
  for (const tile of board) {
    if (!tile.merged || tile.ghost || getBlockType(tile) !== "normal") continue;
    if (tile.value === 256) attacks.xblock++;
    if (tile.value === 512) attacks.hardblock++;
  }
  return attacks;
}

export function applyEffects(board: Board, effects: Effect[], rng: () => number): Board {
  let newBoard = board;
  
  for (const effect of effects) {
    if (effect.type === "none") continue;
    
    if (effect.type === "addBlock") {
      // 상대방 보드에 방해 블록 추가
      const blockType = effect.blockType || "xblock"; // xblock 또는 hardblock
      
      newBoard = spawnRandom(newBoard, undefined, blockType, rng);
    }
    
    if (effect.type === "removeBlock") {
      // X블록 제거 로직 (나중에 구현 가능)
      const blocks = active(newBoard).filter(t => getBlockType(t) === effect.blockType);
      const chosen = blocks[Math.floor(rng() * blocks.length)];
      const removeIds = new Set(chosen ? [chosen.id] : []);

      newBoard = newBoard.filter(t => !removeIds.has(t.id));
    }
  }
  
  return newBoard;
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

// Pending attacks take the first available cells before the normal tile spawn.
export function applyPendingEffects(board: Board, effects: Effect[], rng: () => number): { board: Board; pending: Effect[] } {
  let result = board;
  const pending: Effect[] = [];
  for (const effect of effects) {
    if (effect.type === "addBlock" && emptyCoords(result).length === 0) pending.push(effect);
    else result = applyEffects(result, [effect], rng);
  }
  return { board: result, pending };
}
