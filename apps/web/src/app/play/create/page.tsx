"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2 } from "lucide-react";
import { usePlayer } from "@/hooks/use-player";
import { createClient } from "@/lib/supabase/client";

export default function CreateRoomPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = usePlayer();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [joinCode, setJoinCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    async function init() {
      if (user === undefined) return;
      
      if (user === null) {
        // 기존 세션 확인
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // 세션 있으면 재사용
          setUserId(session.user.id);
        } else {
          // 세션 없으면 익명 로그인
          const { data: { user }, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          setUserId(user?.id);
        }
      } else {
        setUserId(user.id);
      }
    }
    init();
  }, [user, supabase]);

  useEffect(() => {
    if (!userId) return;

    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL!);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected:", newSocket.id);
      
      // 랜덤 6자리 join code 생성
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setJoinCode(code);
      setConnecting(false);
      
      // 서버에 join code로 대기 등록
      newSocket.emit("message", {
        t: "createRoomWithCode",
        userId,
        joinCode: code
      });
    });

    newSocket.on("message", (data) => {
      console.log("Received:", data);
      
      if (data.t === "waitingForPlayer") {
        console.log("Waiting for another player...");
      }

      if (data.t === "roomReady") {
        // 서버에서 실제 roomId 받음 → 매칭 소켓 disconnect 후 게임 페이지로 이동
        console.log("Room ready! Redirecting to:", `/play/${data.roomId}`);
        newSocket.disconnect();
        router.push(`/play/${data.roomId}`);
      }

      if (data.t === "error") {
        console.error("Error:", data.reason);
        alert(`Error: ${data.reason}`);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [router, userId, supabase]);

  const copyJoinCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cancel = () => {
    if (socket) {
      socket.disconnect();
    }
    router.push("/");
  };

  if (connecting) {
    return (
      <div className="bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <h1 className="text-2xl font-bold">Creating Room...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">Room Created!</h1>
          <p className="text-muted-foreground">
            Waiting for your friend to join...
          </p>
        </div>

        <div className="p-6 bg-card border-2 border-border rounded-lg space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Share this join code:
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-muted rounded-lg font-mono text-3xl font-bold text-center tracking-wider">
                {joinCode}
              </div>
              <Button size="icon" onClick={copyJoinCode} className="h-12 w-12">
                {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              </Button>
            </div>
            {copied && (
              <p className="text-sm text-green-600 text-center">
                ✓ Copied to clipboard!
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              Your friend can join by clicking &quot;Join Room&quot; on the main menu
              and entering this code.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
            <div className="h-2 w-2 bg-primary rounded-full" />
            <span>Waiting for opponent...</span>
          </div>
          <Button variant="outline" onClick={cancel} className="w-full">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
