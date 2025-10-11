import { Board } from "@/types";
import { initBoard } from "game-core";
import { useEffect, useState } from "react";
import { BoardView } from "../2048/board";

export const DemoBoard = () => {
  const [demoBoard, setDemoBoard] = useState<Board>([]);

  useEffect(() => {
    const board = initBoard(8, 8);
    setDemoBoard(board);
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const board = initBoard(8, 8);
      setDemoBoard(board);
    }, 2000);
    return () => clearInterval(interval);
  }, [])
  return (
    <BoardView board={demoBoard} />
  )
}