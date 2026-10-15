import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Player } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
export const usePlayer = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [player, setPlayer] = useState<Player | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) { setUser(null); return; }
    const supabase = createClient();
    let active = true;
    let version = 0;
    const update = async (nextUser: User | null) => {
      const request = ++version;
      if (!active) return;
      setUser(nextUser); setPlayer(null);
      if (!nextUser || nextUser.is_anonymous) return;
      const { data } = await supabase.from("players").select("*").eq("id", nextUser.id).maybeSingle();
      if (active && request === version) setPlayer(data);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Avoid awaiting another Supabase request inside its auth lock.
      void update(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return { user, player };
};
