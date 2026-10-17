"use client";
import { GameEmblem } from "@/components/widget/game-emblem";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { LogOut, ShieldAlert } from "lucide-react";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { usePlayer } from "@/hooks/use-player";
import { Skeleton } from "@/components/ui/skeleton";

const inputClass = "min-h-11 w-full rounded-xl border bg-background/40 px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60";
const panelClass = "game-panel bg-card p-5 sm:p-6";
const deletionErrors: Record<string, string> = {
  authentication_required: "Your session has expired. Sign in again before deleting your account.",
  confirmation_mismatch: "Enter your current account email exactly to confirm deletion.",
  active_match: "Finish your current match in every tab before deleting your account.",
  pending_result: "Your last match result is still being saved. Wait a moment and try again.",
  deletion_in_progress: "Account deletion is already in progress. Wait a moment before trying again.",
  admin_account: "Administrator accounts cannot be deleted here. Remove administrator access first.",
  deletion_unavailable: "Account deletion is temporarily unavailable. Please try again later.",
  deletion_failed: "Your account could not be deleted. Please try again later.",
  too_many_requests: "Too many deletion attempts. Wait a minute and try again.",
};

export function AccountSettings({ user, initialName }: { user: User; initialName: string | null }) {
  const { user: liveUser } = usePlayer();
  const { t } = useI18n();
  if (!liveUser || liveUser.is_anonymous || liveUser.id !== user.id) {
    return <section role="status" aria-label={t("Loading profile…")} className={panelClass}><Skeleton className="h-7 w-32" /><Skeleton className="mt-5 h-11 w-full" /></section>;
  }
  return <AccountSettingsForm key={liveUser.id} user={liveUser} initialName={initialName} />;
}

