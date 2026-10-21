"use client";

import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { analyticsEnabled, sanitizeAnalyticsEvent, trackNavigation } from "@/lib/analytics";

export function GameAnalytics() {
  const enabled = analyticsEnabled();
  useEffect(() => {
    if (!enabled) return;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest("a[data-analytics-link]");
      if (link) trackNavigation(link.getAttribute("data-analytics-link"));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [enabled]);
  if (!enabled) return null;
  return (
    <>
      <Analytics beforeSend={sanitizeAnalyticsEvent} debug={false} />
      <SpeedInsights beforeSend={sanitizeAnalyticsEvent} debug={false} />
    </>
  );
}
