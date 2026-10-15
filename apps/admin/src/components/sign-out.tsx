"use client";

import { useI18n } from "ui/i18n";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOut() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="space-y-2"><Button variant="outline" disabled={busy} onClick={async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { error: failure } = await createClient().auth.signOut({ scope: "local" });
      if (failure) throw failure;
      router.replace("/login"); router.refresh();
    } catch { setError("Sign out failed. Please try again."); }
    finally { setBusy(false); }
  }}>{t(busy ? "Signing out…" : "Sign out")}</Button>{error && <p role="alert" className="admin-error">{t(error)}</p>}</div>;
}
