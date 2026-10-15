export const INITIAL_RATING = 1200;

export function ratingTier(rating: number) {
  if (rating < 1000) return "Bronze";
  if (rating < 1200) return "Silver";
  if (rating < 1400) return "Gold";
  if (rating < 1600) return "Platinum";
  if (rating < 1800) return "Diamond";
  return "Master";
}
