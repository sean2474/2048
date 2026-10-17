"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RankSeason } from "schema/ranking";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
export function SeasonTransition({ current }: { current: RankSeason }) {
  const { t } = useI18n(), router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [refreshing, startTransition] = useTransition();
  const [name, setName] = useState(""), [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false), [saving, setSaving] = useState(false), [mutationError, setMutationError] = useState(""), [success, setSuccess] = useState(false);
  const busy = useRef(false);
  async function transition() {
    if (refreshing || !current || busy.current || !name.trim() || !reason.trim()) return;
    busy.current = true; setSaving(true); setMutationError(""); setSuccess(false);
    try {
      const { error: failure } = await createClient().rpc("admin_rollover_season", { p_expected_season: current.id, p_name: name.trim(), p_reason: reason.trim() });
      if (failure) throw failure;
      setConfirming(false); setName(""); setReason(""); setSuccess(true); startTransition(() => router.refresh());
    } catch { setMutationError("The transition could not be confirmed. Close this dialog and refresh seasons before retrying."); }
    finally { busy.current = false; setSaving(false); }
  }
  return <>{success && <p role="status" className="admin-success">{t("The new season is active. Previous results remain available.")}</p>}<form ref={form} tabIndex={-1} className="admin-panel space-y-4 p-6" onSubmit={event => { event.preventDefault(); setMutationError(""); setConfirming(true); }}>
        <h2 className="admin-section-title">{t("Start next season")}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{t("This closes the current season while preserving Elo, established tiers and lifetime evaluation progress. Season records and season best start fresh; 10 ranked matches qualify players for the new standings. Matches already started still belong to the previous season.")}</p>
        <label className="block text-sm font-semibold">{t("New season name")}<input className="admin-field mt-2 w-full" value={name} onChange={event => setName(event.target.value)} required maxLength={80} disabled={saving || refreshing} /></label>
        <label className="block text-sm font-semibold">{t("Transition reason")}<textarea className="admin-field mt-2 w-full py-3" value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} rows={2} disabled={saving || refreshing} /></label>
        <Button type="submit" disabled={saving || refreshing || !name.trim() || !reason.trim()}>{t("Review season transition")}</Button>
      </form><AlertDialog open={confirming} onOpenChange={open => { if (!saving) setConfirming(open); }}><AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); form.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>{t("Start {name}?", { name: name.trim() })}</AlertDialogTitle><AlertDialogDescription>{t("Season transitions cannot be undone from this screen. Elo and historical records are preserved. The administrator and reason are recorded.")}</AlertDialogDescription></AlertDialogHeader><p className="break-words rounded-lg bg-muted p-3 text-sm">{reason.trim()}</p>{mutationError && <p role="alert" className="admin-error">{t(mutationError)}</p>}<AlertDialogFooter><AlertDialogCancel disabled={saving || refreshing}>{t("Cancel")}</AlertDialogCancel><Button disabled={saving || refreshing || !!mutationError} onClick={() => void transition()}>{t(saving ? "Saving…" : "Confirm season transition")}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
