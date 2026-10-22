import { skinGesture, varyGesture, type AudioVoice as Voice } from "./skin-audio";
import { ABILITY_CHARGE, type PublicPlayerState, type S2C } from "schema/in-game";
import { type SkinTokens, type AbilityId } from "schema/loadout";

export const AUDIO_STORAGE_KEY = "duo.audio";
export const DEFAULT_AUDIO = { muted: false, volume: 0.45 };
export type AudioSettings = typeof DEFAULT_AUDIO;
export type GameSound =
  | "move"
  | "merge"
  | "xblock"
  | "hardblock"
  | "incoming"
  | "impact"
  | "start"
  | "win"
  | "lose"
  | "draw"
  | AbilityId;

export function parseAudioSettings(raw: string | null): AudioSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      value &&
      typeof value.muted === "boolean" &&
      typeof value.volume === "number" &&
      Number.isFinite(value.volume) &&
      value.volume >= 0 &&
      value.volume <= 1
    ) {
      return { muted: value.muted, volume: value.volume };
    }
  } catch {
    /* Invalid saved settings use the default volume. */
  }
  return { ...DEFAULT_AUDIO };
}

type AudioPlayer = Pick<PublicPlayerState, "board" | "score" | "attacksSent"> &
  Partial<Pick<PublicPlayerState, "ability">>;
export function playerSound(previous: AudioPlayer, next: AudioPlayer): GameSound | null {
  if (
    previous.ability &&
    next.ability &&
    previous.ability.id === next.ability.id &&
    previous.ability.charge >= ABILITY_CHARGE &&
    next.ability.charge < ABILITY_CHARGE
  )
    return next.ability.id;
  for (const type of ["hardblock", "xblock"] as const) {
    if ((next.attacksSent?.[type] ?? 0) > (previous.attacksSent?.[type] ?? 0)) return type;
  }
  const before = previous.board.filter((tile) => !tile.ghost);
  const after = next.board.filter((tile) => !tile.ghost);
  if (
    after.some(
      (tile) =>
        (tile.blockType === "xblock" || tile.blockType === "hardblock") &&
        !before.some((old) => old.id === tile.id),
    )
  )
    return "impact";
  if (next.score > previous.score) return "merge";
  if (
    after.length !== before.length ||
    after.some(
      (tile) =>
        !before.some(
          (old) =>
            old.id === tile.id &&
            old.row === tile.row &&
            old.col === tile.col &&
            old.value === tile.value,
        ),
    )
  )
    return "move";
  return null;
}

type GameState = Extract<S2C, { t: "state" | "end" }>;
export function matchSound(previous: GameState | null, next: GameState): GameSound | null {
  if (previous?.t === "end") return null;
  if (next.t === "end")
    return next.winner === "you" ? "win" : next.winner === "opp" ? "lose" : "draw";
  if (!previous) return next.paused ? null : "start";
  if (next.paused) return null;
  if (previous.paused) return previous.reconnectDeadline ? null : "start";
  return (
    playerSound(previous.you, next.you) ??
    (next.pendingAttacks > previous.pendingAttacks ? "incoming" : null)
  );
}

