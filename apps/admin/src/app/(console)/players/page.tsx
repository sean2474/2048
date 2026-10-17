"use client";

import { useI18n } from "ui/i18n";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminTime } from "@/lib/investigation";
import { useEffect, useState } from "react";
import type { AdminPlayersResult } from "schema/admin";
import { createClient } from "@/lib/supabase/client";
import { Button } from "ui/button";

export default function AdminPlayersPage() {
  const { t, locale } = useI18n();
  const params = useSearchParams(); const router = useRouter();
  const query = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const rawOffset = Number(params.get("offset") ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const [search, setSearch] = useState(query);
  useEffect(() => { setSearch(query); }, [query]);
  const navigate = (q: string, filter: string, start: number) => router.push(`/players?${new URLSearchParams({ q, status: filter, offset: String(start) })}`);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AdminPlayersResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(null);
    async function load() {
      try {
        const { data: result, error: failure } = await createClient().rpc("admin_players_filtered", { p_query: query, p_offset: offset, p_status: status });
        if (failure) throw failure;
        if (active) setData(result as AdminPlayersResult);
      } catch { if (active) setError("Players could not be loaded. Check your connection and administrator access, then try again."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [query, offset, status, reload]);
  return <section className="space-y-6" aria-labelledby="players-heading">
    <div><p className="admin-eyebrow mb-2">{t("Player operations")}</p><h1 id="players-heading" className="admin-title">{t("Players")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Review account history and manage access to new matches.")}</p></div>
    <form className="admin-panel flex flex-wrap items-end gap-4 p-4 sm:p-6" onSubmit={event => { event.preventDefault(); navigate(search.trim(), status, 0); setReload(value => value + 1); }}>
      <label className="grid min-w-0 grow gap-2 text-xs font-semibold sm:max-w-lg">{t("Search players")}<input name="player-search" type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Name, username or email")} className="admin-field w-full" /></label>
      <label className="grid gap-2 text-xs font-semibold">{t("Status")}<select className="admin-field" value={status} onChange={event => navigate(query, event.target.value, 0)}>{["all", "active", "suspended", "admin"].map(value => <option key={value} value={value}>{t(value === "admin" ? "Administrator" : value === "active" ? "Active" : value === "suspended" ? "Suspended" : "all")}</option>)}</select></label>
      <Button type="submit" disabled={loading}>{t("Search")}</Button>
      <Button type="button" variant="outline" className="sm:ml-auto" disabled={loading} onClick={() => setReload(value => value + 1)}>{t("Refresh")}</Button>
    </form>
    {error ? <p role="alert" className="admin-error">{t(error)}</p> : loading ? <p role="status" className="admin-state">{t("Loading players…")}</p> : data && <>
      <p className="text-xs text-muted-foreground" role="status">{t("{count} matching accounts", { count: data.total.toLocaleString(locale) })}{data.players.length ? ` · ${t("Showing {from}–{to}", { from: (offset + 1).toLocaleString(locale), to: (offset + data.players.length).toLocaleString(locale) })}` : ""}</p>
      {!data.players.length ? <div className="admin-state"><p className="font-semibold text-foreground">{t("No players found")}</p><p className="mt-2">{t("Try another name, username or email address.")}</p></div> : <div className="admin-panel overflow-x-auto" role="region" aria-label={t("Player accounts table")} tabIndex={0}>
        <table className="w-full text-sm text-left"><caption className="sr-only">{t("Player accounts, rankings and access status")}</caption><thead className="bg-muted"><tr>{["Player", "Email", "Elo / tier", "Ranked games", "Joined", "Status"].map(label => <th scope="col" key={label} className="p-4 whitespace-nowrap">{t(label)}</th>)}</tr></thead><tbody>
          {data.players.map(player => <tr key={player.id} className="border-t"><th scope="row" className="p-4"><Link className="inline-flex min-h-11 min-w-32 items-center gap-3 rounded-md text-primary underline-offset-4 hover:underline" href={`/players/${player.id}?returnTo=${encodeURIComponent(`/players?${params}`)}`}><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs text-muted-foreground">{(player.name || player.username || "P").slice(0, 1).toUpperCase()}</span><span>{player.name || player.username || t("Unnamed player")}{player.username && <span className="mt-1 block text-xs font-normal text-muted-foreground">@{player.username}</span>}</span></Link></th><td className="p-4 text-xs text-muted-foreground">{player.email ?? t("No email")}</td><td className="p-4 whitespace-nowrap"><strong>{player.rating.toLocaleString(locale)}</strong><span className="admin-badge ml-2">{t(player.tier ?? "Evaluating")}</span></td><td className="p-4">{player.gamesPlayed.toLocaleString(locale)}</td><td className="p-4 whitespace-nowrap text-xs text-muted-foreground">{adminTime(player.createdAt, locale)}</td><td className="p-4 whitespace-nowrap"><span className={`admin-badge ${player.isAdmin ? "admin-badge-warm" : player.suspendedAt ? "admin-badge-danger" : "admin-badge-positive"}`}>{t(player.isAdmin ? "Administrator" : player.suspendedAt ? "Suspended" : "Active")}</span></td></tr>)}
        </tbody></table>
      </div>}
      <div className="flex justify-between items-center gap-4"><Button variant="outline" disabled={offset === 0} onClick={() => navigate(query, status, Math.max(0, offset - 50))}>{t("Previous")}</Button><span className="text-xs text-muted-foreground">{t("Page {page}", { page: (Math.floor(offset / 50) + 1).toLocaleString(locale) })}</span><Button variant="outline" disabled={offset + 50 >= data.total} onClick={() => navigate(query, status, offset + 50)}>{t("Next")}</Button></div>
    </>}
  </section>;
}
