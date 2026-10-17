import { track } from "@vercel/analytics";
import type { MatchMode } from "schema/in-game";
import type { SkinId, SkinRarity } from "schema/loadout";
import type { PlayerIconId } from "schema/profile-icons";

const pages = new Set(["/", "/find-match", "/leaderboard", "/how-to-play", "/tutorial", "/settings", "/feedback", "/login", "/signup", "/loadout", "/achievements", "/shop", "/history", "/play/online", "/play/ranked", "/play/create", "/play/join"]);

export function analyticsEnabled() {
  return process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_APP_ENV === "production" && process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
}

export function sanitizeAnalyticsEvent<T extends { url: string; route?: string }>(event: T): T | null {
  if (!analyticsEnabled()) return null;
  try {
    const url = new URL(event.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const path = pages.has(url.pathname) ? url.pathname : /^\/play\/[^/]+\/?$/.test(url.pathname) ? "/play/[id]" : null;
    if (!path) return null;
    return { ...event, url: `${url.origin}${path}`, ...("route" in event ? { route: path } : {}) };
  } catch { return null; }
}

type Events = {
  navigation_clicked: { destination: string };
  queue_started: { mode: "casual" | "ranked" };
  queue_cancel_clicked: { mode: "casual" | "ranked" };
  match_started: { mode: MatchMode };
  match_finished: { mode: MatchMode; outcome: "win" | "loss" | "draw" };
  cosmetic_previewed: { item: SkinId | PlayerIconId; source: "loadout" | "shop" };
  cosmetic_equipped: { category: "skins" | "icons"; item: SkinId | PlayerIconId };
  skin_filter_changed: { rarity: SkinRarity | "all"; source: "loadout" | "shop" };
  merge_previewed: { skin: SkinId; sound: boolean };
  attendance_checked_in: { unlocked: number };
};

export function trackGameEvent<K extends keyof Events>(name: K, properties: Events[K]) {
  if (!analyticsEnabled() || typeof window === "undefined") return;
  try { track(name, properties); }
  catch { /* Optional telemetry must never interrupt a game or a saved preference. */ }
}

export function trackNavigation(destination: string | null) {
  if (destination && pages.has(destination)) trackGameEvent("navigation_clicked", { destination });
}

const lastTrackedMatch = new Map<string, string>();
export function trackMatchEvent<K extends "match_started" | "match_finished">(name: K, roomId: string, properties: Events[K]) {
  if (!analyticsEnabled() || typeof window === "undefined" || lastTrackedMatch.get(name) === roomId) return;
  const key = `2048duo:analytics:${name}`;
  lastTrackedMatch.set(name, roomId);
  try {
    if (sessionStorage.getItem(key) === roomId) return;
    // This identifier stays in the tab; it is never included in analytics payloads.
    sessionStorage.setItem(key, roomId);
  } catch { /* In-memory deduplication still covers reconnects when storage is blocked. */ }
  trackGameEvent(name, properties);
}
