import { MatchTime } from "@/components/widget/match-time";
import { Suspense } from "react";
import Link from "next/link";
import type { HistoryMatch, LeaderboardRow } from "schema/results";
import { SEASON_QUALIFYING_GAMES } from "schema/ranking";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/widget/page-heading";
import { GameEmblem } from "@/components/widget/game-emblem";
import { DemoBoard } from "@/components/widget/demo-board";
import { RankProgress } from "@/components/widget/rank-progress";
import { TierBadge } from "@/components/widget/tier-badge";
import { ProfileSkeleton, RecordsSkeleton } from "@/components/widget/records-skeleton";
import { LiveRecords, RefreshButton } from "@/components/widget/refresh-records";
import { getI18n } from "@/lib/i18n/server";
import { getAccount, getUser } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";
import { matchModeLabel } from "@/lib/match-labels";

export default async function DashboardPage() {
  const [{ t }, user] = await Promise.all([getI18n(), getUser()]);
  const userId = user && !user.is_anonymous ? user.id : undefined;
  return <main className="mx-auto max-w-[1040px] space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <PageHeading icon="profile" title={t("Dashboard")}><Button asChild variant="outline"><Link href="/tutorial" data-analytics-link="/tutorial"><GraduationCap aria-hidden="true" />{t("Play tutorial")}</Link></Button><Button asChild><Link href="/find-match" data-analytics-link="/find-match">{t("Find match")}<ArrowRight aria-hidden="true" /></Link></Button></PageHeading>
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
      <Suspense fallback={<ProfileSkeleton label={t("Loading ranked record…")} />}><PlayerProfile /></Suspense>
      <section aria-label={t("Game preview")} className="mx-auto w-full max-w-[380px] min-w-0"><DemoBoard /></section>
    </div>
    {userId && <>
      <LiveRecords tables="player_ratings,match_participants" filter={`player_id=eq.${userId}`} />
      <Suspense fallback={<RecordsSkeleton label={t("Loading recent matches…")} />}><RecentMatches userId={userId} /></Suspense>
    </>}
  </main>;
}

async function PlayerProfile() {
  const [{ t, locale }, { user, player }] = await Promise.all([getI18n(), getAccount()]);
  const userId = user && !user.is_anonymous ? user.id : undefined;
  const client = userId ? await createClient() : null;
  const { data: rating, error } = client ? await client.from("player_ratings")
    .select("player_id,display_name,rating,wins,losses,draws,games_played,highest_score,highest_tile,season_id,tier,placement_games,peak_rating,rank_seasons(name)")
    .eq("player_id", userId!).maybeSingle().returns<LeaderboardRow>() : { data: null, error: null };
  return <section aria-labelledby="profile-title" className="game-panel min-w-0 bg-card p-6 sm:p-8">
        {!userId ? <>
          <div className="mb-5 flex items-center gap-3"><GameEmblem kind="profile" className="size-12" /><h2 id="profile-title" className="text-xl font-bold">{t("Guest")}</h2></div>
          <p className="text-sm leading-7 text-muted-foreground">{t("Guests can play casual and friend matches.")}</p>
          <p className="mt-4 border-t pt-4 text-sm leading-7 text-muted-foreground">{t("Sign in to keep your match history and track your Elo, tier, and ranked results.")}</p>
          <div className="mt-5 flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/login" data-analytics-link="/login">{t("Log in")}</Link></Button><Button asChild variant="ghost"><Link href="/signup" data-analytics-link="/signup">{t("Create account")}</Link></Button></div>
        </> : <>
          <div className="mb-6"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Your player profile")}</p><h2 id="profile-title" className="break-words text-2xl font-extrabold tracking-tight">{player?.name || t("Player")}</h2></div>
          {error ? <div role="alert" className="space-y-3"><p className="text-sm leading-6 text-destructive">{t("Unable to load records. Please try again.")}</p><RefreshButton label="Retry rating" /></div> : !rating ? <div className="space-y-3 border-t pt-5"><p className="flex items-center gap-2 font-semibold"><GameEmblem kind="crown" className="size-8" />{t("Unrated")}</p><p className="text-sm leading-6 text-muted-foreground">{t("Your first 10 ranked matches establish your tier. Elo carries over between seasons.")}</p><Button asChild variant="outline"><Link href="/play/ranked" data-analytics-link="/play/ranked">{t("Play ranked")}<ArrowRight aria-hidden="true" /></Link></Button></div> : <>
            <div className="flex items-end justify-between gap-4 border-y py-5"><div><p className="mb-2 text-xs font-semibold text-muted-foreground">{rating.rank_seasons?.name}</p><TierBadge rating={rating.rating} tier={rating.tier} className="mb-2" /><p className="text-4xl font-extrabold tabular-nums tracking-tight">{rating.rating.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}<span className="ml-2 text-xs font-medium tracking-normal text-muted-foreground">{t("Elo")}</span></p></div><p className="text-right text-xs leading-5 text-muted-foreground">{t("Ranked record")}<br />{t(rating.games_played === 1 ? "{count} match" : "{count} matches", { count: rating.games_played })}</p></div>
            <div className="mt-4"><RankProgress rank={rating} rating={rating.rating} /></div>
            <div className="mt-4 space-y-3 rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-semibold">{rating.games_played >= SEASON_QUALIFYING_GAMES ? t("Season standings unlocked") : t("Season participation: {played}/{total}", { played: rating.games_played, total: SEASON_QUALIFYING_GAMES })}</p>
              <p className="text-xs leading-5 text-muted-foreground">{t("Elo and your established tier carry over. Play 10 ranked matches each season to enter its standings.")}</p>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3"><span className="text-xs font-semibold text-muted-foreground">{t("Season best")}</span>{rating.peak_rating == null ? <span className="text-xs text-muted-foreground">{t("No official result this season")}</span> : <><TierBadge rating={rating.peak_rating} /><span className="text-xs font-semibold tabular-nums">{rating.peak_rating.toLocaleString(locale)} ELO</span></>}</div>
            </div><dl className="mt-5 grid grid-cols-3 gap-4">{[{ label: t("Wins"), value: rating.wins }, { label: t("Losses"), value: rating.losses }, { label: t("Draws"), value: rating.draws }].map(item => <div key={item.label}><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{item.value}</dd></div>)}</dl>
          </>}
        </>}
      </section>;
}

