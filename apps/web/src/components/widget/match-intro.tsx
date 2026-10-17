"use client";

import { Swords } from "lucide-react";
import type { MatchFound } from "schema/in-game";
import { useI18n } from "ui/i18n";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProfileIcon } from "./profile-icon";
import { TierBadge } from "./tier-badge";
import { RankProgress } from "./rank-progress";
import { matchModeLabel } from "@/lib/multiplayer";
import "@/styles/match-intro.css";

export function MatchIntro({ match }: { match: MatchFound | null }) {
  const { t, locale } = useI18n();
  if (!match) return null;
  return <Dialog open>
    <DialogContent className="match-intro translate-x-0 translate-y-0" showCloseButton={false}>
      <div className="match-intro-content">
        <header className="match-intro-heading">
          <p className="match-intro-mode"><Swords aria-hidden="true" size={16} />2048 DUO<span />{t(matchModeLabel[match.mode])}</p>
          <DialogTitle className="match-intro-title">{t("Match found")}</DialogTitle>
          <DialogDescription className="match-intro-description">{t("Your match will start shortly.")}</DialogDescription>
        </header>
        <div className="match-intro-versus">
          {(["you", "opp"] as const).map((side, index) => {
            const player = match.players[side];
            return <div key={side} className={`match-intro-player match-intro-${side}`}>
              <p className="match-intro-side">{t(side === "you" ? "You" : "Opponent")}<span aria-hidden="true">0{index + 1}</span></p>
              <div className="match-intro-portrait"><ProfileIcon iconId={player.iconId} className="match-intro-icon" /></div>
              <h3 className="match-intro-name" title={player.name}>{player.iconId === "guest" ? t("Guest") : player.name}</h3>
              <div className="match-intro-rank">{player.rating === null ? <span className="match-intro-unranked">{t("Unranked")}</span> : <><TierBadge rating={player.rating} tier={player.rank?.tier ?? null} /><span className="match-intro-rating">{player.rating.toLocaleString(locale)} <span>ELO</span></span></>}</div>
              {player.rating !== null && player.rank && !player.rank.tier && <div className="mt-2"><RankProgress rank={player.rank} rating={player.rating} /></div>}
            </div>;
          })}
          <div className="match-intro-vs" aria-hidden="true"><span>VS</span></div>
        </div>
        <footer className="match-intro-footer">
          <div className="match-intro-progress" aria-hidden="true"><span /></div>
          <div className="match-intro-bottom"><p role="status">{t("Entering the arena…")}</p></div>
        </footer>
      </div>
    </DialogContent>
  </Dialog>;
}
