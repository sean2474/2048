"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, Users } from "lucide-react"
import { BoardView } from "@/components/2048/board"
import { initBoard } from "@/lib/2048"
import { io, Socket } from "socket.io-client"
import { usePlayer } from "@/hooks/use-player"
import { createClient } from "@/lib/supabase/client"
import { Board } from "@/types"
import { Avatar } from "@radix-ui/react-avatar"
import { AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { uuid } from 'uuidv4';

export default function SearchingScreen() {
  const router = useRouter();
  const supabase = createClient();

  const [boardview, setBoardview] = useState<Board>([]);

  const [username, setUsername] = useState("Player_2048")
  const [searchTime, setSearchTime] = useState(0)
  const [isSearching, setIsSearching] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef<string>("");
  const { player } = usePlayer();

  useEffect(() => {
    async function init() {
      if (player === undefined) return;
      else if (player === null) await supabase.auth.signInAnonymously()
      else setUsername(player.name)
    }
    init();
  }, [player])

  useEffect(() => {
    setBoardview(initBoard(4, 8));
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setSearchTime((prev) => prev + 1)
    }, 1000)

    // 소켓 연결 및 매칭 요청
    const socket = io("http://localhost:4000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to matchmaking server");
      // 퀵플레이용 랜덤 방 ID 생성
      const quickplayRoomId = uuid();
      roomIdRef.current = quickplayRoomId;
      socket.emit("message", {
        t: "findMatch",
        roomId: quickplayRoomId
      });
    });

    socket.on("message", (data: any) => {
      console.log("Received:", data);
      
      if (data.t === "state" && data.opp) {
        // 상대방이 실제로 조인했을 때만 게임 시작
        router.push(`/play/${roomIdRef.current}`);
      }
    });

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [router])

  const cancelSearch = () => {
    setIsSearching(false);
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    router.push("/");
  };

  return (
    <div className="bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Left Side - User Info & Game Preview */}
          <div className="space-y-6">
            <div className="p-6 bg-card border-2 border-border">
              <div className="flex items-center gap-4 mb-6">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={player?.image_path || ""} />
                  <AvatarFallback>{player?.name || "Guest"}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{player?.name || "Guest 2048"}</h2>
                  <p className="text-muted-foreground">Ready to play</p>
                </div>
              </div>
              <BoardView board={boardview} />
              <div className="mt-6 flex items-center justify-between text-sm">
                <div>
                  <p className="text-muted-foreground">Best Score</p>
                  <p className="text-2xl font-bold text-primary">12,480</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Games Played</p>
                  <p className="text-2xl font-bold text-secondary">47</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Searching Status */}
          <div className="space-y-6">
            <div className="p-8 bg-card border-2 border-border text-center">
              <div className="space-y-6">
                {/* Animated Icon */}
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative bg-primary/10 p-6 rounded-full">
                      <Users className="h-16 w-16 text-primary animate-spin-slow" />
                    </div>
                  </div>
                </div>

                {/* Searching Text */}
                <div className="space-y-2">
                  <h1 className="text-4xl font-bold text-foreground flex items-center justify-center gap-2">
                    Searching
                    <span className="flex gap-1">
                      <span className="animate-[pulse_1.5s_ease-in-out_infinite]">.</span>
                      <span className="animate-[pulse_1.5s_ease-in-out_infinite_0.2s]">.</span>
                      <span className="animate-[pulse_1.5s_ease-in-out_infinite_0.4s]">.</span>
                    </span>
                  </h1>
                  <p className="text-muted-foreground text-lg">Looking for an opponent</p>
                </div>

                {/* Search Time */}
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-mono text-muted-foreground">
                    {Math.floor(searchTime / 60)
                      .toString()
                      .padStart(2, "0")}
                    :{(searchTime % 60).toString().padStart(2, "0")}
                  </span>
                </div>

                {/* Status Info */}
                <div className="space-y-3 pt-4">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                    <span>Searching in your region</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 bg-accent rounded-full animate-pulse" />
                    <span>Matching skill level</span>
                  </div>
                </div>

                {/* Cancel Button */}
                <Button
                  variant="outline"
                  onClick={cancelSearch}
                  className="w-full max-w-xs"
                >
                  Cancel Search
                </Button>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="p-6 bg-card/50 border border-border space-y-3">
              <h3 className="font-semibold text-foreground">Quick Tips</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Merge tiles to attack your opponent</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Block attacks with X blocks</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Watch out for hardblocks!</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
