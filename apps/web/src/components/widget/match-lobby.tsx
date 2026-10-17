"use client";
import { useI18n } from "ui/i18n";
import Link from "next/link";
import { GameEmblem } from "@/components/widget/game-emblem";
import { ArrowLeft, ArrowRight, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatchIntro } from "@/components/widget/match-intro";
import { useLobby } from "@/hooks/use-lobby";
import { usePlayer } from "@/hooks/use-player";
import { useLoadout } from "@/hooks/use-loadout";
import { ProfileIcon } from "@/components/widget/profile-icon";
import { trackGameEvent } from "@/lib/analytics";
import "@/styles/match-lobby.css";

export function MatchLobby({ mode }: { mode: "casual" | "ranked" }) {
  const { t } = useI18n();
  const { user, player } = usePlayer();
  const { icon } = useLoadout();
  const ranked = mode === "ranked";
  const canSearch = !ranked || !!user && !user.is_anonymous;
  const { status, error, retry, match, enterMatch } = useLobby("findMatch", undefined, mode, canSearch);
  const accountStatus = user === undefined ? "Checking your account…" : "Sign in to play ranked matches.";
  const searching = canSearch && !error && !match;
  const playerName = player?.name || t(user && !user.is_anonymous ? "You" : "Guest");
  return <main className="match-lobby mx-auto w-full max-w-[800px] px-4 py-6 sm:py-10">
    <section className="lobby-arena" data-searching={searching} aria-labelledby="lobby-title">
      <header className="lobby-heading">
        <p className="lobby-eyebrow"><GameEmblem kind="duel" className="size-4" />2048 DUO<span />{t("Matchmaking")}</p>
        <h1 id="lobby-title">{ranked ? t("Ranked match") : t("Casual match")}</h1>
      </header>
      <div className="lobby-duel">
        <div className="lobby-player">
          <p className="lobby-side">{t("You")}<span aria-hidden="true">01</span></p>
          <div className="lobby-portrait"><ProfileIcon iconId={icon.id} className="lobby-icon" /></div>
          <p className="lobby-name" title={playerName}>{playerName}</p>
          <p className="lobby-player-caption">{t("Your contender")}</p>
        </div>
        <span className="lobby-vs" aria-hidden="true">VS</span>
        <div className="lobby-player lobby-opponent">
          <p className="lobby-side">{t("Opponent")}<span aria-hidden="true">02</span></p>
          <div className="lobby-portrait lobby-radar" aria-hidden="true"><span className="lobby-radar-ring" /><span className="lobby-radar-core">?</span></div>
          <p className="lobby-name">{t("Waiting for a match")}</p>
          <p className="lobby-player-caption" aria-hidden="true">—</p>
        </div>
      </div>
      <div className="lobby-status" data-error={!!error}>
        <div className="lobby-search-track" aria-hidden="true"><span /></div>
        <div className="lobby-status-line">{error || !canSearch && user !== undefined ? <ShieldAlert size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}<p role={error ? "alert" : "status"}>{canSearch ? error || status : t(accountStatus)}</p></div>
        <p className="lobby-help">{t(ranked ? "Ranked matches affect Elo. Your first 10 matches establish your tier; after that, tiers change automatically with Elo. Elo and your established tier carry over between seasons. Complete 10 ranked matches each season to enter its standings." : "Casual matches do not affect Elo.")}</p>
      </div>
      <div className="lobby-actions">
        {canSearch && error && <Button className="lobby-primary" onClick={retry}>{t("Try again")}<ArrowRight aria-hidden="true" /></Button>}
        {!canSearch && user !== undefined && <Button asChild className="lobby-primary"><Link href="/login">{t("Sign in for ranked")}<ArrowRight aria-hidden="true" /></Link></Button>}
        <Button asChild variant="outline" className="lobby-cancel"><Link href="/find-match" onClick={() => { if (searching) trackGameEvent("queue_cancel_clicked", { mode }); }}><ArrowLeft aria-hidden="true" />{canSearch ? t("Cancel search") : t("Back to menu")}</Link></Button>
      </div>
    </section>
  <MatchIntro match={match} onEnter={enterMatch} /></main>;
}
