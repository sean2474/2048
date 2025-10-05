import type { BlockType, Board, Cell, Dir, Effect } from "schema/in-game";
import { SIZE } from "schema/in-game";

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
const getBlockType = (cell: Cell): string => cell.blockType || "normal";

function emptyCoords(b: Board): Array<{ row: number; col: number }> {
  const occ = new Set(active(b).map(t => `${t.row},${t.col}`));
  const out: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const k = `${r},${c}`;
    if (!occ.has(k)) out.push({ row: r, col: c });
  }
  return out;
}

// hardblock 위치 가져오기
function getHardblockPositions(b: Board): Set<string> {
  return new Set(
    active(b)
      .filter(t => getBlockType(t) === "hardblock")
      .map(t => `${t.row},${t.col}`)
  );
}

function getLine(b: Board, dir: Dir, index: number): Cell[] {
  // hardblock은 라인에서 제외 (움직이지 않음)
  const line = active(b).filter(t => {
    const inLine = (dir === "left" || dir === "right") ? t.row === index : t.col === index;
    return inLine && getBlockType(t) !== "hardblock";
  });
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

export function spawnRandom(board: Board, range?: number, blockType?: BlockType): Board {
  const empties = emptyCoords(board);
  if (!empties.length) return board;
  const spot = empties[Math.floor(Math.random() * empties.length)];

  let value = 0;
  if (range) value = Math.pow(2, Math.round(Math.random() * range + 1));
  else value = Math.random() < 0.9 ? 2 : 4;
  if (blockType) value = blockType === "xblock" ? -1 : blockType === "hardblock" ? -2 : value;

  return [
    ...board,
    { id: nextId++, value, row: spot.row, col: spot.col, spawned: true, blockType }
  ];
}

export function hasMoves(board: Board): boolean {
  const act = active(board);
  const normalTiles = act.filter(t => getBlockType(t) === "normal");
  
  // 빈 공간이 있으면 이동 가능
  if (act.length < SIZE * SIZE) return true;
  
  // 인접한 같은 값의 normal 타일이 있는지 확인
  const grid = Array.from({ length: SIZE }, () => Array<Cell | null>(SIZE).fill(null));
  for (const t of act) grid[t.row][t.col] = t;
  
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = grid[r][c];
      if (!cell || getBlockType(cell) !== "normal") continue;
      
      const v = cell.value;
      // 오른쪽 확인
      if (c + 1 < SIZE) {
        const right = grid[r][c + 1];
        if (right && getBlockType(right) === "normal" && right.value === v) return true;
      }
      // 아래 확인
      if (r + 1 < SIZE) {
        const down = grid[r + 1][c];
        if (down && getBlockType(down) === "normal" && down.value === v) return true;
      }
    }
  }
  return false;
}

export function move(board: Board, dir: Dir): { board: Board; moved: boolean; gain: number } {
  // 고스트 제거 + 플래그 리셋
  const src = clone(active(board)).map(t => ({ ...t, spawned: false, merged: false }));

  // hardblock은 별도로 보관(위치 불변)
  const hardblocks = src.filter(t => getBlockType(t) === "hardblock");
  const hardPos = getHardblockPositions(src);

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
      .filter(t => (isHorizontal ? t.row === i : t.col === i) && getBlockType(t) !== "hardblock")
      .map(t => ({ tile: t, pos: isHorizontal ? t.col : t.row }))
      .sort((a, b) => (forward ? a.pos - b.pos : b.pos - a.pos)); // 이동 방향 기준 정렬

    // 4) 세그먼트 단위로 압축/병합
    for (const [segStart, segEnd] of segments) {
      const segTiles = lineTiles
        .filter(x => x.pos >= segStart && x.pos <= segEnd)
        .map(x => x.tile);

      if (segTiles.length === 0) continue;

      let write = forward ? segStart : segEnd; // 다음에 채울 칸
      const placed: Cell[] = [];
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

  // 5) hardblock은 원래 위치 그대로 추가
  out.push(...hardblocks);

  // (선택) 안정된 순서
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
  if (mergedMaxTile === 512) return [{ type: "addBlock", blockType: "hardblock" }];
  if (mergedMaxTile === 128) return [{ type: "addBlock", blockType: "xblock" }];
  return [{ type: "none" }];
}

export function applyEffects(board: Board, effects: Effect[], rng: () => number): Board {
  let newBoard = board;
  
  for (const effect of effects) {
    if (effect.type === "none") continue;
    
    if (effect.type === "addBlock") {
      // 상대방 보드에 방해 블록 추가
      const blockType = effect.blockType || "xblock"; // xblock 또는 hardblock
      
      newBoard = spawnRandom(newBoard, undefined, blockType as BlockType);
    }
    
    if (effect.type === "removeBlock") {
      // X블록 제거 로직 (나중에 구현 가능)
      const xblocks = active(newBoard).filter(t => getBlockType(t) === "xblock");
      
      // 랜덤하게 xblock 제거
      const shuffled = [...xblocks].sort(() => rng() - 0.5);
      const removeIds = new Set(shuffled.slice(0, 1).map(t => t.id));
      
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
