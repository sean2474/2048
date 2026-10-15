"use client";

import { useI18n } from "ui/i18n";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminPlayerDetail } from "schema/admin";
import { ratingTier } from "schema/ranking";
import { createClient } from "@/lib/supabase/client";
import { Button } from "ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "ui/alert-dialog";

export default function AdminPlayerPage() {
  const { t, locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminPlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [success, setSuccess] = useState("");
  const refreshButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setData(null);
    async function load() {
      try {
        const { data: result, error: failure } = await createClient().rpc("admin_player", { p_user_id: id });
        if (failure) {
          if (failure.code === "P0002") { if (active) setError("This player was not found."); return; }
          throw failure;
        }
        if (active) setData(result as AdminPlayerDetail);
      } catch { if (active) setError("Player details could not be loaded. Check your connection and administrator access, then try again."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [id, reload]);

  async function updateSuspension() {
    if (!data || saving || !reason.trim()) return;
    setSaving(true); setMutationError(""); setSuccess("");
    const suspend = !data.player.suspendedAt;
    try {
      const { error: failure } = await createClient().rpc("admin_set_suspension", { p_user_id: data.player.id, p_suspended: suspend, p_reason: reason.trim() });
      if (failure) throw failure;
      setConfirming(false); setReason("");
      setSuccess(suspend ? "Player suspended from new matches. The reason was recorded in the audit log." : "Player access restored. The reason was recorded in the audit log.");
      setReload(value => value + 1);
    } catch { setMutationError("The change could not be confirmed. Refresh this player before retrying; your access or the player's status may have changed."); }
    finally { setSaving(false); }
  }

  const player = data?.player;
  return <section className="space-y-6" aria-labelledby="player-heading">
    <div className="flex justify-between items-center gap-4"><Button asChild variant="outline"><Link href="/players">{t("Back to players")}</Link></Button><Button ref={refreshButton} variant="outline" aria-disabled={loading || saving} className="aria-disabled:opacity-50" onClick={() => { if (!loading && !saving) setReload(value => value + 1); }}>{t("Refresh")}</Button></div>
    {success && <p role="status" className="admin-success">{t(success)}</p>}
    {error ? <p role="alert" className="admin-error">{t(error)}</p> : loading ? <p role="status" className="admin-state">{t("Loading player details…")}</p> : data && player && <>
      <div className="admin-panel p-6 sm:p-8 space-y-6">
        <div className="flex items-start gap-4"><span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-2xl bg-secondary text-xl font-semibold text-secondary-foreground">{(player.name || player.username || "P").slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="admin-eyebrow mb-2">{t("Player profile")}</p><h1 id="player-heading" className="admin-title break-words">{player.name || player.username || t("Unnamed player")}</h1><p className="mt-2 text-sm break-all text-muted-foreground">{player.email ?? t("No email")}</p><p className="mt-2 text-[10px] text-muted-foreground break-all">{player.id}</p></div></div>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 border-t pt-6 text-sm">
          <div><dt className="admin-eyebrow mb-2">{t("Status")}</dt><dd><span className={`admin-badge ${player.isAdmin ? "admin-badge-warm" : player.suspendedAt ? "admin-badge-danger" : "admin-badge-positive"}`}>{t(player.isAdmin ? "Administrator" : player.suspendedAt ? "Suspended" : "Active")}</span></dd></div>
          <div><dt className="admin-eyebrow mb-2">{t("Elo / tier")}</dt><dd className="flex flex-wrap items-center gap-2"><strong className="tabular-nums">{player.rating.toLocaleString(locale)}</strong><span className="admin-badge">{t(ratingTier(player.rating))}</span></dd></div>
          <div><dt className="admin-eyebrow mb-2">{t("Ranked W / L / D")}</dt><dd className="font-semibold tabular-nums">{player.wins.toLocaleString(locale)} <span className="mx-1 font-normal text-muted-foreground">/</span> {player.losses.toLocaleString(locale)} <span className="mx-1 font-normal text-muted-foreground">/</span> {player.draws.toLocaleString(locale)}</dd></div>
          <div><dt className="admin-eyebrow mb-2">{t("Joined")}</dt><dd className="text-xs leading-5">{new Date(player.createdAt).toLocaleString(locale)}</dd></div>
        </dl>
        {player.suspendedAt && <p className="admin-error break-words">{t("Suspended {date}", { date: new Date(player.suspendedAt).toLocaleString(locale) })} · {player.suspensionReason}</p>}
      </div>
      <section className="admin-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10" aria-labelledby="access-heading">
        <div><h2 id="access-heading" className="admin-section-title">{t("Match access")}</h2>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">{t("Suspension blocks this account from starting new casual, ranked and friend matches. Existing matches and reconnections continue. It does not block anonymous guest play.")}</p></div>
        {player.isAdmin ? <p className="text-sm">{t("Administrator accounts cannot be suspended here.")}</p> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); setMutationError(""); setConfirming(true); }}>
          <label htmlFor="suspension-reason" className="block text-xs font-semibold">{t(player.suspendedAt ? "Reason for restoring access" : "Reason for suspension")} <span className="font-normal text-muted-foreground">{t("(required)")}</span></label>
          <textarea id="suspension-reason" required maxLength={500} rows={2} value={reason} onChange={event => setReason(event.target.value)} disabled={saving} className="admin-field w-full py-3" placeholder={t("Record a specific reason for the audit log.")} />
          <Button type="submit" variant={player.suspendedAt ? "default" : "destructive"} disabled={saving || !reason.trim()}>{t(player.suspendedAt ? "Restore access…" : "Suspend player…")}</Button>
        </form>}
      </section>
      <section className="space-y-4" aria-labelledby="recent-matches-heading">
        <h2 id="recent-matches-heading" className="admin-section-title">{t("Latest 20 matches")}</h2>
        {!data.matches.length ? <p className="admin-state">{t("No saved matches for this player.")}</p> : <div className="admin-panel overflow-x-auto" role="region" aria-label={t("Player match history table")} tabIndex={0}><table className="w-full text-sm text-left"><caption className="sr-only">{t("Player match results and attack telemetry")}</caption><thead><tr>{["Ended", "Mode / result", "Duration", "Score / tile", "Elo", "Moves", "X charged / sent / received", "Hard charged / sent / received"].map(label => <th scope="col" key={label} className="p-4 whitespace-nowrap">{t(label)}</th>)}</tr></thead><tbody>{data.matches.map(match => <tr key={match.id} className="border-t"><th scope="row" className="p-4 text-xs font-normal whitespace-nowrap text-muted-foreground">{new Date(match.endedAt).toLocaleString(locale)}</th><td className="p-4 capitalize whitespace-nowrap"><span className={`admin-badge ${match.result === "win" ? "admin-badge-positive" : match.result === "loss" ? "admin-badge-danger" : ""}`}>{t(match.result)}</span><span className="ml-2 text-xs">{t(match.mode)}</span><p className="mt-2 text-[11px] text-muted-foreground">{t(match.reason.replaceAll("_", " "))}</p></td><td className="p-4">{t("{seconds} sec", { seconds: Math.round(match.durationSeconds).toLocaleString(locale) })}</td><td className="p-4 whitespace-nowrap"><strong>{match.score.toLocaleString(locale)}</strong> <span className="text-muted-foreground">/ {match.maxTile.toLocaleString(locale)}</span></td><td className="p-4 whitespace-nowrap">{match.ratingBefore === null || match.ratingAfter === null || match.ratingDelta === null ? "—" : `${match.ratingBefore.toLocaleString(locale)} → ${match.ratingAfter.toLocaleString(locale)} (${match.ratingDelta > 0 ? "+" : ""}${match.ratingDelta.toLocaleString(locale)})`}</td><td className="p-4 whitespace-nowrap">{match.telemetry ? match.telemetry.moves.toLocaleString(locale) : t("Not measured")}</td><td className="p-4 whitespace-nowrap">{match.telemetry ? `${match.telemetry.charged.xblock.toLocaleString(locale)} / ${match.telemetry.sent.xblock.toLocaleString(locale)} / ${match.telemetry.received.xblock.toLocaleString(locale)}` : t("Not measured")}</td><td className="p-4 whitespace-nowrap">{match.telemetry ? `${match.telemetry.charged.hardblock.toLocaleString(locale)} / ${match.telemetry.sent.hardblock.toLocaleString(locale)} / ${match.telemetry.received.hardblock.toLocaleString(locale)}` : t("Not measured")}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="space-y-4" aria-labelledby="audit-heading"><h2 id="audit-heading" className="admin-section-title">{t("Latest 20 access changes")}</h2>
        {!data.audit.length ? <p className="admin-state">{t("No access changes recorded.")}</p> : <ol className="admin-panel divide-y">{data.audit.map(entry => <li key={entry.id} className="flex gap-4 p-6 text-sm"><span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${entry.action === "suspend" ? "bg-destructive" : "bg-secondary-foreground"}`} /><div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-x-4 gap-y-2"><strong className="text-xs">{t(entry.action === "suspend" ? "Suspended" : "Access restored")}</strong><span className="text-[11px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString(locale)}</span></div><p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.reason}</p><p className="text-[10px] text-muted-foreground break-all">{t("Administrator: {id}", { id: entry.actorId })}</p></div></li>)}</ol>}
      </section>
      <AlertDialog open={confirming} onOpenChange={open => { if (!saving) setConfirming(open); }}>
        <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); refreshButton.current?.focus(); }}>
          <AlertDialogHeader><AlertDialogTitle>{t(player.suspendedAt ? "Restore access for {name}?" : "Suspend {name}?", { name: player.name })}</AlertDialogTitle><AlertDialogDescription>{player.email || player.id}. {t(player.suspendedAt ? "This account will be able to start new matches again." : "This account will be blocked from starting new matches. Existing games will continue.")} {t("The change and your administrator ID will be recorded.")}</AlertDialogDescription></AlertDialogHeader>
          <p className="rounded-xl bg-muted p-4 text-sm leading-6 whitespace-pre-wrap break-words"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Recorded reason")}</span>{reason.trim()}</p>
          {mutationError && <p role="alert" className="admin-error">{t(mutationError)}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t("Cancel")}</AlertDialogCancel><Button disabled={saving || !!mutationError} variant={player.suspendedAt ? "default" : "destructive"} onClick={() => void updateSuspension()}>{t(saving ? "Saving…" : player.suspendedAt ? "Confirm restore" : "Confirm suspension")}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>}
  </section>;
}
