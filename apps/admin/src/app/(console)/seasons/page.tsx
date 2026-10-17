"use client";

import { useEffect, useRef, useState } from "react";
import type { RankSeason } from "schema/ranking";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";

export default function SeasonsPage() {
  const { t, locale } = useI18n();
  const [seasons, setSeasons] = useState<(RankSeason & { created_by: string | null; transition_reason: string | null })[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [reload, setReload] = useState(0), [name, setName] = useState(""), [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false), [saving, setSaving] = useState(false), [mutationError, setMutationError] = useState(""), [success, setSuccess] = useState(false);
  const busy = useRef(false), refresh = useRef<HTMLButtonElement>(null);
  const current = seasons.find(season => season.ends_at === null);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    void (async () => {
      try {
        const { data, error: failure } = await createClient().rpc("admin_rank_seasons");
        if (failure) throw failure;
        if (active) setSeasons(data);
      } catch { if (active) setError("Seasons could not be loaded. Check your connection and try again."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [reload]);
  async function transition() {
    if (!current || busy.current || !name.trim() || !reason.trim()) return;
    busy.current = true; setSaving(true); setMutationError(""); setSuccess(false);
    try {
      const { error: failure } = await createClient().rpc("admin_rollover_season", { p_expected_season: current.id, p_name: name.trim(), p_reason: reason.trim() });
      if (failure) throw failure;
      setConfirming(false); setName(""); setReason(""); setSuccess(true); setReload(value => value + 1);
    } catch { setMutationError("The transition could not be confirmed. Close this dialog and refresh seasons before retrying."); }
    finally { busy.current = false; setSaving(false); }
  }
  return <section className="space-y-6" aria-labelledby="seasons-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="admin-eyebrow mb-2">{t("Ranked competition")}</p><h1 id="seasons-title" className="admin-title">{t("Ranked seasons")}</h1></div><Button ref={refresh} variant="outline" disabled={loading || saving} onClick={() => setReload(value => value + 1)}>{t("Refresh")}</Button></div>
    {success && <p role="status" className="admin-success">{t("The new season is active. Previous results remain available.")}</p>}
    {error ? <p role="alert" className="admin-error">{t(error)}</p> : loading ? <p role="status" className="admin-state">{t("Loading seasons…")}</p> : <>
      <div className="admin-panel p-6 space-y-3"><h2 className="admin-section-title">{t("Current season")}: {current?.name ?? t("Unavailable")}</h2><p className="text-sm leading-6 text-muted-foreground">{t("The first 10 ranked matches establish a player’s tier. Tiers then follow Elo automatically, without promotion series. Elo and established tiers carry over between seasons.")}</p></div>
      {current && <form className="admin-panel space-y-4 p-6" onSubmit={event => { event.preventDefault(); setMutationError(""); setConfirming(true); }}>
        <h2 className="admin-section-title">{t("Start next season")}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{t("This closes the current season while preserving Elo, established tiers and lifetime evaluation progress. Season records and season best start fresh; 10 ranked matches qualify players for the new standings. Matches already started still belong to the previous season.")}</p>
        <label className="block text-sm font-semibold">{t("New season name")}<input className="admin-field mt-2 w-full" value={name} onChange={event => setName(event.target.value)} required maxLength={80} disabled={saving} /></label>
        <label className="block text-sm font-semibold">{t("Transition reason")}<textarea className="admin-field mt-2 w-full py-3" value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} rows={2} disabled={saving} /></label>
        <Button type="submit" disabled={saving || !name.trim() || !reason.trim()}>{t("Review season transition")}</Button>
      </form>}
      <section className="space-y-3"><h2 className="admin-section-title">{t("Season history")}</h2><ol className="admin-panel divide-y">{seasons.map(season => <li key={season.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div className="min-w-0"><strong className="break-words">{season.name}</strong>{season.transition_reason && <p className="mt-2 break-words text-sm text-muted-foreground">{season.transition_reason}</p>}{season.created_by && <p className="mt-1 break-all text-xs text-muted-foreground">{t("Administrator: {id}", { id: season.created_by })}</p>}</div><span className="text-xs text-muted-foreground">{season.ends_at ? t("Ended {date}", { date: new Date(season.ends_at).toLocaleString(locale, { timeZone: "Asia/Seoul" }) }) : t("Current season")}</span></li>)}</ol></section>
    </>}
    <AlertDialog open={confirming} onOpenChange={open => { if (!saving) setConfirming(open); }}><AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); refresh.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>{t("Start {name}?", { name: name.trim() })}</AlertDialogTitle><AlertDialogDescription>{t("Season transitions cannot be undone from this screen. Elo and historical records are preserved. The administrator and reason are recorded.")}</AlertDialogDescription></AlertDialogHeader><p className="break-words rounded-lg bg-muted p-3 text-sm">{reason.trim()}</p>{mutationError && <p role="alert" className="admin-error">{t(mutationError)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={saving}>{t("Cancel")}</AlertDialogCancel><Button disabled={saving || !!mutationError} onClick={() => void transition()}>{t(saving ? "Saving…" : "Confirm season transition")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
