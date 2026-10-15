"use client";
import { useI18n } from "ui/i18n";
import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MatchIntro } from "@/components/widget/match-intro";
import { useLobby } from "@/hooks/use-lobby";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
export default function JoinRoomPage() {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState<string>();
  const { status, error, retry, match, enterMatch } = useLobby("joinRoomWithCode", submitted);
  const busy = !!submitted && !error;
  return <main className="mx-auto w-full max-w-[520px] px-4 py-8 sm:py-12"><section className="game-panel bg-card p-6 sm:p-8">
    <GameEmblem kind="friend" className="mb-6 size-20" />
    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("Friend match · No Elo changes")}</p>
    <h1 className="text-3xl font-extrabold tracking-tight">{t("Join a friend")}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("Enter the 6-character room code.")}</p>
    <form className="my-6 space-y-5" onSubmit={event => {
      event.preventDefault();
      if (!/^[A-Z0-9]{6}$/.test(code)) return;
      if (submitted === code) retry(); else setSubmitted(code);
    }}>
      <div className="grid gap-2"><label htmlFor="room-code" className="text-sm font-semibold">{t("Room code")}</label>
      <input id="room-code" value={code} maxLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={t("ABC123")}
        className="h-20 w-full rounded-xl border bg-background/50 px-4 text-center font-mono text-3xl uppercase tracking-[0.16em] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
        onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} disabled={busy} /></div>
      {(submitted || error) && <p className={`text-sm leading-6 ${error ? "text-destructive" : "text-muted-foreground"}`} role={error ? "alert" : "status"}>{error || status}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{busy ? t("Joining...") : t("Join room")}{!busy && <ArrowRight aria-hidden="true" />}</Button>
    </form>
    <Button asChild variant="outline" className="w-full"><Link href="/find-match"><ArrowLeft aria-hidden="true" />{t("Back to menu")}</Link></Button>
  </section><MatchIntro match={match} onEnter={enterMatch} /></main>;
}
