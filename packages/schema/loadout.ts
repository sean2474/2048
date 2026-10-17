export type SkinTokens = {
  boardBackground: string;
  emptyBackground: string;
  tileRadius: string;
  tilePattern?: "dots" | "gingham" | "pinstripe" | "weave" | "runes" | "sunrise" | "magic-circle";
  tilePalette?: readonly string[];
  character?: "cat" | "bunny" | "sentinel" | "runeknight" | "arcanist" | "fox" | "dragon" | "phoenix";
};

export const SKIN_RARITIES = {
  common: { name: "Common", description: "Board colors." },
  rare: { name: "Rare", description: "Tile patterns." },
  epic: { name: "Epic", description: "Board and tile themes." },
  legendary: { name: "Legendary", description: "Character tiles." },
} as const;
export type SkinRarity = keyof typeof SKIN_RARITIES;
export type Skin = { id: string; name: string; description: string; rarity: SkinRarity; price: 0; tokens: SkinTokens };

export const SKINS = [
  { id: "classic", name: "Classic", description: "Default board and tiles.", rarity: "common", price: 0,
    tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem" } },
  { id: "slate", name: "Slate", description: "Slate frame with default tile colors.", rarity: "common", price: 0,
    tokens: { boardBackground: "#818b99", emptyBackground: "#cdd3dc", tileRadius: "0.375rem" } },
  { id: "paper", name: "Paper", description: "Paper-colored board with square tiles.", rarity: "common", price: 0,
    tokens: { boardBackground: "#d4cbb8", emptyBackground: "#f6f0e4", tileRadius: "0.125rem" } },
  { id: "confetti", name: "Confetti", description: "Polka-dot tiles.", rarity: "rare", price: 0,
    tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem", tilePattern: "dots" } },
  { id: "gingham", name: "Picnic", description: "Gingham-patterned tiles.", rarity: "rare", price: 0,
    tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem", tilePattern: "gingham" } },
  { id: "meadow", name: "Meadow", description: "Green board with pastel tiles.", rarity: "epic", price: 0,
    tokens: { boardBackground: "radial-gradient(ellipse at top left, #b3cda0, #627e64)", emptyBackground: "#d9e5ca", tileRadius: "0.65rem", tilePattern: "dots", tilePalette: ["#f4f3cc", "#e1edb3", "#c3e0b1", "#f2d6a7", "#f4bec0", "#d4c4ea"] } },
  { id: "tide", name: "Tide Pool", description: "Sea-glass board and tiles.", rarity: "epic", price: 0,
    tokens: { boardBackground: "linear-gradient(145deg, #97cfda, #527b9e)", emptyBackground: "#d5e9e9", tileRadius: "0.65rem", tilePattern: "gingham", tilePalette: ["#e4f3ee", "#c6e7e4", "#a9d7e6", "#b6c9ed", "#dac8eb", "#f0cbd6"] } },
  { id: "kitty", name: "Kitty Club", description: "Cat character tiles.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "linear-gradient(145deg, #e5b9a1, #b97864)", emptyBackground: "#f2d5bf", tileRadius: "0.6rem", character: "cat", tilePalette: ["#f9e1b2", "#f2cc9f", "#f3bda6", "#e9b0b5", "#d4bce6", "#bcd6c4"] } },
  { id: "bunny", name: "Bunny Garden", description: "Rabbit character tiles.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "linear-gradient(145deg, #c2b7da, #8c7eae)", emptyBackground: "#e2d9ed", tileRadius: "0.6rem", character: "bunny", tilePalette: ["#f5d9e6", "#e4ceef", "#c8d8ef", "#c4e2d4", "#e7e6b7", "#f5d3b5"] } },
  { id: "charcoal", name: "Charcoal", description: "Graphite frame and gray cells.", rarity: "common", price: 0,
    tokens: { boardBackground: "#41464d", emptyBackground: "#666c72", tileRadius: "0.4rem" } },
  { id: "espresso", name: "Espresso", description: "Coffee-colored board with default tiles.", rarity: "common", price: 0,
    tokens: { boardBackground: "#685347", emptyBackground: "#a18b79", tileRadius: "0.5rem" } },
  { id: "pinstripe", name: "Pinstripe", description: "Diagonal-striped tiles.", rarity: "rare", price: 0,
    tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem", tilePattern: "pinstripe" } },
  { id: "weave", name: "Woven Linen", description: "Woven-texture tiles.", rarity: "rare", price: 0,
    tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem", tilePattern: "weave" } },
  { id: "runes", name: "Rune Script", description: "Rune borders on tiles.", rarity: "rare", price: 0,
    tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem", tilePattern: "runes" } },
  { id: "aurora", name: "Aurora", description: "Aurora board and blue tiles.", rarity: "epic", price: 0,
    tokens: { boardBackground: "radial-gradient(ellipse at top left, #428880, transparent 65%), radial-gradient(ellipse at bottom right, #66548b, #202e40)", emptyBackground: "#324553", tileRadius: "0.5rem", tilePattern: "pinstripe", tilePalette: ["#d7ebe4", "#b7ddd6", "#a9d8df", "#b6c9e3", "#c7b8dc", "#ddc5df"] } },
  { id: "obsidian", name: "Obsidian", description: "Black stone board and brass tile borders.", rarity: "epic", price: 0,
    tokens: { boardBackground: "linear-gradient(135deg, #50545b, #20242b 60%, #54504a)", emptyBackground: "#62636a", tileRadius: "0.3rem", tilePattern: "weave", tilePalette: ["#e5e0d4", "#d5cbbb", "#dfcba2", "#d8b882", "#dfb18e", "#e6c47e"] } },
  { id: "astral", name: "Astral Archive", description: "Silver rune and star patterns.", rarity: "epic", price: 0,
    tokens: { boardBackground: "radial-gradient(circle at 20% 20%, #bba5df 1px, transparent 2px) 0 0 / 22px 22px, linear-gradient(135deg, #5e507e, #28273f)", emptyBackground: "#69627f", tileRadius: "0.5rem", tilePattern: "runes", tilePalette: ["#e8e1f4", "#d4c7e9", "#bebfe5", "#bdd6e5", "#d8c8df", "#ead7ac"] } },
  { id: "sentinel", name: "Iron Sentinel", description: "Mech character tiles.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "linear-gradient(135deg, #3d6576, #1e2c3b)", emptyBackground: "#536a78", tileRadius: "0.35rem", character: "sentinel", tilePalette: ["#a7beca", "#91b2be", "#8dc7cc", "#9caed3", "#b6a9cc", "#d4bc90"] } },
  { id: "runeknight", name: "Rune Knight", description: "Knight helmet tiles with amber runes.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "linear-gradient(135deg, #6c6260, #35343e)", emptyBackground: "#888180", tileRadius: "0.4rem", character: "runeknight", tilePalette: ["#c6bdac", "#b6baca", "#d2bda2", "#b4c9c7", "#c4b2d4", "#d9bf8b"] } },
  { id: "arcanist", name: "Arcane Order", description: "Wizard character tiles.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "radial-gradient(ellipse at top, #776490, #302d49)", emptyBackground: "#82768f", tileRadius: "0.5rem", character: "arcanist", tilePalette: ["#b2a5d1", "#a3b7d5", "#9ec6bf", "#c7b1cf", "#cbbd9c", "#bcb3dd"] } },
  { id: "dawn-oath", name: "Dawn Oath", description: "Rising-sun borders earned through seven days of attendance.", rarity: "rare", price: 0,
    tokens: { boardBackground: "#cbc5b6", emptyBackground: "#e1dccf", tileRadius: "0.5rem", tilePattern: "sunrise" } },
  { id: "rune-sanctum", name: "Rune Sanctum", description: "Jade stone and engraved magic circles for a 1024 milestone.", rarity: "epic", price: 0,
    tokens: { boardBackground: "repeating-linear-gradient(90deg, transparent 0 23%, #b9d7ca12 23% 24%, transparent 24% 25%), radial-gradient(ellipse at top, #658a7f, #243e3d)", emptyBackground: "#52736a", tileRadius: "0.4rem", tilePattern: "magic-circle", tilePalette: ["#e7eee1", "#cddfcf", "#b4d8ca", "#b8d4da", "#cbcce1", "#e4d6aa"] } },
  { id: "copper-sprint", name: "Copper Sprint", description: "Copper stripes celebrating your first solo 2048.", rarity: "rare", price: 0,
    tokens: { boardBackground: "linear-gradient(135deg, #ae7253, #654637)", emptyBackground: "#c8a58b", tileRadius: "0.4rem", tilePattern: "pinstripe" } },
  { id: "silver-current", name: "Silver Current", description: "Cool silver and blue for a ten-minute finish.", rarity: "rare", price: 0,
    tokens: { boardBackground: "linear-gradient(135deg, #a5bdcb, #344e67)", emptyBackground: "#829daa", tileRadius: "0.4rem", tilePattern: "weave" } },
  { id: "golden-flash", name: "Golden Flash", description: "Golden rays earned by reaching 2048 in six minutes.", rarity: "epic", price: 0,
    tokens: { boardBackground: "radial-gradient(ellipse at top left, #bd9344, #49331e)", emptyBackground: "#9e7d46", tileRadius: "0.4rem", tilePattern: "sunrise", tilePalette: ["#fff1c9", "#f8df9e", "#f2ce7a", "#eebc68", "#e8aa70", "#f2d991"] } },
  { id: "storm-fox", name: "Storm Fox", description: "A silver fox with lightning ears for a four-minute finish.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "linear-gradient(145deg, #526d92, #222d50)", emptyBackground: "#60728d", tileRadius: "0.5rem", character: "fox", tilePalette: ["#d8e8f8", "#bddbed", "#adc5ef", "#c4b9ee", "#d8c8f4", "#f1deaf"] } },
  { id: "chrono-dragon", name: "Chrono Dragon", description: "An emerald dragon guarding the two-minute record.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "radial-gradient(ellipse at top, #6b947b, #203e3c)", emptyBackground: "#648778", tileRadius: "0.5rem", character: "dragon", tilePalette: ["#dfedbd", "#beddbb", "#aad3ca", "#bbd9db", "#e2c6a5", "#f4d48f"] } },
  { id: "jade-path", name: "Jade Path", description: "Jade rune borders for your first endless 2048.", rarity: "rare", price: 0,
    tokens: { boardBackground: "#718d7d", emptyBackground: "#b6cbbb", tileRadius: "0.4rem", tilePattern: "runes" } },
  { id: "twilight-orbit", name: "Twilight Orbit", description: "Violet constellations earned at endless 4096.", rarity: "epic", price: 0,
    tokens: { boardBackground: "radial-gradient(ellipse at top right, #8a7dab, #303047)", emptyBackground: "#716d8d", tileRadius: "0.5rem", tilePattern: "magic-circle", tilePalette: ["#efe7f5", "#dcd2ed", "#cec6eb", "#c3d1eb", "#d9c3e8", "#edc8cc"] } },
  { id: "star-phoenix", name: "Star Phoenix", description: "A celestial phoenix awakened by an endless 8192 tile.", rarity: "legendary", price: 0,
    tokens: { boardBackground: "radial-gradient(ellipse at top, #a36c83, #352e53)", emptyBackground: "#886b87", tileRadius: "0.5rem", character: "phoenix", tilePalette: ["#f9debf", "#f2c7bb", "#eac1db", "#d8c1eb", "#c7d4ee", "#f5d995"] } },
] as const satisfies readonly Skin[];

export type SkinId = (typeof SKINS)[number]["id"];

export const ABILITIES = [
  { id: "clear-x", summary: "Remove one X block from your board.", name: "Clear X", role: "Recovery", description: "Remove exactly one X block automatically, starting with the oldest. This is the default ability for everyone.", tradeoff: "Hard blocks and incoming attacks stay unchanged. If there is no X block, no charge is spent.", status: "active", price: null },
  { id: "spawn-pause", summary: "No new number tiles for your next 3 moves.", name: "Breathing Room", role: "Recovery", description: "For your next 3 valid moves, no new number tiles appear. Use the space to prepare your next merge.", tradeoff: "Incoming obstacles still arrive. Moves that do not change the board do not count.", status: "active", price: null },
  { id: "frost-wave", summary: "Slow your opponent’s moves for 3 seconds.", name: "Slowdown", role: "Disruption", description: "After a 1-second warning, your opponent can move once every 0.4 seconds for 3 seconds.", tradeoff: "Attacks and abilities stay available. Movement is slowed, never fully blocked.", status: "active", price: null },
  { id: "anchor-tile", summary: "Keep your highest tile in place for 3 moves.", name: "Anchor", role: "Setup", description: "Fix one of your highest number tiles in place for your next 3 valid moves. Matching tiles can still merge into it.", tradeoff: "The merged tile stays anchored for the remaining moves. Other tiles move normally.", status: "active", price: null },
  { id: "swap-32", summary: "Swap an opponent’s 32 with a smaller tile.", name: "32 Swap", role: "Disruption", description: "Randomly swap one opponent tile worth exactly 32 with one worth 2, 4, 8 or 16.", tradeoff: "Never swaps two 32s. Larger tiles and obstacles stay put. Without a valid pair, no charge is spent.", status: "active", price: null },
] as const;

export type AbilityId = (typeof ABILITIES)[number]["id"];
export const DEFAULT_ABILITY_ID = "clear-x" satisfies AbilityId;
export const RETIRED_ABILITY_IDS: readonly string[] = ["shield", "break-hard", "self-shuffle", "opponent-shuffle", "delay-attack", "peek-next", "choose-next", "convert-ticket", "push-obstacle", "bomb-tile", "purge", "tile-swap", "combo-chain"];

export const MAX_COIN_BALANCE = Number.MAX_SAFE_INTEGER;
export type PlayerWallet = { player_id: string; balance: number; created_at: string };
