"use client";

import { useEffect, useState } from "react";
import { useI18n } from "ui/i18n";
import { COIN_REASON_LABELS } from "schema/economy";
import { createClient } from "@/lib/supabase/client";

const REASON_LABELS: Record<string, string> = COIN_REASON_LABELS;
type Entry = { id: number; delta: number; balance_after: number; reason: string; created_at: string };
const LIMIT = 8;

// `balance` is only a dependency: the list reloads after every purchase or quest reward.
export function CoinHistory({ userId, balance }: { userId: string | undefined; balance: number | undefined }) {
  const { t, locale } = useI18n();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void createClient().from("coin_transactions").select("id,delta,balance_after,reason,created_at").eq("player_id", userId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(LIMIT)
      .then(({ data, error: failure }) => {
        if (!active) return;
        setError(Boolean(failure));
        if (!failure) setEntries((data ?? []).filter((row): row is Entry => Number.isSafeInteger(row.delta) && Number.isSafeInteger(row.balance_after) && typeof row.reason === "string" && typeof row.created_at === "string"));
      });
    return () => { active = false; };
  }, [userId, balance]);
  if (!userId) return null;
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  return <section aria-labelledby="coin-history-title" className="space-y-2 rounded-xl border bg-card px-4 py-3">
    <h2 id="coin-history-title" className="text-xs text-muted-foreground">{t("Recent coin activity")}</h2>
    {error ? <p role="alert" className="text-xs text-destructive">{t("Could not load your coin activity.")}</p>
      : entries === null ? <p role="status" className="text-xs">{t("Loading…")}</p>
      : !entries.length ? <p className="text-xs text-muted-foreground">{t("No coin activity yet.")}</p>
      : <ol className="divide-y text-sm">{entries.map(entry => <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0"><p className="font-semibold">{t(REASON_LABELS[entry.reason] ?? "Coin change")}</p><p className="text-[11px] text-muted-foreground">{new Date(entry.created_at).toLocaleString(numberLocale, { dateStyle: "medium", timeStyle: "short" })}</p></div>
        <div className="text-right tabular-nums"><p className={`font-semibold ${entry.delta > 0 ? "text-primary" : "text-destructive"}`}>{entry.delta > 0 ? "+" : ""}{entry.delta.toLocaleString(numberLocale)}</p><p className="text-[11px] text-muted-foreground">{t("Balance {count}", { count: entry.balance_after.toLocaleString(numberLocale) })}</p></div>
      </li>)}</ol>}
  </section>;
}
