import { BoardView } from "@/components/2048/board"
import { Button } from "@/components/ui/button"
import { initBoard } from "@/lib/2048"
import Link from "next/link"

export default function Page() {
  return (
    <main className="max-w-5xl mx-auto grid grid-cols-2 mt-10">
      <section className="flex flex-col items-center gap-4">
        <h1 className="text-7xl font-extrabold">2048 Brawl</h1>
        <BoardView board={initBoard(10, 8)} />
      </section>
      <section className="flex flex-col gap-2 font-extrabold text-2xl w-xs ml-auto mt-28">
        <Link href="/play/online" className="w-full"><Button className="w-full">Quick Play</Button></Link>
        <Link href="" className="w-full"><Button className="w-full"> Join </Button></Link>
        <Link href="/settings" className="w-full"><Button variant="outline" className="w-full"> Settings </Button></Link>
        <Link href="/how-to-play" className="w-full"><Button variant="outline" className="w-full"> How to Play </Button></Link>
        <Link href="/leaderboards" className="w-full"><Button variant="outline" className="w-full"> Leaderboards </Button></Link>
      </section>
    </main>
  )
}
  