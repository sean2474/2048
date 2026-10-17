"use client";
import { useI18n } from "ui/i18n";
import { useEffect, useId, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type LiveTable = "player_stats" | "player_ratings" | "match_participants" | "solo_records" | "friendships" | "direct_messages";
type Options<T> = { table: LiveTable | readonly LiveTable[]; filter?: string; enabled?: boolean; load: (client: SupabaseClient) => Promise<T[]> };
export function useLiveQuery<T>({ table, filter, enabled = true, load }: Options<T>) {
  const { t } = useI18n();
  const subscriptionId = useId();
  const tables = typeof table === "string" ? table : table.join(",");
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setData([]); setError(""); setLive(false);
    if (!enabled) { setLoading(false); return; }
    if (!isSupabaseConfigured()) { setError("Account services are not configured yet."); setLoading(false); return; }
    const client = createClient();
    let active = true, pending = false, queued = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    async function refresh() {
      if (!active) return;
      if (pending) { queued = true; return; }
      pending = true;
      try {
        const rows = await load(client);
        if (active) { setData(rows); setError(""); }
      } catch {
        if (active) setError("Unable to load records. Please try again.");
      } finally {
        pending = false;
        if (active) setLoading(false);
        if (queued) { queued = false; schedule(); }
      }
    }
    const schedule = () => {
      if (!active || document.visibilityState === "hidden") return;
      clearTimeout(debounce); debounce = setTimeout(() => void refresh(), 150);
    };
    void refresh();
    // Widgets watching the same rows still need independent subscription lifetimes.
    const channel = client.channel(`duo:${tables}:${filter || "all"}:${subscriptionId}`);
    for (const name of tables.split(",")) channel.on("postgres_changes", { event: "*", schema: "public", table: name, ...(filter ? { filter } : {}) }, schedule);
    channel.on("system", {}, message => {
        if (!active || message.extension !== "postgres_changes") return;
        setLive(message.status === "ok");
        // The WebSocket may join before PostgreSQL starts delivering changes.
        if (message.status === "ok") schedule();
      })
      .subscribe(status => {
        if (!active) return;
        if (status !== "SUBSCRIBED") setLive(false);
      });
    // Recover missed updates after network sleep even if a channel stayed subscribed.
    const interval = setInterval(schedule, 30_000);
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("online", schedule);
    return () => {
      active = false; clearInterval(interval); clearTimeout(debounce);
      window.removeEventListener("online", schedule); document.removeEventListener("visibilitychange", schedule); void client.removeChannel(channel);
    };
  }, [tables, filter, enabled, load, retry, subscriptionId]);
  return { data, loading, error: t(error), live, reload: () => setRetry(value => value + 1) };
}
