"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPlayerDetail } from "schema/admin";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
export function PlayerAccess({ player }: { player: Pick<AdminPlayerDetail["player"], "id" | "name" | "email" | "suspendedAt"> }) {
  const { t } = useI18n(), router = useRouter();
  const [reason, setReason] = useState(""), [confirming, setConfirming] = useState(false), [saving, setSaving] = useState(false), [mutationError, setMutationError] = useState(""), [success, setSuccess] = useState("");
  async function updateSuspension() {
    if (saving || !reason.trim()) return;
    setSaving(true); setMutationError(""); setSuccess("");
    const suspend = !player.suspendedAt;
    try {
      const { error: failure } = await createClient().rpc("admin_set_suspension", { p_user_id: player.id, p_suspended: suspend, p_reason: reason.trim() });
      if (failure) throw failure;
      setConfirming(false); setReason("");
      setSuccess(suspend ? "Player suspended from new matches. The reason was recorded in the audit log." : "Player access restored. The reason was recorded in the audit log.");
      router.refresh();
    } catch { setMutationError("The change could not be confirmed. Refresh this player before retrying; your access or the player's status may have changed."); }
    finally { setSaving(false); }
  }

  return <><div>{success && <p role="status" className="admin-success mb-4">{t(success)}</p>}<form className="space-y-4" onSubmit={event => { event.preventDefault(); setMutationError(""); setConfirming(true); }}>
          <label htmlFor="suspension-reason" className="block text-xs font-semibold">{t(player.suspendedAt ? "Reason for restoring access" : "Reason for suspension")} <span className="font-normal text-muted-foreground">{t("(required)")}</span></label>
          <textarea id="suspension-reason" required maxLength={500} rows={2} value={reason} onChange={event => setReason(event.target.value)} disabled={saving} className="admin-field w-full py-3" placeholder={t("Record a specific reason for the audit log.")} />
          <Button type="submit" variant={player.suspendedAt ? "default" : "destructive"} disabled={saving || !reason.trim()}>{t(player.suspendedAt ? "Restore access…" : "Suspend player…")}</Button>
        </form></div>      <AlertDialog open={confirming} onOpenChange={open => { if (!saving) setConfirming(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t(player.suspendedAt ? "Restore access for {name}?" : "Suspend {name}?", { name: player.name })}</AlertDialogTitle><AlertDialogDescription>{player.email || player.id}. {t(player.suspendedAt ? "This account will be able to start new matches again." : "This account will be blocked from starting new matches. Existing games will continue.")} {t("The change and your administrator ID will be recorded.")}</AlertDialogDescription></AlertDialogHeader>
          <p className="rounded-xl bg-muted p-4 text-sm leading-6 whitespace-pre-wrap break-words"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Recorded reason")}</span>{reason.trim()}</p>
          {mutationError && <p role="alert" className="admin-error">{t(mutationError)}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t("Cancel")}</AlertDialogCancel><Button disabled={saving || !!mutationError} variant={player.suspendedAt ? "default" : "destructive"} onClick={() => void updateSuspension()}>{t(saving ? "Saving…" : player.suspendedAt ? "Confirm restore" : "Confirm suspension")}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog></>;
}
