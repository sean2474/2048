"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AchievementState } from "schema/achievements";
import { createClient } from "@/lib/supabase/client";
import { usePlayer } from "./use-player";
import { trackGameEvent } from "@/lib/analytics";

const Context = createContext<ReturnType<typeof useAchievementState> | null>(null);

function useAchievementState() {
  const { user } = usePlayer();
  const pathname = usePathname();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const [result, setResult] = useState<{ userId: string; data: AchievementState } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [checkInError, setCheckInError] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [newRewards, setNewRewards] = useState<string[]>([]);
  const version = useRef(0);
  const pending = useRef(false);
  const data = result?.userId === userId ? result?.data : undefined;

  const reload = useCallback(async () => {
    if (!userId || pending.current) return;
    pending.current = true;
    const request = ++version.current;
    setLoading(true); setError(false); setCheckInError(false);
    try {
      const client = createClient();
      const response = await client.rpc("sync_achievements");
      if (request !== version.current) return;
      if (response.error || !response.data?.attendance || !Array.isArray(response.data.unlocks)) throw Error("Achievements unavailable");
      const previous = response.data as AchievementState;
      setResult({ userId, data: previous });
      if (!previous.attendance.checkedInToday) {
        setCheckingIn(true);
        const checked = await client.rpc("check_in");
        if (request !== version.current) return;
        if (checked.error || !checked.data?.attendance || !Array.isArray(checked.data.unlocks)) { setCheckInError(true); return; }
        const next = checked.data as AchievementState;
        setResult({ userId, data: next });
        const unlocked = next.unlocks.filter(item => !previous.unlocks.some(old => old.achievementId === item.achievementId));
        setNewRewards(unlocked.map(item => item.achievementId));
        trackGameEvent("attendance_checked_in", { unlocked: unlocked.length });
      }
    } catch { if (request === version.current) setError(true); }
    finally { if (request === version.current) { pending.current = false; setCheckingIn(false); setLoading(false); } }
  }, [userId]);

  useEffect(() => {
    const generation = version;
    setResult(null); setError(false); setCheckInError(false); setCheckingIn(false); setLoading(false); setNewRewards([]); pending.current = false;
    void reload();
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { generation.current++; window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);

  useEffect(() => { if (pathname === "/achievements") void reload(); }, [pathname, reload]);

  return { data, loading: user === undefined || Boolean(userId && !data && !error) || loading, error, checkingIn, checkInError, reload, newRewards: data ? newRewards : [] };
}

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const value = useAchievementState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAchievements() {
  const value = useContext(Context);
  if (!value) throw Error("AchievementsProvider is missing");
  return value;
}
