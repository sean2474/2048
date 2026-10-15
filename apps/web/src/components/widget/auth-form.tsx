"use client";
import { useI18n } from "ui/i18n";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
const inputClass = "h-12 w-full rounded-xl border bg-background/40 px-4 text-base outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/30 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50";
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { t } = useI18n();
  const router = useRouter();
  const signup = mode === "signup";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim(), password = String(form.get("password") || "");
    setError(""); setNotice("");
    if (signup && password !== form.get("confirmPassword")) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: {
          data: { name: String(form.get("name") || "Player").trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        } });
        if (error) throw error;
        if (!data.session) { setNotice("Check your email to confirm your account, then return here to log in."); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/"); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} aria-busy={busy} className="w-full space-y-5">
    {error && <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{t(error)}</p>}
    {notice && <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm leading-6">{t(notice)}</p>}
    {signup && <label className="grid gap-2"><span className="text-sm font-semibold">{t("Display name")}</span><input name="name" autoComplete="nickname" minLength={2} maxLength={32} required className={inputClass} disabled={busy} /></label>}
    <label className="grid gap-2"><span className="text-sm font-semibold">{t("Email")}</span><input name="email" type="email" autoComplete="email" required className={inputClass} disabled={busy} /></label>
    <label className="grid gap-2"><span className="text-sm font-semibold">{t("Password")}</span><input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 10 : undefined} aria-describedby={signup ? "password-hint" : undefined} required className={inputClass} disabled={busy} />{signup && <span id="password-hint" className="text-xs leading-5 text-muted-foreground">{t("Use at least 10 characters.")}</span>}</label>
    {signup && <label className="grid gap-2"><span className="text-sm font-semibold">{t("Confirm password")}</span><input name="confirmPassword" type="password" autoComplete="new-password" required className={inputClass} disabled={busy} /></label>}
    <Button type="submit" className="h-12 w-full" disabled={busy}>{busy ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}{busy ? t("Please wait...") : signup ? t("Create account") : t("Log in")}{!busy && <ArrowRight aria-hidden="true" />}</Button>
    <p className="border-t pt-3 text-center text-sm leading-6 text-muted-foreground"><Link href={signup ? "/login" : "/signup"} className="inline-flex min-h-11 items-center rounded-md font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4">{signup ? t("Already have an account? Log in") : t("Create an account")}</Link></p>
  </form>;
}
