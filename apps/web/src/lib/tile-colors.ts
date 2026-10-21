export function tileBg(v: number) {
  if (v === 0) return "#e1dccf";
  const map: Record<number, string> = {
    2: "#eee4da",
    4: "#ede0c8",
    8: "#f2b179",
    16: "#f59563",
    32: "#f67c5f",
    64: "#f65e3b",
    128: "#edcf72",
    256: "#edcc61",
    512: "#edc850",
    1024: "#edc53f",
    2048: "#edc22e",
  };
  return map[v] ?? "#ccc";
}
export function tileFg(v: number) {
  return v <= 4 ? "#776e65" : "#f9f6f2";
}

export function tileTextColor(background: string) {
  const hex = background.slice(1, 7);
  const channels = hex.length === 3 ? [...hex].map((value) => value + value) : hex.match(/../g)!;
  const luminance = channels
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
