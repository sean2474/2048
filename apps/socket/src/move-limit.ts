// A rolling window survives socket reconnects with the game state.
export function allowMove(timestamps: number[], now: number): boolean {
  while (timestamps.length && timestamps[0] <= now - 1000) timestamps.shift();
  if (timestamps.length >= 20) return false;
  timestamps.push(now);
  return true;
}
