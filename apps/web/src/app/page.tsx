"use client";

import { BoardView } from "@/components/2048/board"
import { Button } from "@/components/ui/button"
import { initBoard } from "@/lib/2048"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Cell } from "@/types";

export default function Page() {
  const router = useRouter();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [demoBoard, setDemoBoard] = useState<Cell[]>([]);

  const joinRoom = () => {
    if (roomCode.trim()) {
      router.push(`/play/${roomCode.trim().toUpperCase()}`);
    }
  };

  useEffect(() => {
    const board = initBoard(10, 8);
    setDemoBoard(board);
  }, [])

  return (
    <>
      <main className="max-w-5xl mx-auto grid grid-cols-2 mt-10">
        <section className="flex flex-col items-center gap-4">
          <h1 className="text-7xl font-extrabold">2048 Brawl</h1>
          <BoardView board={demoBoard} />
        </section>
        <section className="flex flex-col gap-2 font-extrabold text-2xl w-xs ml-auto mt-28">
          <Link href="/play/online" className="w-full"><Button className="w-full">Quick Play</Button></Link>
          <Link href="/play/create" className="w-full"><Button className="w-full">Create Room</Button></Link>
          <Button className="w-full" onClick={() => setShowJoinModal(true)}>Join Room</Button>
          <Link href="/leaderboards" className="w-full"><Button variant="outline" className="w-full"> Leaderboards </Button></Link>
          <Link href="/how-to-play" className="w-full"><Button variant="outline" className="w-full"> How to Play </Button></Link>
        </section>
      </main>

      {/* Join Room Modal */}
      {showJoinModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setShowJoinModal(false)}
        >
          <div 
            className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4" 
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-4">Join Room</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
              Enter the 6-character room code shared by your friend
            </p>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="w-full px-4 py-3 border rounded-lg mb-4 uppercase font-mono text-2xl text-center tracking-wider dark:bg-gray-700 dark:border-gray-600"
              maxLength={6}
              onKeyDown={(e) => {
                if (e.key === 'Enter') joinRoom();
              }}
              autoFocus
            />
            <div className="flex gap-2 text-xl">
              <Button size="lg" onClick={joinRoom} className="flex-1 h-12" disabled={roomCode.length < 6}>
                Join
              </Button>
              <Button size="lg" variant="outline" onClick={() => setShowJoinModal(false)} className="flex-1 h-12">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}