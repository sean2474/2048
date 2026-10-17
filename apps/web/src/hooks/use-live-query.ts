"use client";
import { useI18n } from "ui/i18n";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Options<T> = { table: "player_stats" | "player_ratings" | "match_participants" | "solo_records"; filter?: string; enabled?: boolean; load: (client: SupabaseClient) => Promise<T[]> };
export function useLiveQuery<T>({ table, filter, enabled = true, load }: Options<T>) {
  const { t } = useI18n();
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
    let active = true, request = 0;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    async function refresh() {
      const current = ++request;
      try {
        const rows = await load(client);
        if (active && current === request) { setData(rows); setError(""); }
      } catch {
        if (active && current === request) setError("Unable to load records. Please try again.");
      } finally { if (active && current === request) setLoading(false); }
    }
    const schedule = () => { clearTimeout(debounce); debounce = setTimeout(() => void refresh(), 150); };
    void refresh();
    const channel = client.channel(`duo:${table}:${filter || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, schedule)
      .on("system", {}, message => {
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
    const interval = setInterval(() => void refresh(), 30_000);
    window.addEventListener("online", schedule);
    return () => {
      active = false; clearInterval(interval); clearTimeout(debounce);
      window.removeEventListener("online", schedule); void client.removeChannel(channel);
    };
  }, [table, filter, enabled, load, retry]);
  return { data, loading, error: t(error), live, reload: () => setRetry(value => value + 1) };
}
