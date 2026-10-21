"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Bug, Check, CheckCircle2, MessageSquare, Send } from "lucide-react";
import { FeedbackInputSchema } from "schema/feedback";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export function FeedbackForm() {
  const { t } = useI18n();
  const [category, setCategory] = useState<"bug" | "feedback">("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    requestId.current ??= crypto.randomUUID();
    const input = FeedbackInputSchema.safeParse({
      id: requestId.current,
      category,
      subject,
      message,
    });
    if (!input.success) {
      setError("Add a title (1–120 characters) and details (10–3,000 characters).");
      return;
    }
    pending.current = true;
    setSending(true);
    setError("");
    try {
      let token: string | undefined;
      if (isSupabaseConfigured()) {
        const { data, error: authError } = await createClient().auth.getSession();
        if (authError) throw authError;
        if (!data.session?.user.is_anonymous) token = data.session?.access_token;
      }
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000"}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(input.data),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.status === 429) {
        setError("Too many reports. Wait a minute and try again.");
        return;
      }
      if (response.status === 401) {
        setError("Your session has expired. Sign in again to send your report.");
        return;
      }
      if (!response.ok || (await response.json()).ok !== true)
        throw new Error("Feedback unavailable");
      setSent(true);
    } catch {
      setError("Your report could not be sent. Your text is still here. Please try again.");
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  return (
    <>
      {sent ? (
        <section role="status" className="game-panel bg-card p-6 text-center shadow-sm sm:p-10">
          <CheckCircle2
            aria-hidden="true"
            className="mx-auto mb-4 size-10 text-secondary-foreground"
          />
          <h2 className="text-xl font-bold">{t("Report received")}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("Thank you. Your report is now in our administrator inbox.")}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => {
                setSent(false);
                setSubject("");
                setMessage("");
                requestId.current = null;
              }}
            >
              {t("Send another report")}
            </Button>
            <Button asChild variant="outline">
              <Link href="/">{t("Back to home")}</Link>
            </Button>
          </div>
        </section>
      ) : (
        <form
          onSubmit={submit}
          onChange={() => {
            requestId.current = null;
            setError("");
          }}
          className="space-y-6 game-panel bg-card p-5 shadow-sm sm:p-8"
          aria-busy={sending}
        >
          <fieldset disabled={sending} className="space-y-6">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">{t("Report type")}</legend>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { value: "bug", label: "Bug report", icon: Bug },
                    { value: "feedback", label: "Suggestion", icon: MessageSquare },
                  ] as const
                ).map((option) => (
                  <label key={option.value} className="relative min-w-0">
                    <input
                      type="radio"
                      name="category"
                      value={option.value}
                      checked={category === option.value}
                      onChange={() => setCategory(option.value)}
                      className="peer sr-only"
                    />
                    <span className="flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:opacity-60 sm:px-4">
                      <option.icon aria-hidden="true" className="size-4 shrink-0" />
                      {t(option.label)}
                      <Check
                        aria-hidden="true"
                        className={`ml-auto size-4 shrink-0 ${category === option.value ? "" : "invisible"}`}
                      />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Input
              name="feedback-subject"
              label="Report title"
              type="text"
              value={subject}
              maxLength={120}
              onChange={(event) => setSubject(event.target.value)}
            />
            <div className="space-y-2">
              <label htmlFor="feedback-message" className="text-sm font-semibold">
                {t("Details")}
              </label>
              <p id="feedback-help" className="text-xs leading-5 text-muted-foreground">
                {t(
                  category === "bug"
                    ? "What happened? Include the steps, expected result, and the device or browser you used."
                    : "Describe your idea and how it would improve the game.",
                )}
              </p>
              <textarea
                id="feedback-message"
                name="message"
                required
                minLength={10}
                maxLength={3000}
                rows={7}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                aria-describedby="feedback-help feedback-count"
                className="w-full resize-y rounded-xl border bg-background/40 px-4 py-3 text-base leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <p
                id="feedback-count"
                className="text-right text-xs tabular-nums text-muted-foreground"
              >
                {message.length.toLocaleString()} / 3,000
              </p>
            </div>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm leading-6 text-destructive"
            >
              {t(error)}
            </p>
          )}
          <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              {t(
                "Guests can send reports too. Only administrators can read them. Please leave out passwords and sensitive information.",
              )}
            </p>
            <Button type="submit" disabled={sending} className="shrink-0">
              <Send aria-hidden="true" />
              {t(sending ? "Sending report…" : "Send report")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
