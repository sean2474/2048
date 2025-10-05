"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { BoardView } from "@/components/2048/board";
import { Button } from "@/components/ui/button";
import type { Dir, S2C } from "@/types";
import { Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlayer } from "@/hooks/use-player";
import { createClient } from "@/lib/supabase/client";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const supabase = createClient();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<S2C | null>(null);
  const { user, player } = usePlayer();

  // 소켓 연결
  useEffect(() => {
    console.log("[GamePage] Socket connection effect triggered, user:", user);
    
    // user 로딩 중이면 대기
    if (user === undefined) {
      console.log("[GamePage] User is undefined, waiting...");
      return;
    }

    // user가 null이면 세션 확인 후 익명 로그인
    if (user === null) {
      console.log("[GamePage] User is null, checking session...");
      const checkSession = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log("[GamePage] No session, signing in anonymously...");
          await supabase.auth.signInAnonymously();
        } else {
          console.log("[GamePage] Session found, using existing session");
        }
      };
      checkSession();
      return;
    }

    const userId = user.id;
    console.log("[GamePage] Connecting with userId:", userId);
    
    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL!);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setConnected(true);
      console.log("Connected:", newSocket.id);
      
      // 방 참가 시도 (userId 포함)
      newSocket.emit("message", {
        t: "joinRoom",
        roomId: roomId,
        userId: userId
      });
    });

    newSocket.on("disconnect", () => {
      setConnected(false);
    });

    newSocket.on("message", (data: S2C) => {
      console.log("Received:", data);
      
      if (data.t === "state") {
        setGameState(data);
      } else if (data.t === "end") {
        setGameState(data);
      } else if (data.t === "reject") {
        // 방에 접속할 수 없음 - 메인으로 리다이렉트
        console.error("Cannot join room:", data.reason);
        alert(`Cannot join room: ${data.reason}`);
        router.push("/");
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [roomId, router, user]);

  // 키보드 입력
  const handleMove = useCallback((dir: Dir) => {
    if (!socket || !connected || !gameState || gameState.t !== "state") return;
    
    console.log("Sending input:", dir);
    socket.emit("message", {
      t: "input",
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

  const leaveRoom = () => {
    if (socket) {
      socket.disconnect();
    }
    router.push("/");
  };

  // 게임 상태가 아직 없으면 로딩
  if (!gameState) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md">
          <h1 className="text-4xl font-bold">Connecting...</h1>
        </div>
      </div>
    );
  }

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

  // 게임 종료
  if (gameState.t === "end") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <Trophy className={`h-20 w-20 mx-auto ${gameState.winner === "you" ? "text-yellow-500" : "text-gray-500"}`} />
          <h1 className="text-6xl font-bold">
            {gameState.winner === "you" ? "🎉 You Win!" : 
             gameState.winner === "opp" ? "😢 You Lose" : "🤝 Draw"}
          </h1>
          <div className="flex gap-4 justify-center">
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Menu
            </Button>
            <Button onClick={() => window.location.reload()}>
              Play Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 게임 진행 중
  const { you, opp } = gameState;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto mt-10">
        {/* Game Boards */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Your Board */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={player?.image_path || ""} />
                  <AvatarFallback>{player?.name?.[0] || "G"}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold">{player?.name || "You"}</h2>
                  <p className="text-sm text-muted-foreground">Your Board</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{you.score}</p>
                <p className="text-sm text-muted-foreground">Score</p>
              </div>
            </div>
            <div className="p-6 bg-card border-2 border-primary rounded-lg">
              <BoardView board={you.board} />
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-muted-foreground">Max Tile</p>
                <p className="text-lg font-bold text-primary">{you.maxTile}</p>
              </div>
            </div>
          </div>

          {/* Opponent Board */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 bg-destructive">
                  <AvatarFallback>OP</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold">Opponent</h2>
                  <p className="text-sm text-muted-foreground">Enemy Board</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-destructive">{opp ? opp.score : 0}</p>
                <p className="text-sm text-muted-foreground">Score</p>
              </div>
            </div>
            <div className="p-6 bg-card border-2 border-border rounded-lg opacity-80">
              <BoardView board={opp ? opp.board : []} />
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <p className="text-muted-foreground">Max Tile</p>
                <p className="text-lg font-bold text-destructive">{opp ? opp.maxTile : 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Leave button */}
        <div className="mt-8 text-center">
          <Button variant="outline" onClick={leaveRoom}>
            Leave Game
          </Button>
        </div>
      </div>
    </div>
  );
}