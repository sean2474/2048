"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { initBoard, move, spawnRandom, hasMoves } from "@/lib/2048";
import { Board, Dir } from "@/types";
import { Button } from "@/components/ui/button";
import { BoardView } from "@/components/2048/board";
import { useLoadout } from "@/hooks/use-loadout";
import { SoundToggle } from "@/components/widget/audio-controls";
import { useAudio } from "@/hooks/audio-provider";

export function ObstacleLab({ instructions }: { instructions: ReactNode }) {
  const { skin } = useLoadout();
  const { play } = useAudio();
  const [board, setBoard] = useState<Board>([]);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [storageError, setStorageError] = useState(false);

  const prevRef = useRef<{ board: Board; score: number } | null>(null);
  const gameOver = useMemo(() => board.length > 0 && !hasMoves(board), [board]);

  useEffect(() => {
    setBoard(initBoard());
    try {
      const saved = Number(localStorage.getItem("best2048"));
      if (Number.isSafeInteger(saved) && saved >= 0) setBest(saved);
    } catch { setStorageError(true); }
  }, []);

  // 장애물 추가 함수
  const addObstacle = useCallback((type: "xblock" | "hardblock") => {
    const withSpawn = spawnRandom(board, undefined, type);
    if (withSpawn === board) {
      alert("빈 공간이 없습니다!");
      return;
    }

    play("impact");
    setBoard(withSpawn);

  }, [board, play]);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      try { localStorage.setItem("best2048", String(score)); }
      catch { setStorageError(true); }
    }
  }, [score, best]);

  const doMove = useCallback((dir: Dir) => {
    if (gameOver) return;
    const { board: slid, moved, gain } = move(board, dir);
    if (!moved) return;

    prevRef.current = { board: board.map(t => ({ ...t })), score };
    const withSpawn = spawnRandom(slid);
    play(!hasMoves(withSpawn) ? "lose" : gain > 0 ? "merge" : "move", skin.id);
    setBoard(withSpawn);
    setScore((s) => s + gain);
  }, [board, score, gameOver, play, skin.id]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=menu]")) return;
      const map: Record<string, Dir> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down",
        A: "left", D: "right", W: "up", S: "down",
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); doMove(dir); }
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  const newGame = () => { setBoard(initBoard()); setScore(0); prevRef.current = null; };
  const undo = () => {
    if (!prevRef.current) return;
    setBoard(prevRef.current.board);
    setScore(prevRef.current.score);
    prevRef.current = null;
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
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
      </div>

      <BoardView board={board} skinId={skin.id} onMove={doMove} />

      <div className="mt-4 space-y-3">
        {storageError && <p role="status" className="text-sm text-muted-foreground">Best score cannot be saved in this browser.</p>}
        <SoundToggle />
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
          {instructions}
        </div>

        {gameOver && (
          <div className="text-center py-2 text-red-600 font-semibold">
            Game Over!
          </div>
        )}
      </div>
    </>
  );
}