async function RecentMatches({ userId }: { userId: string }) {
  const { t } = await getI18n();
  const client = await createClient();
  const { data, error } = await client.from("matches")
    .select("id,started_at,ended_at,reason,mode,ranked,match_participants(slot,player_id,display_name,score,max_tile,result,rating_before,rating_after,rating_delta),own:match_participants!inner(player_id)")
    .eq("own.player_id", userId).order("ended_at", { ascending: false }).order("id").limit(3).returns<HistoryMatch[]>();
  const recentMatches = (data ?? []).filter(match => match.match_participants.some(row => row.player_id === userId));
  return <section aria-labelledby="recent-matches-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="recent-matches-title" className="flex items-center gap-2 text-lg font-bold"><GameEmblem kind="history" className="size-9" />{t("Recent matches")}</h2><Link href="/history" data-analytics-link="/history" className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{t("View all history")}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
      {error ? <div role="alert" className="space-y-3 rounded-2xl border bg-card p-6"><p className="text-sm leading-6 text-destructive">{t("Unable to load records. Please try again.")}</p><RefreshButton label="Retry matches" /></div> : !recentMatches.length ? <div className="space-y-3 rounded-2xl border bg-card p-6"><p className="font-semibold">{t("No completed matches yet.")}</p><p className="text-sm leading-6 text-muted-foreground">{t("Your last three games will appear here.")}</p><Button asChild variant="outline"><Link href="/find-match" data-analytics-link="/find-match">{t("Find your first match")}<ArrowRight aria-hidden="true" /></Link></Button></div> : <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">{recentMatches.map(match => {
        const you = match.match_participants.find(row => row.player_id === userId);
        const opponent = match.match_participants.find(row => row.slot !== you?.slot);
        return <li key={match.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-1 text-xs font-bold ${you?.result === "win" ? "bg-[#edf0e9] text-[#52634b]" : "bg-muted text-muted-foreground"}`}>{you?.result === "win" ? t("Victory") : you?.result === "loss" ? t("Defeat") : t("Draw")}</span><span className="text-xs text-muted-foreground">{t(matchModeLabel[match.mode])}</span></div><h3 className="mt-2 break-words text-sm font-semibold">{t("vs")}{" "}{opponent?.display_name || t("Guest")}</h3></div><div className="text-right"><p className="font-bold tabular-nums"><span className="sr-only">{t("Your score")}{" "}</span>{you?.score ?? 0}<span className="px-2 font-normal text-muted-foreground">—</span><span className="sr-only">{t("Opponent score")}{" "}</span>{opponent?.score ?? 0}</p><MatchTime value={match.ended_at} dateOnly className="mt-1 block text-xs text-muted-foreground" /></div></li>;
      })}</ol>}
    </section>;
}
