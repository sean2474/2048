"use client";
import { useI18n } from "ui/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LobbyContenders } from "./lobby-contenders";
import { MatchIntro } from "@/components/widget/match-intro";
import { useLobby } from "@/hooks/use-lobby";
import { usePlayer } from "@/hooks/use-player";
import { useLoadout } from "@/hooks/use-loadout";
import { ProfileIcon } from "@/components/widget/profile-icon";
import { trackGameEvent } from "@/lib/analytics";

export function MatchLobby({ mode, rules }: { mode: "casual" | "ranked"; rules: ReactNode }) {
  const { t } = useI18n();
  const { user, player } = usePlayer();
  const { icon } = useLoadout();
  const { status, error, retry, match } = useLobby("findMatch", undefined, mode);
  const searching = !error && !match;
  const playerName = player?.name || t(user && !user.is_anonymous ? "You" : "Guest");
  return (
    <>
      <div className="lobby-queue" data-searching={searching}>
        <LobbyContenders
          playerName={playerName}
          icon={<ProfileIcon iconId={icon.id} className="lobby-icon" />}
          t={t}
        />
        <div className="lobby-status" data-error={!!error}>
          <div className="lobby-search-track" aria-hidden="true">
            <span />
          </div>
          <div className="lobby-status-line">
            {error ? (
              <ShieldAlert size={18} aria-hidden="true" />
            ) : (
              <Search size={18} aria-hidden="true" />
            )}
            <p role={error ? "alert" : "status"}>{error || status}</p>
          </div>
          {rules}
        </div>
        <div className="lobby-actions">
          {error && (
            <Button className="lobby-primary" onClick={retry}>
              {t("Try again")}
              <ArrowRight aria-hidden="true" />
            </Button>
          )}
          <Button asChild variant="outline" className="lobby-cancel">
            <Link
              href="/find-match"
              onClick={() => {
                if (searching) trackGameEvent("queue_cancel_clicked", { mode });
              }}
            >
              <ArrowLeft aria-hidden="true" />
              {t("Cancel search")}
            </Link>
          </Button>
        </div>
      </div>
      <MatchIntro match={match} />
    </>
  );
}
