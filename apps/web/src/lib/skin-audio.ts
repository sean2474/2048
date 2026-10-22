import type { SkinTokens } from "schema/loadout";

export type AudioVoice = {
  frequency: number;
  to?: number;
  at?: number;
  duration: number;
  wave?: OscillatorType | "noise";
  gain?: number;
  attack?: number;
  cutoff?: number;
};

type Material =
  | "wood"
  | "paper"
  | "cloth"
  | "stone"
  | "water"
  | "garden"
  | "metal"
  | "crystal"
  | "magic"
  | "air"
  | "sun";
type Palette = { move: readonly AudioVoice[]; merge: readonly AudioVoice[] };
// Short, quiet gestures keep fast play tactile; longer resonances belong to merges.
const palettes: Record<Material, Palette> = {
  wood: {
    move: [
      { frequency: 260, to: 150, duration: 0.045, wave: "triangle", gain: 0.045, cutoff: 900 },
    ],
    merge: [
      { frequency: 392, to: 370, duration: 0.12, wave: "triangle", gain: 0.07, cutoff: 1400 },
      { frequency: 784, duration: 0.075, at: 0.035, gain: 0.025 },
    ],
  },
  paper: {
    move: [{ frequency: 1800, to: 650, duration: 0.06, wave: "noise", gain: 0.05, attack: 0.012 }],
    merge: [
      { frequency: 2400, to: 800, duration: 0.08, wave: "noise", gain: 0.065 },
      { frequency: 950, to: 400, at: 0.055, duration: 0.07, wave: "noise", gain: 0.045 },
      { frequency: 360, to: 240, duration: 0.06, wave: "triangle", gain: 0.035 },
    ],
  },
  cloth: {
    move: [{ frequency: 700, to: 320, duration: 0.065, wave: "noise", gain: 0.045, attack: 0.015 }],
    merge: [
      { frequency: 900, to: 380, duration: 0.11, wave: "noise", gain: 0.055, attack: 0.02 },
      { frequency: 330, to: 294, duration: 0.12, wave: "triangle", gain: 0.05, cutoff: 700 },
    ],
  },
  stone: {
    move: [
      { frequency: 180, to: 90, duration: 0.045, gain: 0.055 },
      { frequency: 950, to: 400, duration: 0.025, wave: "noise", gain: 0.04 },
    ],
    merge: [
      { frequency: 145, to: 65, duration: 0.14, gain: 0.075 },
      { frequency: 730, duration: 0.07, wave: "triangle", gain: 0.035, cutoff: 1100 },
      { frequency: 1700, to: 500, duration: 0.045, wave: "noise", gain: 0.05 },
    ],
  },
  water: {
    move: [{ frequency: 620, to: 310, duration: 0.065, gain: 0.045 }],
    merge: [
      { frequency: 1050, to: 420, duration: 0.11, gain: 0.065 },
      { frequency: 1400, to: 700, at: 0.075, duration: 0.14, gain: 0.045 },
      { frequency: 2200, to: 1000, duration: 0.07, wave: "noise", gain: 0.02, attack: 0.02 },
    ],
  },
  garden: {
    move: [
      { frequency: 430, to: 380, duration: 0.055, wave: "triangle", gain: 0.04, cutoff: 1000 },
      { frequency: 2800, to: 1400, duration: 0.04, wave: "noise", gain: 0.018 },
    ],
    merge: [
      { frequency: 587, duration: 0.14, wave: "triangle", gain: 0.055, cutoff: 1500 },
      { frequency: 1175, to: 1319, at: 0.055, duration: 0.1, gain: 0.03 },
      { frequency: 2200, to: 1200, duration: 0.08, wave: "noise", gain: 0.018, attack: 0.02 },
    ],
  },
  metal: {
    move: [
      { frequency: 480, duration: 0.045, wave: "triangle", gain: 0.04 },
      { frequency: 1427, duration: 0.035, gain: 0.025 },
    ],
    merge: [
      { frequency: 360, duration: 0.19, wave: "triangle", gain: 0.06 },
      { frequency: 973, duration: 0.14, gain: 0.035 },
      { frequency: 1657, at: 0.008, duration: 0.09, gain: 0.02 },
      { frequency: 3200, to: 1200, duration: 0.025, wave: "noise", gain: 0.035 },
    ],
  },
  crystal: {
    move: [
      { frequency: 1319, duration: 0.07, gain: 0.035 },
      { frequency: 2790, duration: 0.035, gain: 0.012 },
    ],
    merge: [
      { frequency: 1047, duration: 0.22, gain: 0.05 },
      { frequency: 2710, duration: 0.13, at: 0.012, gain: 0.02 },
      { frequency: 1568, duration: 0.24, at: 0.07, gain: 0.03 },
    ],
  },
  magic: {
    move: [{ frequency: 294, to: 440, duration: 0.08, gain: 0.04, attack: 0.012 }],
    merge: [
      { frequency: 294, duration: 0.26, wave: "triangle", gain: 0.05, attack: 0.025, cutoff: 900 },
      { frequency: 440, to: 587, at: 0.05, duration: 0.2, gain: 0.035, attack: 0.03 },
      { frequency: 1760, duration: 0.13, at: 0.16, gain: 0.02 },
    ],
  },
  air: {
    move: [
      { frequency: 1700, to: 2700, duration: 0.075, wave: "noise", gain: 0.035, attack: 0.02 },
      { frequency: 784, duration: 0.065, gain: 0.02, attack: 0.015 },
    ],
    merge: [
      { frequency: 659, duration: 0.25, gain: 0.045, attack: 0.035 },
      { frequency: 988, duration: 0.28, at: 0.055, gain: 0.03, attack: 0.04 },
      { frequency: 1400, to: 3600, duration: 0.18, wave: "noise", gain: 0.02, attack: 0.04 },
    ],
  },
  sun: {
    move: [{ frequency: 523, duration: 0.06, wave: "triangle", gain: 0.04, cutoff: 1200 }],
    merge: [
      { frequency: 523, duration: 0.18, wave: "triangle", gain: 0.055, cutoff: 1600 },
      { frequency: 659, duration: 0.16, at: 0.045, gain: 0.035 },
      { frequency: 784, duration: 0.2, at: 0.09, gain: 0.03 },
    ],
  },
};
const skins: Record<string, Material> = {
  classic: "wood",
  slate: "stone",
  paper: "paper",
  charcoal: "stone",
  espresso: "wood",
  confetti: "garden",
  gingham: "cloth",
  meadow: "garden",
  tide: "water",
  pinstripe: "paper",
  weave: "cloth",
  runes: "magic",
  aurora: "air",
  obsidian: "stone",
  astral: "crystal",
  "dawn-oath": "sun",
  "rune-sanctum": "magic",
  "copper-sprint": "metal",
  "silver-current": "water",
  "golden-flash": "sun",
  "jade-path": "stone",
  "twilight-orbit": "air",
  "rank-bronze": "metal",
  "rank-silver": "metal",
  "rank-gold": "sun",
  "rank-platinum": "air",
};
const characters: Record<NonNullable<SkinTokens["character"]>, Material> = {
  cat: "cloth",
  bunny: "garden",
  fox: "air",
  dragon: "stone",
  phoenix: "sun",
  sentinel: "metal",
  runeknight: "metal",
  arcanist: "magic",
  diamond: "crystal",
  crown: "sun",
};
const patterns: Record<NonNullable<SkinTokens["tilePattern"]>, Material> = {
  dots: "garden",
  gingham: "cloth",
  pinstripe: "paper",
  weave: "cloth",
  runes: "magic",
  sunrise: "sun",
  "magic-circle": "magic",
  shield: "metal",
  crossguard: "metal",
  laurel: "sun",
  compass: "air",
};
export function skinAudioMaterial(tokens?: SkinTokens, skinId?: string): Material | undefined {
  if (tokens?.character) return characters[tokens.character];
  if (skinId && Object.hasOwn(skins, skinId)) return skins[skinId];
  if (tokens?.tilePattern) return patterns[tokens.tilePattern];
  return undefined;
}
export function skinGesture(
  sound: "move" | "merge",
  tokens?: SkinTokens,
  skinId?: string,
): readonly AudioVoice[] | undefined {
  const material = skinAudioMaterial(tokens, skinId);
  return material ? palettes[material][sound] : undefined;
}

// Alternate articulation as well as pitch: never turn every merge into the same ascending scale.
export function varyGesture(notes: readonly AudioVoice[], variant: number): readonly AudioVoice[] {
  const step = variant % 4;
  return notes.map((note, index) => ({
    ...note,
    frequency:
      note.frequency *
      (note.wave === "noise" ? [1, 0.82, 1.12, 0.93][step] : [1, 1.05946, 0.94387, 1][step]),
    to:
      note.to === undefined
        ? undefined
        : note.to *
          (note.wave === "noise" ? [1, 0.82, 1.12, 0.93][step] : [1, 1.05946, 0.94387, 1][step]),
    at: (note.at ?? 0) * [1, 0.78, 1.12, 0.9][step] + (step === 3 && index > 0 ? 0.018 : 0),
    duration: note.duration * [1, 0.88, 1.06, 0.94][step],
    gain: (note.gain ?? 0.06) * (index === step % notes.length ? 1 : [1, 0.84, 0.92, 0.78][step]),
  }));
}
