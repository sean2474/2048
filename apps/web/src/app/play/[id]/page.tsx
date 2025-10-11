"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { BoardView } from "@/components/2048/board";
import { Button } from "@/components/ui/button";
import type { Dir, S2C } from "@/types";
import { Trophy, Flag } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePlayer } from "@/hooks/use-player";
import { createClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
    
    // 게임 시작 - roomId 저장
    localStorage.setItem("currentGameRoomId", roomId);
    
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
        // 게임 종료 - roomId 제거
        localStorage.removeItem("currentGameRoomId");
      } else if (data.t === "reject") {
        // 방에 접속할 수 없음 - roomId 제거하고 메인으로 리다이렉트
        console.error("Cannot join room:", data.reason);
        localStorage.removeItem("currentGameRoomId");
        router.push("/");
      }
    });

    return () => {
      newSocket.disconnect();
      // 컴포넌트 언마운트 시에도 제거 (뒤로가기 등)
      // 단, 게임이 진행 중이면 유지
      if (gameState?.t === "end" || !gameState) {
        localStorage.removeItem("currentGameRoomId");
      }
    };
  }, [roomId, router, user, gameState]);

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
    // 게임이 종료되었으면 키보드 입력 무시
    if (gameState?.t === "end") return;

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
  }, [handleMove, gameState]);

  const handleSurrender = () => {
    if (!socket || !connected) return;
    
    socket.emit("message", { t: "surrender" });
  };

  // 승리 이유 텍스트
  const getReasonText = (reason: string) => {
    switch (reason) {
      case "reached_2048":
        return " 2048 ";
      case "opponent_locked":
        return " ";
      case "surrender":
        return " ";
      case "opponent_disconnected":
        return " ";
      case "draw":
        return " ";
      default:
        return "";
    }
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

  // 게임 진행 중
  const { you, opp } = gameState;

  return (
    <div className="min-h-screen bg-background p-4">
      {gameState.t === "end" && (
        <div className="min-h-screen bg-background/50 flex items-center justify-center p-4 fixed inset-0 z-50">
          <div className="text-center space-y-8 max-w-md">
            {/* */}
            <Trophy 
              className={`h-32 w-32 mx-auto ${
                gameState.winner === "you" ? "text-yellow-500" : 
                gameState.winner === "draw" ? "text-gray-400" : "text-gray-500"
              }`} 
            />
            
            {/* */}
            <div className="space-y-2">
              <h1 className="text-6xl font-bold">
                {gameState.winner === "you" ? " You Win!" : 
                 gameState.winner === "draw" ? " Draw" : " You Lose"}
              </h1>
              <p className="text-xl text-muted-foreground">
                {getReasonText(gameState.reason)}
              </p>
            </div>

            {/* */}
            <div className="flex flex-col gap-3 mt-8">
              <Button 
                size="lg" 
                onClick={() => router.push("/play/online")}
                className="w-full"
              >
                Quick Play Again
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => router.push("/")}
                className="w-full"
              >
                Back to Menu
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto mt-10">
        <div className="flex justify-end items-center mb-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Flag className="mr-2 h-4 w-4" />
                Surrender
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle> Surrender </AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to surrender?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-12"> 
                  Cancel 
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleSurrender} className="bg-destructive border-destructive hover:bg-destructive/80 hover:border-destructive/80 hover:text-white h-12">
                  Surrender
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Game Boards */}
        <div className="grid md:grid-cols-[1fr_1px_1fr] gap-8">
          {/* Your Board */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={player?.image_path || ""} />
                  <AvatarFallback>{player?.name?.[0] || "G"}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-bold">{player?.name || "Guest"}</h2>
                  <p className="text-sm text-muted-foreground">Your Board</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{you.score}</p>
                <p className="text-sm text-muted-foreground">Score</p>
              </div>
            </div>
            <div className="p-6 bg-card border-2 border-primary rounded-lg items-center justify-center flex">
              <BoardView board={you.board} />
            </div>
          </div>

          <div className="w-[1px] h-full bg-primary/80" />

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
            <div className="p-6 bg-card border-2 border-border rounded-lg items-center justify-center flex">
              <BoardView board={opp ? opp.board : []} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}