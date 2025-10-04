// app/solo/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initBoard, move, spawnRandom, hasMoves } from "@/lib/2048";
import { Board, Dir } from "@/types";
import { useSwipe } from "@/hooks/use-swipe";
import { Button } from "@/components/ui/button";
import { BoardView } from "@/components/2048/board";

export default function SoloPage() {
  const [board, setBoard] = useState<Board>(() => initBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => (typeof window === "undefined" ? 0 : Number(localStorage.getItem("best2048") || 0)));

  const prevRef = useRef<{ board: Board; score: number } | null>(null);
  const gameOver = useMemo(() => !hasMoves(board), [board]);

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
        <h1 className="text-2xl font-bold">2048 (Solo)</h1>
        <div className="flex gap-4 text-sm">
          {/* <Stat label="SCORE" value={score} />
          <Stat label="BEST" value={best} /> */}
        </div>
      </header>

      <BoardView board={board} />

      <div className="mt-4 flex gap-2">
        <Button
          onClick={newGame}
          className="h-10 rounded-md px-4"
        >
          New Game
        </Button>
        <Button
          onClick={undo}
          variant="outline"
          className="h-10 rounded-md px-4"
        >
          Undo
        </Button>
        {gameOver && (
          <span className="ml-auto self-center text-[var(--color-text-subtle)]">Game Over</span>
        )}
      </div>
    </main>
  );
}
