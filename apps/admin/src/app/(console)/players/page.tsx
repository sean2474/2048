
import { getI18n } from "@/lib/i18n/server";
import { RefreshButton } from "@/components/refresh-button";
import { QuerySelect } from "@/components/query-select";

import Link from "next/link";
import { adminTime } from "@/lib/investigation";
import type { AdminPlayersResult } from "schema/admin";
import { createClient } from "@/lib/supabase/server";
import { Button } from "ui/button";

export default async function AdminPlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ t, locale }, search, client] = await Promise.all([getI18n(), searchParams, createClient()]);
  const query = typeof search.q === "string" ? search.q.slice(0, 100) : "";
  const status = ["active", "suspended", "admin"].includes(String(search.status)) ? String(search.status) : "all";
  const rawOffset = Number(search.offset ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const url = (start: number) => `/players?${new URLSearchParams({ q: query, status, offset: String(start) })}`;
  let data: AdminPlayersResult | null = null, error = "";
  try {
    const result = await client.rpc("admin_players_filtered", { p_query: query, p_offset: offset, p_status: status });
    if (result.error) throw result.error;
    data = result.data as AdminPlayersResult;
  } catch { error = "Players could not be loaded. Check your connection and administrator access, then try again."; }
  return <section className="space-y-6" aria-labelledby="players-heading">
    <div><p className="admin-eyebrow mb-2">{t("Player operations")}</p><h1 id="players-heading" className="admin-title">{t("Players")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Review account history and manage access to new matches.")}</p></div>
    <form className="admin-panel flex flex-wrap items-end gap-4 p-4 sm:p-6" action="/players">
      <label className="grid min-w-0 grow gap-2 text-xs font-semibold sm:max-w-lg">{t("Search players")}<input name="q" type="search" maxLength={100} defaultValue={query} placeholder={t("Name, username or email")} className="admin-field w-full" /></label>
      <label className="grid gap-2 text-xs font-semibold">{t("Status")}<QuerySelect name="status" className="admin-field" value={status} options={["all", "active", "suspended", "admin"].map(value => ({ value, label: t(value === "admin" ? "Administrator" : value === "active" ? "Active" : value === "suspended" ? "Suspended" : "all") }))} /></label>
      <Button type="submit">{t("Search")}</Button>
      <RefreshButton />
    </form>
    {error ? <p role="alert" className="admin-error">{t(error)}</p> : data && <>
      <p className="text-xs text-muted-foreground" role="status">{t("{count} matching accounts", { count: data.total.toLocaleString(locale) })}{data.players.length ? ` · ${t("Showing {from}–{to}", { from: (offset + 1).toLocaleString(locale), to: (offset + data.players.length).toLocaleString(locale) })}` : ""}</p>
      {!data.players.length ? <div className="admin-state"><p className="font-semibold text-foreground">{t("No players found")}</p><p className="mt-2">{t("Try another name, username or email address.")}</p></div> : <div className="admin-panel overflow-x-auto" role="region" aria-label={t("Player accounts table")} tabIndex={0}>
        <table className="w-full text-sm text-left"><caption className="sr-only">{t("Player accounts, rankings and access status")}</caption><thead className="bg-muted"><tr>{["Player", "Email", "Elo / tier", "Ranked games", "Joined", "Status"].map(label => <th scope="col" key={label} className="p-4 whitespace-nowrap">{t(label)}</th>)}</tr></thead><tbody>
          {data.players.map(player => <tr key={player.id} className="border-t"><th scope="row" className="p-4"><Link className="inline-flex min-h-11 min-w-32 items-center gap-3 rounded-md text-primary underline-offset-4 hover:underline" href={`/players/${player.id}?returnTo=${encodeURIComponent(url(offset))}`}><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs text-muted-foreground">{(player.name || player.username || "P").slice(0, 1).toUpperCase()}</span><span>{player.name || player.username || t("Unnamed player")}{player.username && <span className="mt-1 block text-xs font-normal text-muted-foreground">@{player.username}</span>}</span></Link></th><td className="p-4 text-xs text-muted-foreground">{player.email ?? t("No email")}</td><td className="p-4 whitespace-nowrap"><strong>{player.rating.toLocaleString(locale)}</strong><span className="admin-badge ml-2">{t(player.tier ?? "Evaluating")}</span></td><td className="p-4">{player.gamesPlayed.toLocaleString(locale)}</td><td className="p-4 whitespace-nowrap text-xs text-muted-foreground">{adminTime(player.createdAt, locale)}</td><td className="p-4 whitespace-nowrap"><span className={`admin-badge ${player.isAdmin ? "admin-badge-warm" : player.suspendedAt ? "admin-badge-danger" : "admin-badge-positive"}`}>{t(player.isAdmin ? "Administrator" : player.suspendedAt ? "Suspended" : "Active")}</span></td></tr>)}
        </tbody></table>
      </div>}
      <div className="flex justify-between items-center gap-4"><Button asChild variant="outline"><Link href={url(Math.max(0, offset - 50))} aria-disabled={offset === 0}>{t("Previous")}</Link></Button><span className="text-xs text-muted-foreground">{t("Page {page}", { page: (Math.floor(offset / 50) + 1).toLocaleString(locale) })}</span><Button asChild variant="outline"><Link href={url(offset + 50 < data.total ? offset + 50 : offset)} aria-disabled={offset + 50 >= data.total}>{t("Next")}</Link></Button></div>
    </>}
  </section>;
}
