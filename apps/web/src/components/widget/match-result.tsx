"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { End } from "schema/in-game";
import { useI18n } from "ui/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GameEmblem } from "./game-emblem";
import { matchModeLabel } from "@/lib/multiplayer";
import "@/styles/match-result.css";

const recordingText = {
  guest: "Guest game · Sign in before your next game to keep a personal match history.",
  saving: "Saving your match…", saved: "Match saved to your history.",
  delayed: "Could not confirm that your result was saved. Check your history shortly.",
  unavailable: "Match history is unavailable on this server. This result has not been saved.",
};

function resultText(game: End) {
  const won = game.winner === "you";
  switch (game.reason) {
    case "reached_2048": return won ? "You reached 2048 first." : "Your opponent reached 2048 first.";
    case "opponent_locked": return won ? "Your opponent has no moves left." : "Your board has no moves left.";
    case "surrender": return won ? "Your opponent surrendered." : "You surrendered this round.";
    case "opponent_disconnected": return won ? "Your opponent did not reconnect in time." : "You did not reconnect in time.";
    case "draw": return "Both boards ran out of moves.";
  }
}

export function MatchResult({ game, names }: { game: End; names: { you: string; opp: string } }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(true);
  const summary = useRef<HTMLHeadingElement>(null);
  const outcome = game.winner === "you" ? "victory" : game.winner === "opp" ? "defeat" : "draw";
  const title = t(game.winner === "you" ? "You win!" : game.winner === "draw" ? "Draw" : "You lose.");
  const description = t(resultText(game));
  const actions = <>
    <Button asChild><Link href={game.mode === "friend" ? "/play/create" : game.mode === "ranked" ? "/play/ranked" : "/play/online"}>{t("Play again")}<ArrowRight aria-hidden="true" /></Link></Button>
    <Button asChild variant="outline"><Link href="/find-match">{t("Back to menu")}</Link></Button>
    {game.recording !== "guest" && <Button asChild variant="ghost"><Link href="/history">{t("Match history")}</Link></Button>}
  </>;

  return <>
    <section className="match-result space-y-2 text-center">
      <h2 ref={summary} tabIndex={-1} className="text-sm font-semibold">{description}</h2>
      <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      <p role="status" className="text-xs text-muted-foreground">{t(recordingText[game.recording])}</p>
    </section>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="match-end translate-x-0 translate-y-0" data-outcome={outcome} showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); summary.current?.focus(); }}>
        <div className="match-end-content">
          <p className="match-end-eyebrow">{t(matchModeLabel[game.mode])}<span />{t("Match complete")}</p>
          <div className="match-end-medal" aria-hidden="true"><div className="match-end-halo" /><GameEmblem kind={outcome === "victory" ? "crown" : outcome === "defeat" ? "profile" : "duel"} className="match-end-emblem" /></div>
          <DialogTitle className="match-end-title">{title}</DialogTitle>
          <DialogDescription className="match-end-description">{description}</DialogDescription>
          <div className="match-end-scoreboard" aria-label={t("Final score")}>
            <div data-winner={game.winner === "you"}><p className="match-end-side">{t("You")}</p><p className="match-end-name" title={names.you}>{names.you === "Guest" ? t("Guest") : names.you}</p><p className="match-end-score">{game.you.score.toLocaleString(locale)}</p><p className="match-end-score-label">{t("Score")}</p></div>
            <span className="match-end-score-vs" aria-hidden="true">VS</span>
            <div data-winner={game.winner === "opp"}><p className="match-end-side">{t("Opponent")}</p><p className="match-end-name" title={names.opp}>{names.opp === "Guest" ? t("Guest") : names.opp === "Opponent" ? t("Opponent") : names.opp}</p><p className="match-end-score">{game.opp ? game.opp.score.toLocaleString(locale) : "—"}</p><p className="match-end-score-label">{t("Score")}</p></div>
          </div>
          <div className="match-end-actions">{actions}</div>
          <p className="match-end-recording" role="status">{t(recordingText[game.recording])}</p>
          <DialogClose asChild><button type="button" className="match-end-dismiss">{t("View final board")}<ChevronDown size={15} aria-hidden="true" /></button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
