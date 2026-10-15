"use client";

import { useI18n } from "ui/i18n";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "ui/button";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const { error: failure } = await createClient().auth.signInWithPassword({ email: String(form.get("email") || "").trim(), password: String(form.get("password") || "") });
      if (failure) throw failure;
      router.replace("/"); router.refresh();
    } catch (failure) {
      const code = failure && typeof failure === "object" && "code" in failure ? failure.code : null;
      setError(code === "invalid_credentials" ? "Email or password is incorrect." : code === "email_not_confirmed" ? "Confirm your email before signing in." : code === "over_request_rate_limit" ? "Too many sign-in attempts. Please try again later." : "Unable to sign in. Please try again.");
    }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-6">
    {error && <p role="alert" className="admin-error">{t(error)}</p>}
    <label className="grid gap-2 text-xs font-semibold"><span>{t("Email address")}</span><input type="email" name="email" required autoComplete="username" disabled={busy} className="admin-field w-full" placeholder={t("you@example.com")} /></label>
    <label className="grid gap-2 text-xs font-semibold"><span>{t("Password")}</span><input type="password" name="password" required autoComplete="current-password" disabled={busy} className="admin-field w-full" /></label>
    <Button type="submit" disabled={busy} className="w-full">{t(busy ? "Signing in…" : "Sign in")}</Button>
  </form>;
}
