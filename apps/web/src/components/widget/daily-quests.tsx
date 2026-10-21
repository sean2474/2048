"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, ArrowRight } from "lucide-react";
import { DAILY_QUESTS, DailyQuestStateSchema } from "schema/daily-quests";
import { useI18n } from "ui/i18n";
import { usePlayer } from "@/hooks/use-player";
import { useLiveQuery } from "@/hooks/use-live-query";
import { Button } from "@/components/ui/button";
import { GameEmblem } from "./game-emblem";

export function DailyQuests({ userId }: { userId: string | null | undefined }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { walletBalance } = usePlayer();
  const load = useCallback(async (client: SupabaseClient) => {
    const response = await client.rpc("sync_daily_quests");
    const parsed = DailyQuestStateSchema.safeParse(response.data);
    if (response.error || !parsed.success || parsed.data.playerId !== userId) throw Error("Daily quests unavailable");
    return [parsed.data];
  }, [userId]);
  const query = useLiveQuery({ table: "match_participants", filter: userId ? `player_id=eq.${userId}` : undefined, enabled: !!userId, load });
  const state = !query.error ? query.data.find(item => item.playerId === userId) : undefined;
  const completed = state?.quests.filter(item => item.rewardedAt).length ?? 0;
  const earned = state?.quests.reduce((sum, item) => sum + (item.rewardedAt ? DAILY_QUESTS.find(quest => quest.id === item.id)!.coins : 0), 0) ?? 0;

  const previousBalance = useRef<{ userId: string; balance: number } | null>(null);
  useEffect(() => {
    if (!userId) { previousBalance.current = null; return; }
    if (!state) return;
    const previous = previousBalance.current;
    // An unchanged initial quest read must not fetch the entire page again.
    // A reward can change the wallet after SSR, so still reconcile that first read.
    const changed = previous?.userId === userId
      ? previous.balance !== state.balance
      : state.awarded > 0 || state.balance !== walletBalance;
    previousBalance.current = { userId, balance: state.balance };
    if (changed) router.refresh();
  }, [state, userId, walletBalance, router]);

  return <section aria-labelledby="daily-quests-title" className="rounded-2xl border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="daily-quests-title" className="flex items-center gap-2 text-lg font-bold"><GameEmblem kind="coin" className="size-9" />{t("Daily quests")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("Resets at midnight KST · Completed rewards are paid automatically here.")}</p></div>
      {state && <div className="text-right"><p className="text-sm font-bold tabular-nums">{t("{done} / {total} completed", { done: completed, total: DAILY_QUESTS.length })}</p><p className="mt-1 text-xs text-primary">{t("Earned today: {coins} coins", { coins: earned })}</p></div>}
    </div>
    {userId === undefined || userId && query.loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">{t("Loading daily quests…")}</p> : null}
    {query.error && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 p-3"><p className="text-sm text-destructive">{t("Could not load daily quests or confirm rewards.")}</p><Button variant="outline" onClick={query.reload}>{t("Retry daily quests")}</Button></div>}
    <ul className="mt-5 grid gap-3 sm:grid-cols-3">{DAILY_QUESTS.map(quest => {
      const progress = !query.error ? state?.quests.find(item => item.id === quest.id) : undefined;
      const rewarded = !!progress?.rewardedAt;
      return <li key={quest.id} data-quest-id={quest.id} className={`flex flex-col rounded-xl border p-4 ${rewarded ? "border-primary/30 bg-primary/5" : "bg-background/40"}`}>
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{t(quest.name)}</h3><span className="shrink-0 text-sm font-bold text-primary">+{quest.coins}<span className="sr-only"> {t("coins")}</span></span></div>
        <p className="mb-4 mt-2 text-xs leading-5 text-muted-foreground">{t(quest.description)}</p>
        <div className="mt-auto">{progress && <><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className={rewarded ? "flex items-center gap-1 font-semibold text-primary" : "text-muted-foreground"}>{rewarded && <Check aria-hidden="true" className="size-3.5" />}{t(rewarded ? "Coins received" : "In progress")}</span><span className="tabular-nums">{progress.progress} / {quest.target}</span></div><progress aria-label={t(quest.name)} value={progress.progress} max={quest.target} className="block h-2 w-full overflow-hidden rounded-full appearance-none [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" /></>}
        {userId && progress && !rewarded && quest.id !== "check-in" && <Link href="/find-match" className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2">{t("Find match")}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>}</div>
      </li>;
    })}</ul>
    {userId === null ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t("Sign in to complete daily quests and earn coins.")}</p><Button asChild variant="outline"><Link href="/login">{t("Log in")}</Link></Button></div> : <p className="mt-4 text-xs leading-5 text-muted-foreground">{t("Only saved casual or ranked matches against another account count. Friend matches, solo and guest play do not count.")}</p>}
    {state && !query.error && <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs"><time dateTime={state.day} className="text-muted-foreground">{state.day} · KST</time><Link href="/shop" className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"><GameEmblem kind="coin" className="size-6" />{t("My coins")}: {state.balance.toLocaleString(locale)}<ArrowRight aria-hidden="true" className="size-3.5" /></Link></div>}
  </section>;
}
