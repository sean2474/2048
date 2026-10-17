"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function RefreshButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())}>{t(label)}</Button>;
}

export function LiveRecords({ tables, filter, status = false }: { tables: string; filter?: string; status?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [live, setLive] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const client = createClient();
    let active = true, subscribed = false;
    let debounce: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(debounce);
      debounce = setTimeout(() => { if (active) startTransition(() => router.refresh()); }, 250);
    };
    let channel = client.channel(`records:${tables}:${filter ?? "all"}`);
    for (const table of tables.split(",")) channel = channel.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, refresh);
    channel.subscribe(value => {
      if (!active) return;
      setLive(value === "SUBSCRIBED");
      if (value === "SUBSCRIBED") {
        if (subscribed) refresh();
        subscribed = true;
      }
    });
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearTimeout(debounce); clearInterval(interval);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      void client.removeChannel(channel);
    };
  }, [tables, filter, router]);
  return status ? <span role="status" aria-busy={pending} className="text-xs text-muted-foreground">{t(live ? "Live updates" : "Connecting to live updates…")}</span> : null;
}
