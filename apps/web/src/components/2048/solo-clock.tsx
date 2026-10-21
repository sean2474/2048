"use client";
import { useEffect, useState } from "react";
import { formatSoloTime, type SoloState } from "schema/solo";

export function SoloClock({ state, receivedAt }: { state: SoloState | null; receivedAt: number }) {
  const [now, setNow] = useState(receivedAt);
  useEffect(() => {
    setNow(receivedAt);
    if (state?.status !== "playing") return;
    const timer = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(timer);
  }, [state?.status, receivedAt]);
  return formatSoloTime(
    (state?.elapsedMs ?? 0) + (state?.status === "playing" ? Math.max(0, now - receivedAt) : 0),
  );
}
