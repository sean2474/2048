
import { getI18n } from "@/lib/i18n/server";
import { RefreshButton } from "@/components/refresh-button";
import { PlayerAccess } from "@/components/player-access";

import Link from "next/link";
import { adminTime, listReturn } from "@/lib/investigation";
import type { AdminPlayerDetail } from "schema/admin";
import { createClient } from "@/lib/supabase/server";
import { Button } from "ui/button";

export default async function AdminPlayerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const [{ t, locale }, { id }, search, client] = await Promise.all([getI18n(), params, searchParams, createClient()]);
  let data: AdminPlayerDetail | null = null, error = "";
  try {
    const result = await client.rpc("admin_player", { p_user_id: id });
    if (result.error) throw new Error(result.error.code === "P0002" ? "This player was not found." : "Player details could not be loaded. Check your connection and administrator access, then try again.");
    data = result.data as AdminPlayerDetail;
  } catch (failure) { error = failure instanceof Error ? failure.message : "Player details could not be loaded. Check your connection and administrator access, then try again."; }
  const player = data?.player;
  return <section className="space-y-6" aria-labelledby="player-heading">
    <div className="flex justify-between items-center gap-4"><Button asChild variant="outline"><Link href={listReturn(typeof search.returnTo === "string" ? search.returnTo : null, "/players")}>{t("Back to players")}</Link></Button><RefreshButton /></div>
    {error ? <p role="alert" className="admin-error">{t(error)}</p> : data && player && <>
      <div className="admin-panel p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-4"><span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-secondary text-xl font-semibold text-secondary-foreground">{(player.name || player.username || "P").slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="admin-eyebrow mb-2">{t("Player profile")}</p><h1 id="player-heading" className="admin-title break-words">{player.name || player.username || t("Unnamed player")}</h1><p className="mt-2 text-sm break-all text-muted-foreground">{player.email ?? t("No email")}</p><p className="mt-2 text-[10px] text-muted-foreground break-all">{player.id}</p></div></div>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 border-t pt-6 text-sm">
          <div><dt className="admin-eyebrow mb-2">{t("Status")}</dt><dd><span className={`admin-badge ${player.isAdmin ? "admin-badge-warm" : player.suspendedAt ? "admin-badge-danger" : "admin-badge-positive"}`}>{t(player.isAdmin ? "Administrator" : player.suspendedAt ? "Suspended" : "Active")}</span></dd></div>
          <div><dt className="admin-eyebrow mb-2">{t("Elo / tier")}</dt><dd className="flex flex-wrap items-center gap-2"><strong className="tabular-nums">{player.rating.toLocaleString(locale)}</strong><span className="admin-badge">{t(player.tier ?? "Evaluating")}</span></dd></div>
          <div><dt className="admin-eyebrow mb-2">{t("Ranked W / L / D")}</dt><dd className="font-semibold tabular-nums">{player.wins.toLocaleString(locale)} <span className="mx-1 font-normal text-muted-foreground">/</span> {player.losses.toLocaleString(locale)} <span className="mx-1 font-normal text-muted-foreground">/</span> {player.draws.toLocaleString(locale)}</dd></div>
          <div><dt className="admin-eyebrow mb-2">{t("Joined")}</dt><dd className="text-xs leading-5">{adminTime(player.createdAt, locale)}</dd></div>
        </dl>
        {player.suspendedAt && <p className="admin-error break-words">{t("Suspended {date}", { date: adminTime(player.suspendedAt, locale) })} · {player.suspensionReason}</p>}
      </div>
      <section className="admin-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10" aria-labelledby="access-heading">
        <div><h2 id="access-heading" className="admin-section-title">{t("Match access")}</h2>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">{t("Suspension blocks this account from starting new casual, ranked and friend matches. Existing matches and reconnections continue. It does not block anonymous guest play.")}</p></div>
        {player.isAdmin ? <p className="text-sm">{t("Administrator accounts cannot be suspended here.")}</p> : <PlayerAccess key={`${player.id}:${player.suspendedAt}`} player={{ id: player.id, name: player.name, email: player.email, suspendedAt: player.suspendedAt }} />}
      </section>
      <section className="space-y-4" aria-labelledby="recent-matches-heading">
        <h2 id="recent-matches-heading" className="admin-section-title">{t("Latest 20 matches")}</h2><Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href={`/matches?player=${id}`}>{t("View all matches")}</Link>
        {!data.matches.length ? <p className="admin-state">{t("No saved matches for this player.")}</p> : <div className="admin-panel overflow-x-auto" role="region" aria-label={t("Player match history table")} tabIndex={0}><table className="w-full text-sm text-left"><caption className="sr-only">{t("Player match results and attack telemetry")}</caption><thead><tr>{["Ended", "Mode / result", "Duration", "Score / tile", "Elo", "Moves", "X charged / sent / received", "Hard charged / sent / received"].map(label => <th scope="col" key={label} className="p-4 whitespace-nowrap">{t(label)}</th>)}</tr></thead><tbody>{data.matches.map(match => <tr key={match.id} className="border-t"><th scope="row" className="p-4 text-xs font-normal whitespace-nowrap text-muted-foreground"><Link className="inline-flex min-h-11 items-center text-primary underline" href={`/matches/${match.id}`}>{adminTime(match.endedAt, locale)}</Link></th><td className="p-4 capitalize whitespace-nowrap"><span className={`admin-badge ${match.result === "win" ? "admin-badge-positive" : match.result === "loss" ? "admin-badge-danger" : ""}`}>{t(match.result)}</span><span className="ml-2 text-xs">{t(match.mode)}</span><p className="mt-2 text-[11px] text-muted-foreground">{t(match.reason.replaceAll("_", " "))}</p></td><td className="p-4">{t("{seconds} sec", { seconds: Math.round(match.durationSeconds).toLocaleString(locale) })}</td><td className="p-4 whitespace-nowrap"><strong>{match.score.toLocaleString(locale)}</strong> <span className="text-muted-foreground">/ {match.maxTile.toLocaleString(locale)}</span></td><td className="p-4 whitespace-nowrap">{match.ratingBefore === null || match.ratingAfter === null || match.ratingDelta === null ? "—" : `${match.ratingBefore.toLocaleString(locale)} → ${match.ratingAfter.toLocaleString(locale)} (${match.ratingDelta > 0 ? "+" : ""}${match.ratingDelta.toLocaleString(locale)})`}</td><td className="p-4 whitespace-nowrap">{match.telemetry ? match.telemetry.moves.toLocaleString(locale) : t("Not measured")}</td><td className="p-4 whitespace-nowrap">{match.telemetry ? `${match.telemetry.charged.xblock.toLocaleString(locale)} / ${match.telemetry.sent.xblock.toLocaleString(locale)} / ${match.telemetry.received.xblock.toLocaleString(locale)}` : t("Not measured")}</td><td className="p-4 whitespace-nowrap">{match.telemetry ? `${match.telemetry.charged.hardblock.toLocaleString(locale)} / ${match.telemetry.sent.hardblock.toLocaleString(locale)} / ${match.telemetry.received.hardblock.toLocaleString(locale)}` : t("Not measured")}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="space-y-4" aria-labelledby="audit-heading"><h2 id="audit-heading" className="admin-section-title">{t("Latest 20 access changes")}</h2><Link className="inline-flex min-h-11 items-center text-sm text-primary underline" href={`/audit?player=${id}`}>{t("View all access changes")}</Link>
        {!data.audit.length ? <p className="admin-state">{t("No access changes recorded.")}</p> : <ol className="admin-panel divide-y">{data.audit.map(entry => <li key={entry.id} className="flex gap-4 p-6 text-sm"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${entry.action === "suspend" ? "bg-destructive" : "bg-secondary-foreground"}`} /><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-x-4 gap-y-2"><strong className="text-xs">{t(entry.action === "suspend" ? "Suspended" : "Access restored")}</strong><span className="text-[11px] text-muted-foreground">{adminTime(entry.createdAt, locale)}</span></div><p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.reason}</p><p className="text-[10px] text-muted-foreground break-all">{t("Administrator: {id}", { id: entry.actorId })}</p></div></li>)}</ol>}
      </section>

    </>}
  </section>;
}