function AccountSettingsForm({ user, initialName }: { user: User; initialName: string | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [savedName, setSavedName] = useState<string | null>(initialName);
  const [loading, setLoading] = useState(initialName === null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [busy, setBusy] = useState<"profile" | "logout" | "delete" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleted, setDeleted] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const email = user.email ?? "";
  const trimmedName = name.trim();
  const characterCount = Array.from(trimmedName).length;
  const validName = characterCount >= 1 && characterCount <= 32;
  const emailMatches = email.length > 0 && confirmation.trim().toLowerCase() === email.toLowerCase();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (initialName !== null && attempt === 0) return;
    let active = true;
    setLoading(true); setLoadError(false);
    void (async () => {
      try {
        const { data, error } = await createClient().from("players").select("name").eq("id", user.id).single();
        if (error || !data || typeof data.name !== "string") throw new Error("Profile unavailable");
        if (active) { setName(data.name); setSavedName(data.name); }
      } catch { if (active) setLoadError(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [user.id, attempt, initialName]);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || loading || loadError) return;
    if (!validName) { setProfileError("Use 1–32 characters for your nickname."); return; }
    pending.current = true; setBusy("profile"); setProfileError(""); setProfileNotice("");
    try {
      const { data, error } = await createClient().from("players").update({ name: trimmedName }).eq("id", user.id).select("name").single();
      if (error || !data) throw new Error("Profile update failed");
      if (mounted.current) { setName(data.name); setSavedName(data.name); setProfileNotice("Nickname saved."); router.refresh(); }
    } catch { if (mounted.current) setProfileError("Could not save your nickname. Please try again."); }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  }

  async function finishSignOut(accountDeleted: boolean) {
    try {
      if (!mounted.current) return;
      const { data } = await createClient().auth.getSession();
      if (!mounted.current || data.session && data.session.user.id !== user.id) return;
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      const { data: after } = await createClient().auth.getSession();
      if (after.session && after.session.user.id !== user.id) return;
      router.replace("/"); router.refresh();
    } catch {
      if (!mounted.current) return;
      if (accountDeleted) setDeleteError("Your account was deleted, but sign-out could not finish. Try signing out again.");
      else setProfileError("Could not log out. Please try again.");
    }
  }

  async function logOut() {
    if (pending.current) return;
    pending.current = true; setBusy("logout"); setProfileError("");
    await finishSignOut(false);
    pending.current = false; if (mounted.current) setBusy(null);
  }

  async function deleteAccount() {
    if (pending.current || !deleted && !emailMatches) return;
    pending.current = true; setBusy("delete"); setDeleteError("");
    try {
      if (!deleted) {
        const { data, error } = await createClient().auth.getSession();
        if (error || !data.session || data.session.user.id !== user.id) { setDeleteError(deletionErrors.authentication_required); return; }
        const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/account/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
          body: JSON.stringify({ confirmationEmail: confirmation.trim() }),
        });
        const result: { ok?: boolean; error?: string } = await response.json();
        if (!response.ok || result.ok !== true) {
          if (mounted.current) setDeleteError(deletionErrors[result.error ?? ""] ?? deletionErrors.deletion_failed);
          return;
        }
        if (mounted.current) setDeleted(true);
      }
      if (mounted.current) await finishSignOut(true);
    } catch { if (mounted.current) setDeleteError("Could not confirm account deletion. Check your connection and try again."); }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  }

  return <>
    <section aria-labelledby="profile-title" className={panelClass}>
      <h2 id="profile-title" className="flex items-center gap-2 text-lg font-bold"><GameEmblem kind="profile" className="size-9" />{t("Profile")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("Your nickname is shown to other players.")}</p>
      {loading ? <p role="status" className="mt-5 text-sm text-muted-foreground">{t("Loading profile…")}</p> : loadError ? <div role="alert" className="mt-5 space-y-3"><p className="text-sm text-destructive">{t("Could not load your profile.")}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>{t("Try again")}</Button></div> : <form onSubmit={saveName} className="mt-5 space-y-4">
        <div className="grid gap-2"><label htmlFor="settings-nickname" className="text-sm font-semibold">{t("Nickname")}</label><input id="settings-nickname" name="nickname" autoComplete="nickname" value={name} disabled={busy !== null || deleted} aria-describedby="nickname-help" aria-invalid={!validName || undefined} onChange={event => { setName(event.target.value); setProfileError(""); setProfileNotice(""); }} className={inputClass} /><div id="nickname-help" className="flex justify-between gap-3 text-xs text-muted-foreground"><span>{t("Use 1–32 characters. Spaces at the ends are removed.")}</span><span className={`shrink-0 tabular-nums ${characterCount > 32 ? "text-destructive" : ""}`}>{characterCount.toLocaleString(locale)} / 32</span></div></div>
        <div className="grid gap-2"><label htmlFor="settings-email" className="text-sm font-semibold">{t("Email")}</label><input id="settings-email" type="email" value={email} readOnly className={`${inputClass} text-muted-foreground`} /><p className="text-xs leading-5 text-muted-foreground">{t("Your sign-in email cannot be changed here.")}</p></div>
        <Button type="submit" disabled={busy !== null || deleted || !validName || trimmedName === savedName}>{t(busy === "profile" ? "Saving nickname…" : "Save nickname")}</Button>
      </form>}
      {profileError && <p role="alert" className="mt-4 text-sm leading-6 text-destructive">{t(profileError)}</p>}
      {profileNotice && <p role="status" className="mt-4 text-sm font-medium text-secondary-foreground">{t(profileNotice)}</p>}
      <div className="mt-6 border-t pt-5"><Button variant="outline" disabled={busy !== null || deleted} onClick={logOut}><LogOut aria-hidden="true" />{t(busy === "logout" ? "Logging out…" : "Log out")}</Button></div>
    </section>

    <section aria-labelledby="delete-account-title" className="rounded-2xl border border-destructive/25 bg-card p-5 sm:p-6">
      <h2 id="delete-account-title" className="flex items-center gap-2 text-base font-bold text-destructive"><ShieldAlert aria-hidden="true" className="size-5" />{t("Delete account")}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("Permanently remove your account and personal game data. This cannot be undone.")}</p>
      <AlertDialog open={deleteOpen} onOpenChange={open => { if (pending.current || deleted) return; setDeleteOpen(open); setConfirmation(""); setDeleteError(""); }}>
        <AlertDialogTrigger asChild><Button variant="outline" disabled={busy !== null || !email || deleted} className="mt-4 border-destructive/30 text-destructive hover:bg-destructive/5">{t("Delete my account")}</Button></AlertDialogTrigger>
        <AlertDialogContent onEscapeKeyDown={event => { if (pending.current || deleted) event.preventDefault(); }}>
          <AlertDialogHeader><AlertDialogTitle>{t(deleted ? "Account deleted" : "Delete your account permanently?")}</AlertDialogTitle><AlertDialogDescription>{t(deleted ? "Your account data has been deleted. Finish signing out of this browser." : "Your sign-in account, profile, coins, saved settings, rating and personal statistics will be permanently deleted.")}</AlertDialogDescription></AlertDialogHeader>
          {!deleted && <><div className="space-y-3 text-sm leading-6 text-muted-foreground"><p>{t("Past matches remain for other players, with your name changed to Deleted player. Administrator audit logs are retained.")}</p><p>{t("Finish any active match and wait for its result to save before continuing.")}</p><p>{t("Starting deletion cancels any matchmaking or friend lobby you are waiting in.")}</p></div><label className="grid gap-2 text-sm font-semibold" htmlFor="delete-email">{t("Type your current email to confirm")}<span className="break-all text-xs font-normal text-muted-foreground">{email}</span><input id="delete-email" type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={confirmation} disabled={busy !== null} onChange={event => { setConfirmation(event.target.value); setDeleteError(""); }} className={inputClass} /></label></>}
          {deleteError && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm leading-6 text-destructive">{t(deleteError)}</p>}
          <AlertDialogFooter>{!deleted && <AlertDialogCancel disabled={busy !== null}>{t("Cancel")}</AlertDialogCancel>}<Button variant="destructive" disabled={busy !== null || !deleted && !emailMatches} onClick={deleteAccount}>{t(busy === "delete" ? deleted ? "Signing out…" : "Deleting account…" : deleted ? "Finish signing out" : "Permanently delete account")}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  </>;
}
