"use client";

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client";
import { usePlayer } from "@/hooks/use-player";
import { StartGameModal } from "@/components/widget/start-game-modal";
import { useEffect } from "react";
import { DemoBoard } from "@/components/widget/demo-board";

export default function Page() {
  const supabase = createClient();
  const { user } = usePlayer();

  useEffect(() => {
    const init = async () => {
      if (user === undefined) return;
      else if (user === null) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          await supabase.auth.signInAnonymously();
        }
      }
    }
    init();
  }, [user, supabase]);

  return (
    <main className="max-w-5xl mx-auto grid grid-cols-2 mt-10">
      <section className="flex flex-col items-center gap-4">
        <h1 className="text-7xl font-extrabold">2048 Duo</h1>
        <DemoBoard />
      </section>
      <section className="flex flex-col gap-2 font-extrabold text-2xl w-xs ml-auto mt-28">
        <StartGameModal />
        <Button className="w-full" variant="outline">Achievements</Button>
        <Button className="w-full" variant="outline">Shop</Button>
        <Button className="w-full" variant="outline">Leaderboards</Button>
        <Button className="w-full" variant="outline">How to Play</Button>
      </section>
    </main>
  )
}