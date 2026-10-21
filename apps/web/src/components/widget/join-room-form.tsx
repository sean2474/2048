"use client";
import { useI18n } from "ui/i18n";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MatchIntro } from "@/components/widget/match-intro";
import { useLobby } from "@/hooks/use-lobby";
import { ArrowRight, Loader2 } from "lucide-react";
export function JoinRoomForm() {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState<string>();
  const { status, error, retry, match } = useLobby("joinRoomWithCode", submitted);
  const busy = !!submitted && !error;
  return (
    <>
      <form
        className="my-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!/^[A-Z0-9]{6}$/.test(code)) return;
          if (submitted === code) retry();
          else setSubmitted(code);
        }}
      >
        <div className="grid gap-2">
          <label htmlFor="room-code" className="text-sm font-semibold">
            {t("Room code")}
          </label>
          <input
            id="room-code"
            value={code}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={t("ABC123")}
            className="h-20 w-full rounded-xl border bg-background/50 px-4 text-center font-mono text-3xl uppercase tracking-[0.16em] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
            onChange={(event) =>
              setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            disabled={busy}
          />
        </div>
        {(submitted || error) && (
          <p
            className={`text-sm leading-6 ${error ? "text-destructive" : "text-muted-foreground"}`}
            role={error ? "alert" : "status"}
          >
            {error || status}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
          {busy && (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          )}
          {busy ? t("Joining...") : t("Join room")}
          {!busy && <ArrowRight aria-hidden="true" />}
        </Button>
      </form>
      <MatchIntro match={match} />
    </>
  );
}
