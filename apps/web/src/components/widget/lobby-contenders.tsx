import type { ReactNode } from "react";

export function LobbyContenders({
  playerName,
  icon,
  t,
}: {
  playerName: string;
  icon: ReactNode;
  t: (key: string) => string;
}) {
  return (
    <div className="lobby-duel">
      <div className="lobby-player">
        <p className="lobby-side">
          {t("You")}
          <span aria-hidden="true">01</span>
        </p>
        <div className="lobby-portrait">{icon}</div>
        <p className="lobby-name" title={playerName}>
          {playerName}
        </p>
        <p className="lobby-player-caption">{t("Your contender")}</p>
      </div>
      <span className="lobby-vs" aria-hidden="true">
        VS
      </span>
      <div className="lobby-player lobby-opponent">
        <p className="lobby-side">
          {t("Opponent")}
          <span aria-hidden="true">02</span>
        </p>
        <div className="lobby-portrait lobby-radar" aria-hidden="true">
          <span className="lobby-radar-ring" />
          <span className="lobby-radar-core">?</span>
        </div>
        <p className="lobby-name">{t("Waiting for a match")}</p>
        <p className="lobby-player-caption" aria-hidden="true">
          —
        </p>
      </div>
    </div>
  );
}
