import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { io, Socket } from "socket.io-client";
import { usePlayer } from "@/hooks/use-player";
import { ArrowLeft, User, UserCheck, UserPlus, Users } from "lucide-react";

export const StartGameModal = () => {
  const router = useRouter();
  const { user } = usePlayer();
  const [showJoinView, setShowJoinView] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const joinRoom = () => {
    if (roomCode.trim().length < 6 || !user) return;

    // 이미 게임 중인지 체크
    const currentGameRoom = localStorage.getItem("currentGameRoomId");
    if (currentGameRoom) {
      setErrorMessage("You are already in a game. Please finish your current game first.");
      return;
    }

    setIsJoining(true);
    const userId = user.id;
    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL!);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected for join:", newSocket.id);
      
      // 서버에 join code로 조인 요청 (userId 포함)
      newSocket.emit("message", {
        t: "joinRoomWithCode",
        userId,
        joinCode: roomCode.trim().toUpperCase()
      });
    });

    newSocket.on("message", (data) => {
      console.log("Received:", data);
      
      if (data.t === "roomReady") {
        // 서버에서 실제 roomId 받음 → 조인 소켓 disconnect 후 게임 페이지로 이동
        console.log("Joined! Redirecting to:", `/play/${data.roomId}`);
        newSocket.disconnect();
        router.push(`/play/${data.roomId}`);
      }

      if (data.t === "error") {
        console.error("Join error:", data.reason);
        alert(`Failed to join: ${data.reason}`);
        newSocket.disconnect();
        setIsJoining(false);
        setRoomCode("");
      }
    });
  };

  const handleBackToMenu = () => {
    setShowJoinView(false);
    setRoomCode("");
    setErrorMessage("");
    if (socket) socket.disconnect();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Start Game</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {!showJoinView ? (
          <>
            <DialogHeader>
              <DialogTitle>Start Game</DialogTitle>
              <DialogDescription>
                Select a gamemode
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              <Button variant="default" className="w-full h-full aspect-square flex flex-col items-center justify-center gap-2" onClick={() => router.push("/play/online")}>
                <User className="size-20" strokeWidth={0.8} />
                Single Player
              </Button>
              <Button variant="default" className="w-full h-full aspect-square flex flex-col items-center justify-center gap-2" onClick={() => router.push("/play/online")}>
                <Users className="size-20" strokeWidth={0.8} />
                Multiplayer
              </Button>
              <Button variant="outline" className="w-full h-full aspect-square flex flex-col items-center justify-center gap-2" onClick={() => router.push("/play/create")}>
                <UserPlus className="size-20" strokeWidth={0.8} />
                Create Room
              </Button>
              <Button variant="outline" className="w-full h-full aspect-square flex flex-col items-center justify-center gap-2" onClick={() => setShowJoinView(true)}>
                <UserCheck className="size-20" strokeWidth={0.8} />
                Join Room
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleBackToMenu}
                  disabled={isJoining}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>Join Room</DialogTitle>
              </div>
              <DialogDescription>
                Enter the 6-character join code shared by your friend
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {errorMessage && (
                <p className="text-sm text-destructive font-normal text-center mb-4">
                  {errorMessage}
                </p>
              )}
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  setErrorMessage("");
                }}
                placeholder="ABC123"
                className="w-full px-4 py-3 border rounded-lg mb-4 uppercase font-mono text-2xl text-center tracking-wider dark:bg-gray-700 dark:border-gray-600"
                maxLength={6}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') joinRoom();
                }}
                autoFocus
                disabled={isJoining}
              />
              <div className="flex gap-2">
                <Button 
                  size="lg" 
                  onClick={joinRoom} 
                  className="flex-1 h-12" 
                  disabled={roomCode.length < 6 || isJoining}
                >
                  {isJoining ? "Joining..." : "Join"}
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={handleBackToMenu} 
                  className="flex-1 h-12"
                  disabled={isJoining}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};