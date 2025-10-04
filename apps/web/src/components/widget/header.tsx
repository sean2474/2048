import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server";
import { UserAvatar } from "./user-avatar";

export const Header = async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser()
  const { data: player } = await supabase.from("players").select("*").eq("id", user?.id).single()

  return (
    <header className="flex justify-between gap-2 px-3 py-4"> 
      <Link href="/" className="text-2xl font-bold ml-10">
        2048brawl.io
      </Link>
      <div className="flex gap-2 items-center mr-10">
        {(user && player) ? (
          <>
            <div className="text-lg mr-2">
              {player.name}
            </div>
            <UserAvatar image_path={player.image_path} name={player.name} />
          </>
        ) : (
          <>
            <Link href="/login">
              <Button size="lg" variant="default">
                Login
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline">
                Sign Up
              </Button>
            </Link>
          </>
        )}
      </div>
    </header>
  )
}