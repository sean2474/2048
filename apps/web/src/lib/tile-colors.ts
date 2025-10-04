export function tileBg(v: number) {
  if (v === 0) return "var(--color-bg)";
  const map: Record<number, string> = {
    2: "#eee4da", 4: "#ede0c8",
    8: "#f2b179", 16: "#f59563",
    32: "#f67c5f", 64: "#f65e3b",
    128: "#edcf72", 256: "#edcc61",
    512: "#edc850", 1024: "#edc53f", 2048: "#edc22e",
  };
  return map[v] ?? "#ccc";
}
export function tileFg(v: number) {
  return v <= 4 ? "#776e65" : "#f9f6f2";
}
