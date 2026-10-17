import { getUser } from "@/lib/supabase/account";
import { formatSoloTime, type SoloRanking } from "schema/solo";
import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { LeaderboardRow } from "schema/results";
import { ratingTier, SEASON_QUALIFYING_GAMES, type RankSeason } from "schema/ranking";
import { LiveRecords, RefreshButton } from "@/components/widget/refresh-records";
import { RecordsSkeleton } from "@/components/widget/records-skeleton";
import { SeasonSelect } from "@/components/widget/season-select";
import { Button } from "@/components/ui/button";
import { TierBadge, TierIcon } from "@/components/widget/server-tier-badge";
import { ArrowLeft, ArrowRight, Crown, Swords, Trophy, Timer, UserPlus, Eye } from "lucide-react";
import "@/styles/leaderboard.css";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ season?: string; mode?: string }> }) {
  const [{ t, locale }, params] = await Promise.all([getI18n(), searchParams]);
  const solo = params.mode === "solo";
  const selectedSeason = typeof params.season === "string" ? params.season : "current";
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  return <main className="mx-auto max-w-[1120px] space-y-7 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <section aria-labelledby="leaderboard-title" className="rank-arena relative isolate overflow-hidden rounded-xl px-6 py-7 sm:px-9 sm:py-8">
      <div className="relative z-10 max-w-2xl">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-[#e6c888]"><Swords aria-hidden="true" className="size-4" />2048 DUO <span className="opacity-50">/</span> {t(solo ? "Single player" : "Ranked arena")}</p>
        <h1 id="leaderboard-title" className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t(solo ? "Time rankings" : "Ranked leaderboard")}</h1>
        <Button asChild className="mt-5 border-[#e7bd76] bg-[#e7bd76] text-[#342d1d] shadow-[0_3px_0_#a77e40] hover:bg-[#f1cf93] focus-visible:outline-[#f6d89b]">
          <Link href={solo ? "/solo" : "/play/ranked"}>{solo ? <Timer aria-hidden="true" /> : <Swords aria-hidden="true" />}{t(solo ? "Start time attack" : "Play ranked")}<ArrowRight aria-hidden="true" /></Link>
        </Button>
      </div>
      <div aria-hidden="true" className="absolute top-1/2 right-8 hidden -translate-y-1/2 items-end gap-1 md:flex lg:right-14">
        <TierIcon tier="Gold" className="mb-3 size-20 opacity-70" />
        <TierIcon tier="Master" className="size-36 -translate-y-2" />
        <TierIcon tier="Diamond" className="mb-3 size-20 opacity-70" />
      </div>
    </section>

    <div className="flex flex-wrap gap-2" role="group" aria-label={t("Rankings")}><Button asChild variant={solo ? "outline" : "default"}><Link href="/leaderboard" aria-current={!solo ? "page" : undefined}><Swords aria-hidden="true" />{t("Ranked match")}</Link></Button><Button asChild variant={solo ? "default" : "outline"}><Link href="/leaderboard?mode=solo" aria-current={solo ? "page" : undefined}><Timer aria-hidden="true" />{t("2048 time attack")}</Link></Button></div>
    {solo ? <Suspense fallback={<RecordsSkeleton label={t("Loading rankings…")} />}><SoloStandings /></Suspense> : <>
    <section aria-labelledby="tier-guide-title" className="rounded-xl border bg-card px-3 py-4 sm:px-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
        <h2 id="tier-guide-title" className="text-xs font-bold tracking-wide">{t("Competitive tiers")}</h2>
        <span className="text-[11px] text-muted-foreground">{t("Elo tier thresholds")}</span>
      </div>
      <dl className="rank-tier-trail grid grid-cols-3 gap-y-3 sm:grid-cols-6">
        {[0, 1000, 1200, 1400, 1600, 1800].map(rating => <div key={rating} className="relative flex flex-col items-center text-center">
          <dt className="flex flex-col items-center text-xs font-bold sm:text-sm"><TierIcon tier={ratingTier(rating)} className="relative z-10 mb-1 size-16" />{t(ratingTier(rating))}</dt>
          <dd className="mt-1 text-[11px] tabular-nums text-muted-foreground">{rating ? `${rating.toLocaleString(numberLocale)}+` : t("Below 1,000")}</dd>
        </div>)}
      </dl>
    </section>

    <Suspense key={selectedSeason} fallback={<RecordsSkeleton label={t("Loading leaderboard…")} rows={6} />}>
      <Standings selectedSeason={selectedSeason} />
    </Suspense>
    </>}
    <Button asChild variant="ghost"><Link href="/"><ArrowLeft aria-hidden="true" />{t("Back to dashboard")}</Link></Button>
  </main>;
}

