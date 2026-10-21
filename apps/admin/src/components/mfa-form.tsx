"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "ui/i18n";
import { Button } from "ui/button";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { qrCode: string; secret: string };
const FRIENDLY_NAME = "2048 Duo admin";

function describe(failure: unknown) {
  const code =
    failure && typeof failure === "object" && "code" in failure ? String(failure.code) : "";
  if (code === "mfa_verification_failed")
    return "The code was not accepted. Enter the current code from your authenticator app.";
  if (code === "mfa_totp_enroll_not_enabled" || code === "mfa_totp_verify_not_enabled")
    return "Authenticator (TOTP) MFA is disabled for this Supabase project. Enable it under Authentication → Multi-Factor.";
  if (code === "over_request_rate_limit") return "Too many attempts. Please try again later.";
  return "Two-factor authentication is unavailable. Please try again.";
}

export function MfaForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const client = createClient();
      try {
        const { data, error: listError } = await client.auth.mfa.listFactors();
        if (listError) throw listError;
        const verified = data.totp.find((factor) => factor.status === "verified");
        if (verified) {
          setFactorId(verified.id);
          return;
        }
        // An abandoned enrollment cannot be completed later; replace it with a fresh secret.
        for (const factor of data.all.filter((factor) => factor.status === "unverified"))
          await client.auth.mfa.unenroll({ factorId: factor.id });
        const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: FRIENDLY_NAME,
        });
        if (enrollError) throw enrollError;
        setFactorId(enrolled.id);
        setEnrollment({ qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret });
      } catch (failure) {
        setError(describe(failure));
      }
    })();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !factorId) return;
    const code = String(new FormData(event.currentTarget).get("code") || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: failure } = await createClient().auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (failure) throw failure;
      router.replace("/");
      router.refresh();
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  }

  if (!factorId)
    return error ? (
      <div className="space-y-4">
        <p role="alert" className="admin-error">
          {t(error)}
        </p>
        <Button type="button" variant="outline" onClick={() => router.refresh()}>
          {t("Try again")}
        </Button>
      </div>
    ) : (
      <p role="status" className="text-sm text-muted-foreground">
        {t("Preparing two-factor authentication…")}
      </p>
    );

  return (
    <form onSubmit={submit} className="space-y-6">
      {enrollment && (
        <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
          {/* The authenticator secret only ever renders for the signed-in administrator who is enrolling it. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI from the auth server */}
          <img
            src={enrollment.qrCode}
            alt={t("QR code for your authenticator app")}
            width={192}
            height={192}
            className="mx-auto size-48 rounded-xl border bg-white p-2"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {t("Cannot scan? Enter this key manually:")}
          </p>
          <code className="block break-all rounded-lg bg-card p-3 text-xs">
            {enrollment.secret}
          </code>
        </div>
      )}
      {error && (
        <p role="alert" className="admin-error">
          {t(error)}
        </p>
      )}
      <label className="grid gap-2 text-xs font-semibold">
        <span>{t("6-digit code")}</span>
        <input
          name="code"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          disabled={busy}
          className="admin-field w-full text-center text-lg tracking-[0.3em]"
          placeholder="000000"
        />
      </label>
      <Button type="submit" disabled={busy} className="w-full">
        {t(busy ? "Verifying…" : enrollment ? "Activate and continue" : "Verify")}
      </Button>
    </form>
  );
}
