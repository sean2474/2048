"use client";
import { useI18n } from "ui/i18n";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRecoveryClient } from "@/lib/supabase/password-recovery";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
const inputClass = "h-12 w-full rounded-xl border bg-background/40 px-4 text-base outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50";
const invalidRecovery = "This reset link is missing, expired or already used. Request a new link and open it in the same browser.";
export function AuthForm({ mode }: { mode: "login" | "signup" | "forgot" | "reset" }) {
  const { t } = useI18n();
  const router = useRouter();
  const signup = mode === "signup";
  const forgot = mode === "forgot", reset = mode === "reset";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recoveryUser, setRecoveryUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(reset);
  const [finished, setFinished] = useState(false);
  const [signupReady, setSignupReady] = useState(false);
  const submitting = useRef(false);
  const recovery = useRef<Promise<string> | null>(null);
  const recoveryAuth = useRef<SupabaseClient["auth"] | null>(null);
  useEffect(() => {
    if (!reset) return;
    let active = true;
    if (!recovery.current) {
      const url = new URL(window.location.href), code = url.searchParams.get("recovery_code");
      window.history.replaceState(window.history.state, "", url.pathname);
      recovery.current = (async () => {
        if (!code || code.length > 4096) return "";
        try {
          const auth = createRecoveryClient().auth;
          const { data, error } = await auth.exchangeCodeForSession(code);
          // The PKCE verifier records the initiating flow; a normal sign-in cannot open this form.
          if (error || !data.user || !data.session || !("redirectType" in data) || data.redirectType !== "PASSWORD_RECOVERY") return "";
          const verified = await auth.getUser();
          if (verified.error || verified.data.user?.id !== data.user.id || verified.data.user.is_anonymous) return "";
          recoveryAuth.current = auth;
          return data.user.id;
        } catch { return ""; }
      })();
    }
    void recovery.current.then(id => {
      if (!active) return;
      setRecoveryUser(id || null); setChecking(false);
      if (!id) setError(invalidRecovery);
    });
    return () => { active = false; };
  }, [reset]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || checking || finished || (reset && !recoveryUser)) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email") || "").trim(), password = String(form.get("password") || "");
    setError(""); setNotice("");
    if ((signup || reset) && password.length < 10) { setError("Use at least 10 characters."); return; }
    if ((signup || reset) && password !== form.get("confirmPassword")) { setError("Passwords do not match."); return; }
    submitting.current = true;
    setBusy(true);
    try {
      if (forgot) {
        const { error } = await createRecoveryClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?type=recovery` });
        if (error && error.code !== "user_not_found") { setError("Could not send a reset link. Wait a moment and try again."); return; }
        setNotice("If an account exists for this email, a reset link has been sent. Open it in this browser.");
        return;
      } else if (reset) {
        const auth = recoveryAuth.current;
        if (!auth) { setRecoveryUser(null); setError(invalidRecovery); return; }
        const verified = await auth.getUser();
        if (verified.error || verified.data.user?.id !== recoveryUser) { setRecoveryUser(null); setError(invalidRecovery); return; }
        const { error } = await auth.updateUser({ password });
        if (error) {
          if (error.status === 401 || error.status === 403) { setRecoveryUser(null); setError(invalidRecovery); }
          else setError(error.code === "same_password" ? "Use a different password from your current password." : "Could not update your password. Try another password or request a new reset link.");
          return;
        }
        try {
          const { error: signOutError } = await auth.signOut({ scope: "global" });
          if (signOutError) throw signOutError;
        } catch { setError("Your password was updated, but other sessions could not be signed out. Sign out from your other devices."); }
        recoveryAuth.current = null;
        setFinished(true); setRecoveryUser(null);
        setNotice("Your password has been updated. Log in with your new password.");
        router.refresh();
        return;
      } else if (signup) {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signUp({ email, password, options: {
          data: { name: String(form.get("name") || "Player").trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        } });
        if (error) throw error;
        formElement.reset();
        setSignupReady(Boolean(data.session)); setFinished(true);
        setNotice(data.session ? "Your account is ready. You can start playing." : "Sign-up request received. Check your email to confirm your account, then log in.");
        if (data.session) router.refresh();
        return;
      } else {
        const { error } = await createClient().auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/"); router.refresh();
    } catch (error) { setError(forgot ? "Could not send a reset link. Wait a moment and try again." : reset ? "Could not update your password. Try another password or request a new reset link." : error instanceof Error ? error.message : "Unable to connect. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (signup && finished) return <div className="space-y-5">
    <p role="status" tabIndex={-1} ref={node => { node?.focus(); }} className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm leading-6">{t(notice)}</p>
    <Button asChild className="h-12 w-full"><Link href={signupReady ? "/" : "/login"}>{t(signupReady ? "Continue to game" : "Return to login")}<ArrowRight aria-hidden="true" /></Link></Button>
  </div>;
  if (reset && (checking || !recoveryUser || finished)) return <div className="space-y-5" aria-busy={checking}>
    {checking && <p role="status" className="text-sm leading-6 text-muted-foreground">{t("Checking your reset link…")}</p>}
    {error && <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{t(error)}</p>}
    {notice && <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm leading-6">{t(notice)}</p>}
    {!checking && <Button asChild className="h-12 w-full"><Link href={finished ? "/login" : "/forgot-password"}>{t(finished ? "Return to login" : "Request a new reset link")}</Link></Button>}
  </div>;
  return <form onSubmit={submit} aria-busy={busy} className="w-full space-y-5">
    {error && <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{t(error)}</p>}
    {notice && <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm leading-6">{t(notice)}</p>}
    {signup && <label className="grid gap-2"><span className="text-sm font-semibold">{t("Display name")}</span><input name="name" autoComplete="nickname" minLength={2} maxLength={32} required className={inputClass} disabled={busy} /></label>}
    {!reset && <label className="grid gap-2"><span className="text-sm font-semibold">{t("Email")}</span><input name="email" type="email" autoComplete="email" required className={inputClass} disabled={busy} /></label>}
    {!forgot && <label className="grid gap-2"><span id="password-label" className="text-sm font-semibold">{t(reset ? "New password" : "Password")}</span><input name="password" aria-labelledby="password-label" type="password" autoComplete={signup || reset ? "new-password" : "current-password"} minLength={signup || reset ? 10 : undefined} aria-describedby={signup || reset ? "password-hint" : undefined} required className={inputClass} disabled={busy} />{(signup || reset) && <span id="password-hint" className="text-xs leading-5 text-muted-foreground">{t("Use at least 10 characters.")}</span>}</label>}
    {(signup || reset) && <label className="grid gap-2"><span className="text-sm font-semibold">{t("Confirm password")}</span><input name="confirmPassword" type="password" autoComplete="new-password" required className={inputClass} disabled={busy} /></label>}
    {mode === "login" && <Link href="/forgot-password" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{t("Forgot password?")}</Link>}
    <Button type="submit" className="h-12 w-full" disabled={busy}>{busy ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{t(busy ? "Please wait..." : forgot ? "Send reset link" : reset ? "Save new password" : signup ? "Create account" : "Log in")}{!busy && <ArrowRight aria-hidden="true" />}</Button>
    <p className="border-t pt-3 text-center text-sm leading-6 text-muted-foreground"><Link href={mode === "login" ? "/signup" : "/login"} className="inline-flex min-h-11 items-center rounded-md font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">{t(signup ? "Already have an account? Log in" : mode === "login" ? "Create an account" : "Return to login")}</Link></p>
  </form>;
}
