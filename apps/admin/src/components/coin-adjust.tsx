"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AdminPlayer } from "schema/admin";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";

// Matches the server-side cap in admin_adjust_coins.
const MAX_COIN_ADJUSTMENT = 1_000_000;

export function CoinAdjust({ player, balance }: { player: Pick<AdminPlayer, "id" | "name">; balance: number | null }) {
  const { t, locale } = useI18n(), router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [refreshing, startTransition] = useTransition();
  const [direction, setDirection] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState(""), [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false), [saving, setSaving] = useState(false), [mutationError, setMutationError] = useState(""), [success, setSuccess] = useState("");
  const pending = useRef(false);
  const coins = Number(amount);
  const valid = Number.isSafeInteger(coins) && coins >= 1 && coins <= MAX_COIN_ADJUSTMENT && reason.trim().length > 0;
  const exceeds = direction === "deduct" && balance !== null && coins > balance;

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || exceeds) return;
    setMutationError(""); setConfirming(true);
  }
  async function apply() {
    if (pending.current || refreshing || !valid) return;
    pending.current = true; setSaving(true); setMutationError(""); setSuccess("");
    try {
      const { error: failure } = await createClient().rpc("admin_adjust_coins", { p_user_id: player.id, p_delta: direction === "grant" ? coins : -coins, p_reason: reason.trim() });
      if (failure) throw failure;
      setConfirming(false); setAmount(""); setReason("");
      setSuccess(direction === "grant" ? "Coins granted. The reason was recorded in the coin ledger." : "Coins deducted. The reason was recorded in the coin ledger.");
      startTransition(() => router.refresh());
    } catch (failure) {
      const message = failure && typeof failure === "object" && "message" in failure ? String(failure.message) : "";
      setMutationError(message === "Not enough coins" ? "The deduction exceeds the player's current balance. Refresh and try a smaller amount." : "The change could not be confirmed. Refresh this player before retrying; your access or the player's balance may have changed.");
    } finally { pending.current = false; setSaving(false); }
  }

  return <><div>{success && <p role="status" className="admin-success mb-4">{t(success)}</p>}
    <form ref={form} tabIndex={-1} className="space-y-4" onSubmit={review}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-xs font-semibold"><span>{t("Action")}</span>
          <select value={direction} onChange={event => setDirection(event.target.value as "grant" | "deduct")} disabled={saving || refreshing} className="admin-field w-full"><option value="grant">{t("Grant coins")}</option><option value="deduct">{t("Deduct coins")}</option></select></label>
        <label className="grid gap-2 text-xs font-semibold"><span>{t("Amount")}</span>
          <input type="number" inputMode="numeric" min={1} max={MAX_COIN_ADJUSTMENT} step={1} required value={amount} onChange={event => setAmount(event.target.value)} disabled={saving || refreshing} className="admin-field w-full tabular-nums" /></label>
      </div>
      <label htmlFor="coin-reason" className="block text-xs font-semibold">{t("Reason for the coin change")} <span className="font-normal text-muted-foreground">{t("(required)")}</span></label>
      <textarea id="coin-reason" required maxLength={500} rows={2} value={reason} onChange={event => setReason(event.target.value)} disabled={saving || refreshing} className="admin-field w-full py-3" placeholder={t("Record a specific reason for the coin ledger.")} />
      {exceeds && <p role="alert" className="text-xs text-destructive">{t("The deduction exceeds the current balance of {count} coins.", { count: (balance ?? 0).toLocaleString(locale) })}</p>}
      <Button type="submit" variant={direction === "grant" ? "default" : "destructive"} disabled={saving || refreshing || !valid || exceeds}>{t(direction === "grant" ? "Grant coins…" : "Deduct coins…")}</Button>
    </form></div>
    <AlertDialog open={confirming} onOpenChange={open => { if (!saving) setConfirming(open); }}>
      <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); form.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>{t(direction === "grant" ? "Grant {count} coins to {name}?" : "Deduct {count} coins from {name}?", { count: coins.toLocaleString(locale), name: player.name })}</AlertDialogTitle><AlertDialogDescription>{t("The change, the reason and your administrator ID will be recorded in the player's coin ledger.")}</AlertDialogDescription></AlertDialogHeader>
        <p className="rounded-xl bg-muted p-4 text-sm leading-6 whitespace-pre-wrap break-words"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Recorded reason")}</span>{reason.trim()}</p>
        {mutationError && <p role="alert" className="admin-error">{t(mutationError)}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={saving || refreshing}>{t("Cancel")}</AlertDialogCancel><Button disabled={saving || refreshing || !!mutationError} variant={direction === "grant" ? "default" : "destructive"} onClick={() => void apply()}>{t(saving ? "Saving…" : direction === "grant" ? "Confirm grant" : "Confirm deduction")}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog></>;
}
