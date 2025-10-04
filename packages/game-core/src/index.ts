import type { BlockType, Board, Cell, Dir, Effect } from "schema";
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
  const src = clone(active(board)).map(t => ({ ...t, spawned: false, merged: false })); // 고스트 제거하고 플래그 리셋
  
  // hardblock은 이동하지 않으므로 별도로 보관
  const hardblocks = src.filter(t => getBlockType(t) === "hardblock");
  const hardblockPositions = getHardblockPositions(src);
  
  let moved = false;
  let gain = 0;
  const out: Board = [];

  for (let i = 0; i < SIZE; i++) {
    const line = getLine(src, dir, i);
    if (!line.length) continue;

    const logicalPlaced: Cell[] = [];   // 실제 칸을 차지하는 타일(고스트 제외)
    const visuals: Cell[] = [];         // 한 턴만 렌더할 고스트(뒤에 깔릴 원본들)
    
    // hardblock 위치를 고려한 배치
    let hardblockIndices: number[] = [];
    for (let offset = 0; offset < SIZE; offset++) {
      const coord = targetCoord(dir, i, offset);
      if (hardblockPositions.has(`${coord.row},${coord.col}`)) {
        hardblockIndices.push(offset);
      }
    }

    for (let k = 0; k < line.length; k++) {
      const cur = line[k];
      const curBlockType = getBlockType(cur);

      // X block과 normal block 모두 병합 가능 여부 확인
      // X block은 병합 불가, normal block만 병합 가능
      const canMerge =
        curBlockType === "normal" &&
        logicalPlaced.length > 0 &&
        getBlockType(logicalPlaced[logicalPlaced.length - 1]) === "normal" &&
        logicalPlaced[logicalPlaced.length - 1].value === cur.value &&
        !logicalPlaced[logicalPlaced.length - 1].merged;

      if (canMerge) {
        // 직전 칸의 offset(=논리적 자리)
        const prev = logicalPlaced.pop()!;
        
        // hardblock 앞에서 멈추는 실제 위치 계산
        let posIndex = 0;
        let placedCount = 0;
        while (placedCount < logicalPlaced.length) {
          if (hardblockIndices.includes(posIndex)) {
            posIndex++; // hardblock은 건너뛰기
          } else {
            placedCount++;
            posIndex++;
          }
        }
        // 마지막 배치 위치 찾기 (hardblock 있으면 건너뜀)
        while (hardblockIndices.includes(posIndex) && posIndex < SIZE) {
          posIndex++;
        }
        
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
          blockType: "normal",
          merged: true
        };
        logicalPlaced.push(mergedTile);

        visuals.push({ id: prev.id, value: prev.value, row, col, ghost: true, spawned: false, merged: false });
        visuals.push({ id: cur.id, value: cur.value, row, col, ghost: true, spawned: false, merged: false });

      } else {
        // hardblock 앞에서 멈추는 실제 위치 계산
        let posIndex = 0;
        let placedCount = 0;
        while (placedCount < logicalPlaced.length) {
          if (hardblockIndices.includes(posIndex)) {
            posIndex++; // hardblock은 건너뛰기
          } else {
            placedCount++;
            posIndex++;
          }
        }
        // 마지막 배치 위치 찾기 (hardblock 있으면 건너뜀)
        while (hardblockIndices.includes(posIndex) && posIndex < SIZE) {
          posIndex++;
        }
        
        const { row, col } = targetCoord(dir, i, posIndex);
        if (cur.row !== row || cur.col !== col) moved = true;
        logicalPlaced.push({ 
          id: cur.id, 
          value: cur.value, 
          row, 
          col,
          blockType: curBlockType as any
        });
      }
    }

    out.push(...logicalPlaced, ...visuals);
  }
  
  // hardblock 추가 (원래 위치 유지)
  out.push(...hardblocks);

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
