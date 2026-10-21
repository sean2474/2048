"use client";
import type { RankProgress as Progress } from "schema/ranking";
import { PLACEMENT_GAMES, ratingTier } from "schema/ranking";
import { useI18n } from "ui/i18n";

export function RankProgress({ rank, rating }: { rank: Progress; rating: number }) {
  const { t } = useI18n();
  if (!rank.tier)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Evaluating: {played}/{total}", {
          played: rank.placement_games,
          total: PLACEMENT_GAMES,
        })}
      </p>
    );
  const nextFloor = [1000, 1200, 1400, 1600, 1800].find((floor) => floor > rating);
  return (
    <p className="text-sm text-muted-foreground">
      {nextFloor === undefined
        ? t("Highest tier reached")
        : t("{points} Elo to {tier}", {
            points: nextFloor - rating,
            tier: t(ratingTier(nextFloor)),
          })}
    </p>
  );
}
