import "server-only";
import { ratingTier } from "schema/ranking";
import { TierBadgeView } from "./tier-visual";
export { TierIcon } from "./tier-visual";

export function TierBadge({
  rating,
  tier: earnedTier,
  className,
  t,
}: {
  rating: number;
  tier?: ReturnType<typeof ratingTier> | null;
  className?: string;
  t: (key: string) => string;
}) {
  const tier = earnedTier === undefined ? ratingTier(rating) : earnedTier;
  return <TierBadgeView tier={tier} label={t(tier ?? "Evaluating")} className={className} />;
}
