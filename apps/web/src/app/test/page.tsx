"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initBoard, move, spawnRandom, hasMoves } from "@/lib/2048";
import { Board, Dir, Cell, BlockType } from "@/types";
import { useSwipe } from "@/hooks/use-swipe";
import { Button } from "@/components/ui/button";
import { BoardView } from "@/components/2048/board";

export default function SoloPage() {
  const [board, setBoard] = useState<Board>(() => initBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => (typeof window === "undefined" ? 0 : Number(localStorage.getItem("best2048") || 0)));

  const prevRef = useRef<{ board: Board; score: number } | null>(null);
  const gameOver = useMemo(() => !hasMoves(board), [board]);
  
  // 빈 칸 찾기
  const getEmptyPositions = useCallback(() => {
    const SIZE = 5;
    const occupied = new Set(board.map(t => `${t.row},${t.col}`));
    const empty: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const key = `${r},${c}`;
        if (!occupied.has(key)) {
          empty.push({ row: r, col: c });
        }
      }
    }
    return empty;
  }, [board]);
  
  // 장애물 추가 함수
  const addObstacle = useCallback((type: "xblock" | "hardblock") => {
    const empty = getEmptyPositions();
    if (empty.length === 0) {
      alert("빈 공간이 없습니다!");
      return;
    }
    
    const withSpawn = spawnRandom(board, 1, type);
    setBoard(withSpawn);
    
  }, [getEmptyPositions]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      if (typeof window !== "undefined") localStorage.setItem("best2048", String(score));
    }
  }, [score, best]);

  const doMove = useCallback((dir: Dir) => {
    if (gameOver) return;
    const { board: slid, moved, gain } = move(board, dir);
    if (!moved) return;

    prevRef.current = { board: board.map(t => ({ ...t })), score };
    const withSpawn = spawnRandom(slid);
    setBoard(withSpawn);
    setScore((s) => s + gain);
  }, [board, score, gameOver]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down",
        A: "left", D: "right", W: "up", S: "down",
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); doMove(dir); }
    };
    window.addEventListener("keydown", onKey, { passive: false } as any);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  useSwipe((dir) => doMove(dir));

  const newGame = () => { setBoard(initBoard()); setScore(0); prevRef.current = null; };
  const undo = () => {
    if (!prevRef.current) return;
    setBoard(prevRef.current.board);
    setScore(prevRef.current.score);
    prevRef.current = null;
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-8 bg-[var(--color-bg)] text-[var(--color-text)]">
      <header className="mb-4 flex items-end justify-between">
        <h1 className="text-2xl font-bold">2048 - Obstacle Test</h1>
        <div className="flex gap-4 text-sm">
          <div className="text-right">
            <div className="text-xs text-[var(--color-text-subtle)]">SCORE</div>
            <div className="text-lg font-bold">{score}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--color-text-subtle)]">BEST</div>
            <div className="text-lg font-bold">{best}</div>
          </div>
        </div>
      </header>

      <BoardView board={board} />

      <div className="mt-4 space-y-3">
        {/* 기본 컨트롤 */}
        <div className="flex gap-2">
          <Button
            onClick={newGame}
            className="h-10 rounded-md px-4 flex-1"
          >
            New Game
          </Button>
          <Button
            onClick={undo}
            variant="outline"
            className="h-10 rounded-md px-4 flex-1"
          >
            Undo
          </Button>
        </div>
        
        {/* 장애물 추가 버튼 */}
        <div className="border-t border-gray-300 pt-3">
          <div className="text-sm font-semibold mb-2 text-[var(--color-text-subtle)]">
            🧪 Obstacle Testing
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => addObstacle("xblock")}
              variant="outline"
              className="h-10 rounded-md px-4 flex-1 bg-red-50 hover:bg-red-100 border-red-300"
            >
              <span className="mr-2">✖</span>
              Add X Block
            </Button>
            <Button
              onClick={() => addObstacle("hardblock")}
              variant="outline"
              className="h-10 rounded-md px-4 flex-1 bg-gray-100 hover:bg-gray-200 border-gray-400"
            >
              <span className="mr-2">🚫</span>
              Add HardBlock
            </Button>
          </div>
          <div className="mt-2 text-xs text-[var(--color-text-subtle)] space-y-1">
            <div>• <strong>X Block (✖)</strong>: 움직이지만 합쳐지지 않음</div>
            <div>• <strong>HardBlock (🚫)</strong>: 움직이지도 합쳐지지도 않음</div>
          </div>
        </div>
        
        {gameOver && (
          <div className="text-center py-2 text-red-600 font-semibold">
            Game Over!
          </div>
        )}
      </div>
    </main>
  );
}
