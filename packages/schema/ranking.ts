export const INITIAL_RATING = 1200;
export const PLACEMENT_GAMES = 10;
export const SEASON_QUALIFYING_GAMES = 10;
export const TIERS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"] as const;
export type Tier = typeof TIERS[number];
export type RankProgress = { tier: Tier | null; placement_games: number };
export type RankSnapshot = { rating: number; rank: RankProgress };
export type RankSeason = { id: string; name: string; starts_at: string; ends_at: string | null };

export function ratingTier(rating: number) {
  if (rating < 1000) return "Bronze";
  if (rating < 1200) return "Silver";
  if (rating < 1400) return "Gold";
  if (rating < 1600) return "Platinum";
  if (rating < 1800) return "Diamond";
  return "Master";
}
