"use client";
import { useI18n } from "ui/i18n";
import Link from "next/link";
import { PageHeading } from "@/components/widget/page-heading";
import { GameEmblem } from "@/components/widget/game-emblem";
import { useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryMatch } from "schema/results";
import { TierBadge } from "@/components/widget/tier-badge";
import { usePlayer } from "@/hooks/use-player";
import { useLiveQuery } from "@/hooks/use-live-query";
import { Button } from "@/components/ui/button";
import { matchModeLabel } from "@/lib/multiplayer";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
const reasons = { reached_2048: "Reached 2048", opponent_locked: "No moves remaining", surrender: "Surrender", opponent_disconnected: "Disconnected", draw: "Both boards stuck" };
export default function HistoryPage() {
  const { t, locale } = useI18n();
  const { user } = usePlayer();
  const load = useCallback(async (client: SupabaseClient) => {
    const { data, error } = await client.from("matches").select("id,started_at,ended_at,reason,mode,ranked,match_participants(slot,player_id,display_name,score,max_tile,result,rating_before,rating_after,rating_delta)").order("ended_at", { ascending: false }).order("id").limit(20);
    if (error) throw error;
    return data as HistoryMatch[];
  }, []);
  const { data, loading, error, live, reload } = useLiveQuery({ table: "match_participants", filter: user ? `player_id=eq.${user.id}` : undefined, enabled: !!user && !user.is_anonymous, load });
  return <main className="mx-auto max-w-[960px] space-y-6 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <PageHeading icon="history" title={t("Your match history")} />
    {user === undefined ? <div role="status" className="flex min-h-52 items-center justify-center gap-3 game-panel bg-card text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />{t("Checking your account…")}</div> : !user || user.is_anonymous ? <div className="space-y-4 game-panel bg-card px-6 py-10 shadow-sm sm:p-8"><GameEmblem kind="history" className="size-16" /><h2 className="text-xl font-bold">{t("Login required")}</h2><p className="text-sm leading-6 text-muted-foreground">{t("Sign in before starting a game to save your results.")}</p><Button asChild><Link href="/login">{t("Log in")}<ArrowRight aria-hidden="true" /></Link></Button></div> : <>
      <p role="status" className="text-xs text-muted-foreground">{t("Latest 20 matches ·")}{" "}{live ? t("Live updates") : t("Connecting to live updates…")}</p>
      {error ? <div role="alert" className="space-y-4 game-panel bg-card p-6"><p className="text-sm leading-6 text-destructive">{t(error)}</p><Button onClick={reload}>{t("Try again")}</Button></div> : loading ? <div role="status" className="flex min-h-52 items-center justify-center gap-3 game-panel bg-card text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />{t("Loading matches…")}</div> : !data.length ? <div className="space-y-4 game-panel bg-card p-8 shadow-sm"><h2 className="text-xl font-bold">{t("No completed matches yet.")}</h2><p className="text-sm leading-6 text-muted-foreground">{t("Completed matches will appear here automatically.")}</p><Button asChild><Link href="/play/online">{t("Find a match")}<ArrowRight aria-hidden="true" /></Link></Button></div> : <ol className="space-y-4">{data.map(match => {
        const you = match.match_participants.find(row => row.player_id === user.id);
        const opponent = match.match_participants.find(row => row.slot !== you?.slot);
        return <li key={match.id} className="overflow-hidden game-panel bg-card shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3 sm:px-6"><span className={`rounded-md px-2.5 py-1 text-xs font-bold ${you?.result === "win" ? "bg-[#edf0e9] text-[#52634b]" : you?.result === "loss" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{you?.result === "win" ? t("Victory") : you?.result === "loss" ? t("Defeat") : t("Draw")}</span><time dateTime={match.ended_at} className="text-xs text-muted-foreground">{new Date(match.ended_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}</time></div><div className="space-y-4 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="mb-1 text-xs font-medium text-muted-foreground">{t(matchModeLabel[match.mode])}</p><h2 className="break-words text-lg font-bold">{t("vs")}{" "}{opponent?.display_name || t("Guest")}</h2></div><p className="text-2xl font-bold tabular-nums tracking-tight"><span className="sr-only">{t("Your score")}{" "}</span>{you?.score ?? 0}<span className="px-2 text-muted-foreground/50">—</span><span className="sr-only">{t("Opponent score")}{" "}</span><span className="text-muted-foreground">{opponent?.score ?? 0}</span></p></div><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span>{t("Best tile")}{" "}<strong className="font-semibold text-foreground">{you?.max_tile ?? 0}</strong></span><span>{t(reasons[match.reason])}</span></div>{you?.rating_before != null && you.rating_after != null && you.rating_delta != null && <p className="flex flex-wrap items-center gap-1 border-t pt-4 text-sm font-medium tabular-nums"><TierBadge rating={you.rating_after} /> <span className="px-1 text-muted-foreground">·</span> {t("Elo")}{" "}{you.rating_before} → {you.rating_after} <span className={you.rating_delta > 0 ? "text-[#52634b]" : "text-primary"}>({you.rating_delta > 0 ? "+" : ""}{you.rating_delta})</span></p>}</div></li>;
      })}</ol>}
    </>}
    <Button asChild variant="ghost"><Link href="/"><ArrowLeft aria-hidden="true" />{t("Back to dashboard")}</Link></Button>
  </main>;
}
