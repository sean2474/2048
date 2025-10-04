"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { BoardView } from "@/components/2048/board";
import { Button } from "@/components/ui/button";
import type { Dir, S2C } from "@/types";
import { Copy, Check } from "lucide-react";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<S2C | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [copied, setCopied] = useState(false);
  const turnIdRef = useRef(0);

  // 소켓 연결
  useEffect(() => {
    const newSocket = io("http://localhost:4000");
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setConnected(true);
      console.log("Connected:", newSocket.id);
      
      // 방 참가
      newSocket.emit("message", {
        t: "joinRoom",
        roomId: roomId
      });
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
    });

    newSocket.on("message", (data: S2C) => {
      console.log("Received:", data);
      
      if (data.t === "state") {
        setGameState(data);
        setWaiting(false);
      } else if (data.t === "end") {
        setGameState(data);
      } else if (data.t === "reject") {
        setGameState(data);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, router]);

  // 키보드 입력
  const handleMove = useCallback((dir: Dir) => {
    if (!socket || !connected || !gameState || gameState.t !== "state") return;
    
    socket.emit("message", {
      t: "input",
      turnId: turnIdRef.current,
      dir: dir
    });
  }, [socket, connected, gameState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "up",
        s: "down",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        handleMove(dir);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMove]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = () => {
    if (socket) {
      socket.disconnect();
    }
    router.push("/");
  };

  // 대기 화면 - gameState가 없거나 waiting 상태
  if (waiting || !gameState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <h1 className="text-4xl font-bold">Waiting for Opponent...</h1>
          <div className="p-6 bg-card border-2 border-border rounded-lg space-y-4">
            <p className="text-muted-foreground">Share this room code with your friend:</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-muted rounded-lg font-mono text-2xl font-bold">
                {roomId}
              </div>
              <Button size="icon" onClick={copyRoomCode}>
                {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </Button>
            </div>
          </div>
          <Button variant="outline" onClick={leaveRoom}>
            Leave Room
          </Button>
        </div>
      </div>
    );
  }

  // 게임 종료
  if (gameState.t === "end") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <h1 className="text-6xl font-bold">
            {gameState.winner === "you" ? "🎉 You Win!" : 
             gameState.winner === "opp" ? "😢 You Lose" : "🤝 Draw"}
          </h1>
          <Button onClick={() => router.push("/")}>
            Back to Menu
          </Button>
        </div>
      </div>
    );
  }

  // Reject 처리
  if (gameState.t === "reject") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Connection Error</h1>
          <p className="text-muted-foreground">Reason: {gameState.reason}</p>
          <Button onClick={() => router.push("/")}>
            Back to Menu
          </Button>
        </div>
      </div>
    );
  }

  // 게임 진행 중
  const { you, opp } = gameState;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        {/* Game Boards */}
        <div className="grid md:grid-cols-2 divide-x-2 divide-foreground">
          {/* Your Board */}
          <div className="space-y-4 pr-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-primary">You</h2>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Score</p>
                <p className="text-2xl font-bold">{you.score}</p>
              </div>
            </div>
            <BoardView board={you.board} />
            <div className="p-4 bg-card border border-border rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Your Max Tile</p>
              <p className="text-3xl font-bold text-primary">{you.maxTile}</p>
            </div>
          </div>

          {/* Opponent Board */}
          <div className="space-y-4 pl-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-secondary">Opponent</h2>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Score</p>
                <p className="text-2xl font-bold">{opp ? opp.score : 0}</p>
              </div>
            </div>
            <BoardView board={opp ? opp.board : []} />
            <div className="p-4 bg-card border border-border rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Opp Max Tile</p>
              <p className="text-3xl font-bold text-secondary">{opp ? opp.maxTile : 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}