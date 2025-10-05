import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Player } from "@/types";

export const usePlayer = () => {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null | undefined>(undefined);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
  }, [supabase])

  useEffect(() => {
    const getPlayer = async () => {
      if (!user || user.is_anonymous) {
        setPlayer(null)
        return
      }
      const { data: player } = await supabase.from("players").select("*").eq("id", user.id).single()
      setPlayer(player)
    }
    getPlayer()
  }, [user, supabase])

  return { user, player }
}