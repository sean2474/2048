"use client";
import { useI18n } from "ui/i18n";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./button";
export const LoginBtn = ({ type }: { type: "google" }) => {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== "true") return null;
  return <div className="space-y-4"><div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("or continue with")}<span className="h-px flex-1 bg-border" /></div><Button className="h-12 w-full" variant="outline" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({ provider: type, options: { redirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw error;
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to sign in."); setBusy(false); }
  }}>{busy ? t("Connecting…") : t("Continue with Google")}</Button>{error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{t(error)}</p>}</div>;
};
