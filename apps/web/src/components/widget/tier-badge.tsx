"use client";
import { ratingTier } from "schema/ranking";
import { useI18n } from "ui/i18n";
import { TierBadgeView } from "./tier-visual";
export { TierIcon } from "./tier-visual";

export function TierBadge({ rating, tier: earnedTier, className }: { rating: number; tier?: ReturnType<typeof ratingTier> | null; className?: string }) {
  const { t } = useI18n();
  const tier = earnedTier === undefined ? ratingTier(rating) : earnedTier;
  return <TierBadgeView tier={tier} label={t(tier ?? "Evaluating")} className={className} />;
}
