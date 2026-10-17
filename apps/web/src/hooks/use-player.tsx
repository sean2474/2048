"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { Player } from "@/types";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Account = { user: User | null; player: Player | null };
const PlayerContext = createContext<Account | null>(null);

export function PlayerProvider({ children, initialAccount }: { children: ReactNode; initialAccount: Account }) {
  const [account, setAccount] = useState(initialAccount);
  const current = useRef(initialAccount);
  const router = useRouter();
  useEffect(() => {
    if (initialAccount.user?.id !== current.current.user?.id) return;
    current.current = initialAccount;
    setAccount(initialAccount);
  }, [initialAccount]);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const client = createClient();
    let active = true, version = 0;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      const sameUser = user?.id === current.current.user?.id;
      const request = ++version;
      current.current = { user, player: sameUser ? current.current.player : null };
      setAccount(current.current);
      if (!sameUser) queueMicrotask(() => { if (active) router.refresh(); });
      if (!user || user.is_anonymous || (sameUser && current.current.player && event !== "USER_UPDATED")) return;
      // Leave the auth lock before querying; ignore results from a previous account.
      queueMicrotask(async () => {
        if (!active || request !== version) return;
        try {
          const { data } = await client.from("players").select("*").eq("id", user.id).maybeSingle();
          if (!active || request !== version) return;
          current.current = { user, player: data };
          setAccount(current.current);
        } catch {
          if (active && request === version) setAccount({ user, player: null });
        }
      });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [router]);
  return <PlayerContext.Provider value={account}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const account = useContext(PlayerContext);
  if (!account) throw new Error("usePlayer requires PlayerProvider");
  return account;
}