// Tone, texture and rhythm identify an event even without seeing the board.
const sounds: Record<GameSound, readonly Voice[]> = {
  move: [
    { frequency: 310, to: 190, duration: 0.045, wave: "triangle", gain: 0.045 },
    { frequency: 1800, to: 700, duration: 0.028, wave: "noise", gain: 0.025 },
  ],
  merge: [
    { frequency: 440, to: 438, duration: 0.19, wave: "triangle", gain: 0.075, cutoff: 1800 },
    { frequency: 880, duration: 0.27, at: 0.035, gain: 0.04 },
  ],
  xblock: [
    { frequency: 720, to: 180, duration: 0.17, wave: "sawtooth", gain: 0.055, cutoff: 1900 },
    { frequency: 3800, to: 900, duration: 0.1, wave: "noise", gain: 0.05 },
  ],
  hardblock: [
    { frequency: 150, to: 48, duration: 0.28, gain: 0.08 },
    { frequency: 73, to: 41, duration: 0.3, at: 0.025, wave: "triangle", gain: 0.06 },
    { frequency: 1500, to: 350, duration: 0.09, wave: "noise", gain: 0.07 },
  ],
  incoming: [
    { frequency: 740, duration: 0.07, wave: "square", gain: 0.035, cutoff: 1200 },
    { frequency: 554, duration: 0.1, at: 0.12, wave: "square", gain: 0.035, cutoff: 1000 },
  ],
  impact: [
    { frequency: 95, to: 38, duration: 0.19, gain: 0.075 },
    { frequency: 600, to: 170, duration: 0.15, wave: "noise", gain: 0.075 },
    { frequency: 230, to: 110, duration: 0.07, at: 0.035, wave: "triangle", gain: 0.04 },
  ],
  start: [
    { frequency: 392, duration: 0.06, wave: "triangle", gain: 0.06 },
    { frequency: 392, duration: 0.06, at: 0.1, wave: "triangle", gain: 0.06 },
    {
      frequency: 523,
      duration: 0.26,
      at: 0.22,
      wave: "sawtooth",
      gain: 0.05,
      attack: 0.015,
      cutoff: 1100,
    },
    { frequency: 1046, duration: 0.24, at: 0.22, gain: 0.025 },
  ],
  win: [
    { frequency: 523, duration: 0.17, wave: "triangle", gain: 0.065 },
    { frequency: 659, duration: 0.17, at: 0.11, wave: "triangle", gain: 0.065 },
    { frequency: 784, duration: 0.23, at: 0.22, wave: "triangle", gain: 0.065 },
    { frequency: 1046, duration: 0.52, at: 0.38, gain: 0.06 },
    { frequency: 523, duration: 0.48, at: 0.38, wave: "triangle", gain: 0.04 },
    {
      frequency: 4200,
      to: 2200,
      duration: 0.2,
      at: 0.38,
      wave: "noise",
      gain: 0.025,
      attack: 0.03,
    },
  ],
  lose: [
    {
      frequency: 220,
      to: 146.83,
      duration: 0.42,
      wave: "triangle",
      gain: 0.065,
      attack: 0.025,
      cutoff: 650,
    },
    { frequency: 164.81, to: 110, duration: 0.5, at: 0.22, gain: 0.045, attack: 0.035 },
    { frequency: 900, to: 220, duration: 0.36, at: 0.1, wave: "noise", gain: 0.025, attack: 0.08 },
  ],
  draw: [
    { frequency: 392, duration: 0.24, wave: "triangle", gain: 0.06 },
    { frequency: 587, duration: 0.24, at: 0.12, wave: "triangle", gain: 0.045 },
    { frequency: 440, duration: 0.32, at: 0.3, gain: 0.04 },
  ],
  "clear-x": [
    { frequency: 1600, to: 250, duration: 0.12, wave: "noise", gain: 0.065 },
    { frequency: 880, to: 1320, duration: 0.18, at: 0.05, gain: 0.055 },
  ],
  "spawn-pause": [
    { frequency: 350, to: 1100, duration: 0.35, wave: "noise", gain: 0.045, attack: 0.1 },
    { frequency: 349, duration: 0.42, wave: "triangle", gain: 0.045, attack: 0.07, cutoff: 700 },
    { frequency: 523, duration: 0.38, at: 0.08, gain: 0.035, attack: 0.07 },
  ],
  "frost-wave": [
    { frequency: 5000, to: 950, duration: 0.34, wave: "noise", gain: 0.055, attack: 0.03 },
    { frequency: 1760, to: 880, duration: 0.24, gain: 0.04 },
    { frequency: 2637, to: 1319, duration: 0.2, at: 0.09, gain: 0.025 },
  ],
  "anchor-tile": [
    { frequency: 110, to: 55, duration: 0.23, wave: "triangle", gain: 0.075 },
    { frequency: 2100, to: 800, duration: 0.035, at: 0.09, wave: "noise", gain: 0.065 },
    { frequency: 330, duration: 0.11, at: 0.1, wave: "square", gain: 0.025, cutoff: 700 },
  ],
  "swap-32": [
    { frequency: 330, to: 990, duration: 0.13, wave: "triangle", gain: 0.065 },
    { frequency: 990, to: 330, duration: 0.13, at: 0.14, wave: "triangle", gain: 0.065 },
    { frequency: 2200, duration: 0.03, at: 0.13, wave: "noise", gain: 0.04 },
  ],
};

