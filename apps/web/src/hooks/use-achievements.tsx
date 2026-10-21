"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { syncAchievementsAction } from "@/actions/achievements";
import type { AchievementSnapshot, AchievementSyncResult } from "@/lib/achievement-operations";
import { usePlayer } from "./use-player";
import { trackGameEvent } from "@/lib/analytics";

const Context = createContext<ReturnType<typeof useAchievementState> | null>(null);

function useAchievementState(initialAchievements?: AchievementSnapshot) {
  const { user } = usePlayer();
  const pathname = usePathname();
  const router = useRouter();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const [result, setResult] = useState<AchievementSnapshot>(initialAchievements ?? { error: false });
  const [activity, setActivity] = useState<{ userId?: string; loading: boolean; checkInError: boolean; newRewards: string[] }>({ loading: false, checkInError: false, newRewards: [] });
  const version = useRef(0);
  const pending = useRef<{ userId: string; promise: Promise<AchievementSyncResult> } | null>(null);
  const latest = useRef(initialAchievements);
  const data = result.userId === userId ? result.data : undefined;
  const error = result.userId === userId && result.error;
  const ownActivity = activity.userId === userId ? activity : undefined;

  useEffect(() => {
    if (initialAchievements?.userId !== userId) return;
    latest.current = initialAchievements;
    setResult(initialAchievements ?? { error: false });
  }, [initialAchievements, userId]);

  const reload = useCallback(async () => {
    if (!userId) return;
    const request = ++version.current;
    setActivity(previous => ({ userId, loading: true, checkInError: false, newRewards: previous.userId === userId ? previous.newRewards : [] }));
    // Strict-mode effect replay and simultaneous focus/online events share one action.
    const promise = pending.current?.userId === userId ? pending.current.promise : syncAchievementsAction();
    pending.current = { userId, promise };
    try {
      const next = await promise;
      if (request !== version.current) return;
      if (next.userId !== userId) {
        setResult({ userId, error: true });
        router.refresh();
        return;
      }
      const previous = latest.current;
      latest.current = next;
      setResult(next);
      setActivity({ userId, loading: false, checkInError: next.checkInError, newRewards: next.newRewards });
      if (next.checkedIn) trackGameEvent("attendance_checked_in", { unlocked: next.newRewards.length });
      if (next.changed || next.data && previous?.userId === userId && (previous.error || JSON.stringify(previous.data) !== JSON.stringify(next.data))) router.refresh();
    } catch {
      if (request === version.current) setResult({ userId, error: true });
    } finally {
      if (pending.current?.promise === promise) pending.current = null;
      if (request === version.current) setActivity(previous => ({ ...previous, loading: false }));
    }
  }, [userId, router]);

  useEffect(() => {
    const generation = version;
    void reload();
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { generation.current++; window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);

  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname && pathname === "/achievements") void reload();
    previousPath.current = pathname;
  }, [pathname, reload]);

  return {
    data, loading: Boolean(userId && !data && !error) || Boolean(ownActivity?.loading), error,
    checkingIn: Boolean(ownActivity?.loading && !data?.attendance.checkedInToday),
    checkInError: ownActivity?.checkInError ?? false, reload, newRewards: data ? ownActivity?.newRewards ?? [] : [],
  };
}

export function AchievementsProvider({ children, initialAchievements }: { children: ReactNode; initialAchievements?: AchievementSnapshot }) {
  const value = useAchievementState(initialAchievements);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAchievements() {
  const value = useContext(Context);
  if (!value) throw Error("AchievementsProvider is missing");
  return value;
}
