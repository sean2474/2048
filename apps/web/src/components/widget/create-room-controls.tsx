"use client";
import { useI18n } from "ui/i18n";
import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchIntro } from "@/components/widget/match-intro";
import { useLobby } from "@/hooks/use-lobby";
export function CreateRoomControls() {
  const { t } = useI18n();
  const { joinCode, status, error, retry, match } = useLobby("createRoomWithCode");
  const [copyStatus, setCopyStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopyStatus("Code copied!");
    } catch {
      setCopyStatus("Copy unavailable. Select the code and copy it manually.");
    }
  }
  return (
    <>
      {joinCode && !error ? (
        <div className="my-6 space-y-4 border-y py-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("Your room code")}
          </p>
          <p
            data-testid="join-code"
            className="font-mono text-4xl font-bold tracking-[0.16em] select-all sm:text-5xl"
          >
            {joinCode}
          </p>
          <Button variant="outline" onClick={copy}>
            <Copy aria-hidden="true" />
            {t("Copy code")}
          </Button>
          {copyStatus && (
            <p role="status" className="text-sm leading-6">
              {t(copyStatus)}
            </p>
          )}
        </div>
      ) : null}
      <div className="my-6 flex min-h-11 items-center gap-3">
        {!error && (
          <Loader2
            aria-hidden="true"
            className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
          />
        )}
        <p
          className={`text-sm leading-6 ${error ? "text-destructive" : "text-muted-foreground"}`}
          role={error ? "alert" : "status"}
        >
          {error || status}
        </p>
      </div>
      {joinCode && !error && (
        <p className="mb-6 text-sm leading-6 text-muted-foreground">
          {t("Ask your friend to choose Join Room and enter this code. Keep this page open.")}
        </p>
      )}
      {error && (
        <Button className="w-full" onClick={retry}>
          {t("Try again")}
        </Button>
      )}
      <MatchIntro match={match} />
    </>
  );
}