async function Standings({ selectedSeason }: { selectedSeason: string }) {
  const { t, locale } = await getI18n();
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  let seasons: RankSeason[] = [], season: RankSeason | undefined, data: LeaderboardRow[] = [];
  let own: { rank_position: number; rating: number } | undefined;
  const user = await getUser();
  const userId = user && !user.is_anonymous ? user.id : undefined;
  let error = false;
  try {
    if (!isSupabaseConfigured()) throw new Error("Account services unavailable");
    const client = await createClient();
    const seasonResult = await client.from("rank_seasons").select("id,name,starts_at,ends_at").order("starts_at", { ascending: false });
    if (seasonResult.error) throw seasonResult.error;
    seasons = seasonResult.data as RankSeason[];
    season = selectedSeason === "current" ? seasons.find(row => row.ends_at === null) : seasons.find(row => row.id === selectedSeason);
    if (!season) throw new Error("Season unavailable");
    const result = await client.from(season.ends_at === null ? "player_ratings" : "season_ratings")
      .select("player_id,display_name,rating,wins,losses,draws,games_played,highest_score,highest_tile,season_id,tier,placement_games,peak_rating")
      .eq("season_id", season.id).gte("games_played", SEASON_QUALIFYING_GAMES)
      .order("rating", { ascending: false }).order("games_played", { ascending: false }).order("player_id").limit(50);
    if (result.error) throw result.error;
    data = result.data as LeaderboardRow[];
    if (userId) {
      const rank = await client.rpc("my_season_rank", { p_season: season.id }, { get: true });
      if (rank.error) throw rank.error;
      own = rank.data?.[0];
    }
  } catch { error = true; }
  return <>
    <OwnRanking solo={false} userId={userId} own={own} error={error} />
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{season?.name ?? t("Season standings")}{season?.ends_at && <span className="ml-2 font-normal text-muted-foreground">{t("Archived season")}</span>}</p><SeasonSelect selected={selectedSeason} seasons={seasons} /></div>

    {!error && data.length > 0 && <section aria-labelledby="podium-title">
      <h2 id="podium-title" className="mb-4 flex items-center gap-2 text-sm font-bold"><Crown aria-hidden="true" className="size-4 text-[#936a25]" />{t("Top 3 players")}</h2>
      <ol className={`rank-podium grid items-end gap-2 sm:gap-4 ${data.length === 1 ? "mx-auto max-w-sm grid-cols-1" : data.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {data.slice(0, 3).map((row, index) => <li key={row.player_id} className={`rank-podium-place min-w-0 text-center ${data.length >= 3 ? ["order-2", "order-1", "order-3"][index] : ""}`} data-place={index + 1}>
          <div className="px-1 pb-3 pt-4 sm:px-4">
            <p className="mb-1 flex min-h-5 items-center justify-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#6d5730]">{index === 0 && <Crown aria-hidden="true" className="size-3.5" />}{t(["1st place", "2nd place", "3rd place"][index])}</p>
            <TierIcon tier={row.tier!} className={`mx-auto ${index === 0 ? "size-20 sm:size-24" : "size-16 sm:size-20"}`} />
            <h3 title={row.display_name} className="mt-1 truncate text-sm font-extrabold sm:text-base">{row.display_name}</h3>
            <p className="mt-1 text-[10px] font-medium text-muted-foreground sm:text-xs">{t(row.tier!)}</p>
          </div>
          <div className="rank-podium-score px-1 py-3 sm:py-4"><span className="text-xl font-extrabold tabular-nums tracking-tight sm:text-2xl">{row.rating.toLocaleString(numberLocale)}</span><span className="ml-1 text-[10px] font-semibold opacity-70">{t("Elo")}</span></div>
        </li>)}
      </ol>
    </section>}


    <section aria-labelledby="standings-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="standings-title" className="flex items-center gap-2 text-sm font-bold"><Trophy aria-hidden="true" className="size-4 text-[#52634b]" />{t("Player standings")}<span className="rounded-md border bg-card px-2 py-1 text-[10px] tracking-wide text-muted-foreground">TOP 50</span></h2>
        {!season?.ends_at && <LiveRecords tables="player_ratings,rank_seasons" status />}
      </div>
      {error ? <div role="alert" className="space-y-4 rounded-2xl border bg-card p-8"><p className="text-sm leading-6 text-destructive">{t("Unable to load records. Please try again.")}</p><RefreshButton /></div>
        : !data.length ? <div className="space-y-4 rounded-2xl border border-dashed border-[#cfc5ae] bg-card px-6 py-10 text-center"><TierIcon tier="Bronze" className="mx-auto size-24" /><h2 className="text-xl font-bold tracking-tight">{t("No ranked players yet.")}</h2><p className="text-sm leading-6 text-muted-foreground">{t("Players appear here after completing 10 ranked matches in this season.")}</p><Button asChild><Link href="/play/ranked">{t("Play ranked")}<ArrowRight aria-hidden="true" /></Link></Button></div>
        : <div role="region" aria-label={t("Ranked player standings")} tabIndex={0} className="overflow-x-auto rounded-2xl border bg-card shadow-[0_4px_0_#e8e3d7] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          <table className="rank-table w-full text-left text-sm">
            <caption className="sr-only">{t("2048 Duo ranked player standings")}</caption>
            <thead><tr className="bg-[#eeeee6] text-[11px] text-muted-foreground">
              <th scope="col">{t("Rank")}</th><th scope="col">{t("Player")}</th><th scope="col" className="hidden md:table-cell">{t("Tier")}</th><th scope="col" className="text-right">{t("Elo")}</th><th scope="col" className="hidden text-right lg:table-cell">{t("Wins")}</th><th scope="col" className="hidden text-right lg:table-cell">{t("Played")}</th><th scope="col" className="text-right">{t("Win rate")}</th><th scope="col">{t("Player actions")}</th>
            </tr></thead>
            <tbody>{data.map((row, index) => {
              const winRate = row.games_played ? Math.round(row.wins / row.games_played * 100) : 0;
              return <tr key={row.player_id} className="border-t transition-colors hover:bg-[#f8f7f0]" data-place={index + 1}>
                <td><span className="rank-position inline-grid size-8 place-items-center rounded-lg text-xs font-extrabold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span></td>
                <th scope="row" className="font-semibold"><span title={row.display_name} className="block max-w-28 truncate sm:max-w-52">{row.display_name}</span><TierBadge t={t} tier={row.tier} rating={row.rating} className="mt-1 md:hidden" /></th>
                <td className="hidden md:table-cell"><TierBadge t={t} tier={row.tier} rating={row.rating} /></td>
                <td className="text-right text-base font-extrabold tabular-nums tracking-tight">{row.rating.toLocaleString(numberLocale)}</td>
                <td className="hidden text-right tabular-nums lg:table-cell">{row.wins}</td>
                <td className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{row.games_played}</td>
                <td className="text-right"><span className="font-bold tabular-nums">{winRate}%</span><span className="mt-1 block whitespace-nowrap text-[10px] text-muted-foreground lg:hidden">{t("{wins}W / {played} played", { wins: row.wins, played: row.games_played })}</span><span aria-hidden="true" className="mt-1.5 ml-auto hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted lg:block"><span className="block h-full rounded-full bg-[#77916b]" style={{ width: `${winRate}%` }} /></span></td>
                <td><div className="flex gap-1"><Button asChild variant="ghost" size="icon"><Link href={`/friends?player=${row.player_id}`} aria-label={t("Add {name} as a friend", { name: row.display_name })} title={t("Add friend")}><UserPlus aria-hidden="true" className="size-4" /></Link></Button>{!season?.ends_at && <Button asChild variant="ghost" size="icon"><Link href={`/watch/${row.player_id}`} aria-label={t("Watch {name}", { name: row.display_name })} title={t("Watch")}><Eye aria-hidden="true" className="size-4" /></Link></Button>}</div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      <p className="px-1 text-xs leading-6 text-muted-foreground">{t("Top 50 after 10 ranked matches this season, ordered by Elo then matches played. Tiers follow Elo automatically. Elo carries over between seasons. Casual and friend matches never change your rating.")}</p>
    </section>
  </>;
}

async function OwnRanking({ solo, userId, own, error }: { solo: boolean; userId?: string; own?: { rank_position: number; elapsed_ms?: number; rating?: number }; error: boolean }) {
  const { t, locale } = await getI18n();
  return <section aria-label={t("My ranking")} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/25 bg-card px-5 py-4"><div><h2 className="text-xs font-semibold text-muted-foreground">{t("My ranking")}</h2><p className="mt-2 text-lg font-bold">{!userId ? t("Sign in to see your rank") : error ? t("Unable to load records. Please try again.") : own ? t("Rank {rank}", { rank: own.rank_position }) : t(solo ? "No solo finish yet" : "Complete 10 ranked matches to enter the standings.")}</p></div>{!userId ? <Button asChild variant="outline"><Link href="/login">{t("Log in")}</Link></Button> : own && !error ? <p className="text-2xl font-extrabold tabular-nums">{solo ? formatSoloTime(own.elapsed_ms!) : `${own.rating?.toLocaleString(locale)} ELO`}</p> : null}</section>;
}

async function SoloStandings() {
  const [{ t }, user] = await Promise.all([getI18n(), getUser()]);
  const userId = user && !user.is_anonymous ? user.id : undefined;
  let rows: SoloRanking[] = [], own: { rank_position: number; elapsed_ms: number } | undefined, error = false;
  try {
    const client = await createClient();
    const [records, rank] = await Promise.all([
      client.rpc("solo_leaderboard", {}, { get: true }),
      userId ? client.rpc("my_solo_rank", {}, { get: true }) : Promise.resolve({ data: null, error: null }),
    ]);
    if (records.error || rank.error) throw records.error || rank.error;
    rows = records.data ?? []; own = rank.data?.[0];
  } catch { error = true; }
  return <>
    <OwnRanking solo userId={userId} own={own} error={error} />
    <LiveRecords tables="solo_records" />
    <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="solo-ranking-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 id="solo-ranking-title" className="font-bold">{t("Time rankings")} <span className="text-xs font-normal text-muted-foreground">4 × 4</span></h2><p className="mt-1 text-xs text-muted-foreground">{t("Top 50 · Best time per player · Ties use fewer moves, then the earlier finish.")}</p></div><RefreshButton label="Refresh" /></div>
      {error ? <p role="alert" className="p-5 text-sm text-destructive">{t("Unable to load records. Please try again.")}</p> : !rows.length ? <p className="p-5 text-sm text-muted-foreground">{t("The first record is waiting for you.")}</p> : <ol className="divide-y">{rows.map((row, index) => <li key={row.player_id} className={`flex items-center gap-3 px-5 py-4 ${row.player_id === userId ? "bg-primary/5" : ""}`}><span className="w-7 text-sm font-bold tabular-nums text-muted-foreground">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}{row.player_id === userId && <span className="ml-2 text-xs text-primary">{t("You")}</span>}</span><div className="text-right"><p className="font-bold tabular-nums">{formatSoloTime(row.elapsed_ms)}</p><p className="text-xs text-muted-foreground">{t("{count} moves", { count: row.moves })}</p></div></li>)}</ol>}
    </section>
  </>;
}
