"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2 } from "lucide-react";

export default function CreateRoomPage() {
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    // 소켓 연결 및 방 생성
    const newSocket = io("http://localhost:4000");
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected:", newSocket.id);
      
      // 랜덤 6자리 방 ID 생성
      const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomId(newRoomId);
      setConnecting(false);
      
      // 방 참가
      newSocket.emit("message", {
        t: "joinRoom",
        roomId: newRoomId
      });
    });

    newSocket.on("message", (data: any) => {
      console.log("Received:", data);
      
      // if (data.t === "state") {
      //   // 상대방이 조인하면 게임 페이지로 이동
      //   router.push(`/play/${roomId}`);
      // }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [router, roomId]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
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
              Share this room code:
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 bg-muted rounded-lg font-mono text-3xl font-bold text-center tracking-wider">
                {roomId}
              </div>
              <Button size="icon" onClick={copyRoomCode} className="h-12 w-12">
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
              Your friend can join by clicking "Join Room" on the main menu
              and entering this code.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
            <div className="h-2 w-2 bg-primary rounded-full" />
            <span>Waiting for opponent...</span>
          </div>
          <Button
            variant="outline"
            onClick={cancel}
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
