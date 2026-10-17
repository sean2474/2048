"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { AchievementState } from "schema/achievements";
import { createClient } from "@/lib/supabase/client";

export function useAchievements(user: User | null | undefined) {
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const [result, setResult] = useState<{ userId: string; data: AchievementState } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [checkInError, setCheckInError] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const version = useRef(0);
  const pending = useRef(false);
  const data = result?.userId === userId ? result?.data : undefined;

  const reload = useCallback(async () => {
    if (!userId || pending.current) return;
    const request = ++version.current;
    setLoading(true); setError(false);
    try {
      const response = await createClient().rpc("sync_achievements");
      if (response.error || !response.data?.attendance || !Array.isArray(response.data.unlocks)) throw new Error("Achievements unavailable");
      if (request === version.current) setResult({ userId, data: response.data as AchievementState });
    } catch { if (request === version.current) setError(true); }
    finally { if (request === version.current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    const generation = version;
    setResult(null); setError(false); setCheckInError(false); setCheckingIn(false); setLoading(false); pending.current = false;
    void reload();
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 60_000);
    return () => { generation.current++; window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);

  const checkIn = async () => {
    if (!userId || pending.current || !data || data.attendance.checkedInToday) return;
    pending.current = true;
    const request = ++version.current;
    setCheckingIn(true); setCheckInError(false);
    try {
      const response = await createClient().rpc("check_in");
      if (response.error || !response.data?.attendance || !Array.isArray(response.data.unlocks)) throw new Error("Check-in unavailable");
      if (request === version.current) {
        const next = response.data as AchievementState;
        setResult({ userId, data: next });
        return next.unlocks.filter(item => !data.unlocks.some(previous => previous.achievementId === item.achievementId));
      }
    } catch { if (request === version.current) setCheckInError(true); }
    finally { if (request === version.current) { pending.current = false; setCheckingIn(false); setLoading(false); } }
  };

  return { data, loading: user === undefined || Boolean(userId && !data && !error) || loading, error, checkingIn, checkInError, reload, checkIn };
}
