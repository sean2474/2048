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

export default function SearchingScreen() {
  const router = useRouter();
  const supabase = createClient();
  const { player } = usePlayer();
  const [userId, setUserId] = useState<string>("");

  const [boardview, setBoardview] = useState<Board>([]);
  const [searchTime, setSearchTime] = useState(0)
  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef<string>("");

  useEffect(() => {
    async function init() {
      if (player === undefined) return;
      
      if (player === null) {
        // 기존 세션 확인
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // 세션 없으면 익명 로그인
          const { data: { user } } = await supabase.auth.signInAnonymously()
          setUserId(user?.id || "")
        } else {
          setUserId(session.user.id)
        }
      } else {
        setUserId(player.id)
      }
    }
    init();
  }, [player, supabase])

  useEffect(() => {
    setBoardview(initBoard(4, 8));
  }, [])

  useEffect(() => {
    if (!userId) return;

    console.log("userId", userId);
    const timer = setInterval(() => {
      setSearchTime((prev) => prev + 1)
    }, 1000)

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to matchmaking server");
      socket.emit("message", { t: "findMatch", userId });
    });
    
    socket.on("message", (data) => {
      console.log("Received:", data);
      
      if (data.t === "matchFound") {
        console.log("Match found! Room:", data.roomId);
        roomIdRef.current = data.roomId;
        
        // 매칭 소켓 disconnect 후 게임 페이지로 이동
        socket.disconnect();
        router.push(`/play/${data.roomId}`);
      }
    });

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [router, userId])

  const cancelSearch = () => {
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