const legendaryMerges: Record<NonNullable<SkinTokens["character"]>, readonly Voice[]> = {
  fox: [
    { frequency: 3600, to: 1400, duration: 0.055, wave: "noise", gain: 0.04 },
    { frequency: 740, to: 1480, duration: 0.075, wave: "sawtooth", gain: 0.035, cutoff: 2200 },
    { frequency: 1109, to: 880, at: 0.065, duration: 0.12, gain: 0.035 },
  ],
  dragon: [
    { frequency: 130, to: 65, duration: 0.21, wave: "triangle", gain: 0.075, cutoff: 700 },
    { frequency: 650, to: 190, duration: 0.13, wave: "noise", gain: 0.045, attack: 0.02 },
    {
      frequency: 392,
      to: 294,
      at: 0.055,
      duration: 0.19,
      wave: "sawtooth",
      gain: 0.025,
      cutoff: 800,
    },
  ],
  phoenix: [
    { frequency: 900, to: 4200, duration: 0.18, wave: "noise", gain: 0.035, attack: 0.035 },
    { frequency: 659, to: 988, duration: 0.17, wave: "triangle", gain: 0.05, attack: 0.02 },
    { frequency: 1568, duration: 0.25, at: 0.1, gain: 0.03 },
    { frequency: 2093, duration: 0.18, at: 0.16, gain: 0.018 },
  ],
  cat: [
    {
      frequency: 520,
      to: 390,
      duration: 0.18,
      wave: "triangle",
      gain: 0.07,
      attack: 0.025,
      cutoff: 1200,
    },
    { frequency: 1040, to: 780, duration: 0.09, at: 0.025, gain: 0.025 },
  ],
  bunny: [
    { frequency: 620, to: 930, duration: 0.085, gain: 0.07 },
    { frequency: 1240, to: 1047, duration: 0.19, at: 0.115, gain: 0.05 },
    { frequency: 2900, duration: 0.04, at: 0.11, wave: "noise", gain: 0.025 },
  ],
  sentinel: [
    { frequency: 170, to: 85, duration: 0.09, wave: "triangle", gain: 0.075 },
    { frequency: 860, to: 430, duration: 0.12, at: 0.02, wave: "square", gain: 0.03, cutoff: 1800 },
    { frequency: 1290, duration: 0.18, at: 0.025, gain: 0.03 },
    { frequency: 3500, to: 900, duration: 0.055, wave: "noise", gain: 0.06 },
  ],
  runeknight: [
    { frequency: 294, duration: 0.28, wave: "triangle", gain: 0.06, cutoff: 900 },
    { frequency: 587, duration: 0.34, at: 0.045, gain: 0.04 },
    {
      frequency: 881,
      to: 1175,
      duration: 0.15,
      at: 0.1,
      wave: "sawtooth",
      gain: 0.025,
      cutoff: 1700,
    },
  ],
  diamond: [
    { frequency: 1047, duration: 0.24, gain: 0.055 },
    { frequency: 1568, duration: 0.31, at: 0.028, gain: 0.035 },
    { frequency: 2093, duration: 0.37, at: 0.06, gain: 0.025 },
    { frequency: 6200, to: 3200, duration: 0.045, wave: "noise", gain: 0.03 },
  ],
  crown: [
    { frequency: 392, duration: 0.28, wave: "sawtooth", gain: 0.05, attack: 0.025, cutoff: 950 },
    {
      frequency: 587,
      to: 784,
      duration: 0.27,
      at: 0.055,
      wave: "triangle",
      gain: 0.045,
      attack: 0.02,
    },
    { frequency: 988, to: 1175, duration: 0.34, at: 0.12, gain: 0.035 },
  ],
  arcanist: [
    { frequency: 523, to: 659, duration: 0.28, gain: 0.055, attack: 0.055 },
    {
      frequency: 784,
      to: 988,
      duration: 0.26,
      at: 0.09,
      wave: "triangle",
      gain: 0.035,
      attack: 0.045,
    },
    { frequency: 1568, to: 1319, duration: 0.27, at: 0.2, gain: 0.025, attack: 0.035 },
    { frequency: 1000, to: 3300, duration: 0.22, wave: "noise", gain: 0.025, attack: 0.07 },
  ],
};

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Map<AudioScheduledSourceNode, () => void>();
  private variations = new Map<string, number>();
  private settings = { ...DEFAULT_AUDIO };
  private lastPlayed = -Infinity;

  async unlock(): Promise<boolean> {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        let seed = 2048;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = seed / 2147483648 - 1;
        }
        this.setSettings(this.settings);
      }
      if (this.context.state !== "running") await this.context.resume();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  setSettings(settings: AudioSettings) {
    this.settings = settings;
    if (settings.muted || settings.volume === 0) this.stop();
    if (this.master) this.master.gain.value = settings.muted ? 0 : settings.volume;
  }

  play(sound: GameSound, tokens?: SkinTokens, skinId?: string) {
    const context = this.context;
    if (
      !context ||
      !this.master ||
      context.state !== "running" ||
      document.hidden ||
      this.settings.muted ||
      this.settings.volume === 0
    )
      return;
    const now = context.currentTime;
    const repeated = sound === "move" || sound === "merge";
    const result = sound === "win" || sound === "lose" || sound === "draw";
    const key = `${sound}:${skinId ?? tokens?.character ?? tokens?.tilePattern ?? "default"}`;
    const variant = this.variations.get(key) ?? 0;
    const base =
      sound === "merge" && tokens?.character
        ? legendaryMerges[tokens.character]
        : repeated
          ? (skinGesture(sound, tokens, skinId) ?? sounds[sound])
          : sounds[sound];
    const notes = repeated ? varyGesture(base, variant) : base;
    if (repeated && (now - this.lastPlayed < 0.045 || this.voices.size + notes.length > 12)) return;
    if (result || this.voices.size + notes.length > 12) this.stop();
    this.lastPlayed = now;
    if (repeated) this.variations.set(key, (variant + 1) % 4);
    for (const note of notes) {
      const start = now + (note.at ?? 0);
      const envelope = context.createGain();
      const filter = context.createBiquadFilter();
      filter.Q.value = 0.5;
      let source: OscillatorNode | AudioBufferSourceNode;
      if (note.wave === "noise") {
        const noise = context.createBufferSource();
        noise.buffer = this.noise;
        source = noise;
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(note.frequency, start);
        filter.frequency.exponentialRampToValueAtTime(
          note.to ?? note.frequency,
          start + note.duration,
        );
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = note.wave ?? "sine";
        oscillator.frequency.setValueAtTime(note.frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(
          note.to ?? note.frequency,
          start + note.duration,
        );
        source = oscillator;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(note.cutoff ?? 6500, start);
      }
      envelope.gain.setValueAtTime(0, start);
      // Twelve voices at <= .08 each keep headroom even at full user volume.
      envelope.gain.linearRampToValueAtTime(note.gain ?? 0.06, start + (note.attack ?? 0.004));
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      envelope.gain.linearRampToValueAtTime(0, start + note.duration + 0.005);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.master);
      const cleanup = () => {
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
        this.voices.delete(source);
      };
      this.voices.set(source, cleanup);
      source.onended = cleanup;
      source.start(start);
      source.stop(start + note.duration + 0.01);
    }
  }

  stop() {
    for (const [source, cleanup] of this.voices) {
      source.stop();
      cleanup();
    }
    this.lastPlayed = -Infinity;
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.noise = null;
    this.variations.clear();
  }
}
