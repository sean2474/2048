import { ABILITY_CHARGE, type PublicPlayerState, type S2C } from "schema/in-game";
import { type SkinTokens, type AbilityId } from "schema/loadout";

export const AUDIO_STORAGE_KEY = "duo.audio";
export const DEFAULT_AUDIO = { muted: false, volume: 0.45 };
export type AudioSettings = typeof DEFAULT_AUDIO;
export type GameSound = "move" | "merge" | "xblock" | "hardblock" | "incoming" | "impact" | "start" | "win" | "lose" | "draw" | AbilityId;

export function parseAudioSettings(raw: string | null): AudioSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value && typeof value.muted === "boolean" && typeof value.volume === "number" && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1) {
      return { muted: value.muted, volume: value.volume };
    }
  } catch { /* Invalid saved settings use the default volume. */ }
  return { ...DEFAULT_AUDIO };
}

type AudioPlayer = Pick<PublicPlayerState, "board" | "score" | "attacksSent"> & Partial<Pick<PublicPlayerState, "ability">>;
export function playerSound(previous: AudioPlayer, next: AudioPlayer): GameSound | null {
  if (previous.ability && next.ability && previous.ability.id === next.ability.id
    && previous.ability.charge >= ABILITY_CHARGE && next.ability.charge < ABILITY_CHARGE) return next.ability.id;
  for (const type of ["hardblock", "xblock"] as const) {
    if ((next.attacksSent?.[type] ?? 0) > (previous.attacksSent?.[type] ?? 0)) return type;
  }
  const before = previous.board.filter(tile => !tile.ghost);
  const after = next.board.filter(tile => !tile.ghost);
  if (after.some(tile => (tile.blockType === "xblock" || tile.blockType === "hardblock") && !before.some(old => old.id === tile.id))) return "impact";
  if (next.score > previous.score) return "merge";
  if (after.length !== before.length || after.some(tile => !before.some(old => old.id === tile.id && old.row === tile.row && old.col === tile.col && old.value === tile.value))) return "move";
  return null;
}

type GameState = Extract<S2C, { t: "state" | "end" }>;
export function matchSound(previous: GameState | null, next: GameState): GameSound | null {
  if (previous?.t === "end") return null;
  if (next.t === "end") return next.winner === "you" ? "win" : next.winner === "opp" ? "lose" : "draw";
  if (!previous) return next.paused ? null : "start";
  if (next.paused) return null;
  if (previous.paused) return previous.reconnectDeadline ? null : "start";
  return playerSound(previous.you, next.you) ?? (next.pendingAttacks > previous.pendingAttacks ? "incoming" : null);
}

type Voice = {
  frequency: number;
  to?: number;
  at?: number;
  duration: number;
  wave?: OscillatorType | "noise";
  gain?: number;
  attack?: number;
  cutoff?: number;
};

// Tone, texture and rhythm identify an event even without seeing the board.
const sounds: Record<GameSound, readonly Voice[]> = {
  move: [
    { frequency: 310, to: 190, duration: .045, wave: "triangle", gain: .045 },
    { frequency: 1800, to: 700, duration: .028, wave: "noise", gain: .025 },
  ],
  merge: [
    { frequency: 440, to: 438, duration: .19, wave: "triangle", gain: .075, cutoff: 1800 },
    { frequency: 880, duration: .27, at: .035, gain: .04 },
  ],
  xblock: [
    { frequency: 720, to: 180, duration: .17, wave: "sawtooth", gain: .055, cutoff: 1900 },
    { frequency: 3800, to: 900, duration: .1, wave: "noise", gain: .05 },
  ],
  hardblock: [
    { frequency: 150, to: 48, duration: .28, gain: .08 },
    { frequency: 73, to: 41, duration: .3, at: .025, wave: "triangle", gain: .06 },
    { frequency: 1500, to: 350, duration: .09, wave: "noise", gain: .07 },
  ],
  incoming: [
    { frequency: 740, duration: .07, wave: "square", gain: .035, cutoff: 1200 },
    { frequency: 554, duration: .1, at: .12, wave: "square", gain: .035, cutoff: 1000 },
  ],
  impact: [
    { frequency: 95, to: 38, duration: .19, gain: .075 },
    { frequency: 600, to: 170, duration: .15, wave: "noise", gain: .075 },
    { frequency: 230, to: 110, duration: .07, at: .035, wave: "triangle", gain: .04 },
  ],
  start: [
    { frequency: 392, duration: .06, wave: "triangle", gain: .06 },
    { frequency: 392, duration: .06, at: .1, wave: "triangle", gain: .06 },
    { frequency: 523, duration: .26, at: .22, wave: "sawtooth", gain: .05, attack: .015, cutoff: 1100 },
    { frequency: 1046, duration: .24, at: .22, gain: .025 },
  ],
  win: [
    { frequency: 523, duration: .17, wave: "triangle", gain: .065 },
    { frequency: 659, duration: .17, at: .11, wave: "triangle", gain: .065 },
    { frequency: 784, duration: .23, at: .22, wave: "triangle", gain: .065 },
    { frequency: 1046, duration: .52, at: .38, gain: .06 },
    { frequency: 523, duration: .48, at: .38, wave: "triangle", gain: .04 },
    { frequency: 4200, to: 2200, duration: .2, at: .38, wave: "noise", gain: .025, attack: .03 },
  ],
  lose: [
    { frequency: 220, to: 146.83, duration: .42, wave: "triangle", gain: .065, attack: .025, cutoff: 650 },
    { frequency: 164.81, to: 110, duration: .5, at: .22, gain: .045, attack: .035 },
    { frequency: 900, to: 220, duration: .36, at: .1, wave: "noise", gain: .025, attack: .08 },
  ],
  draw: [
    { frequency: 392, duration: .24, wave: "triangle", gain: .06 },
    { frequency: 587, duration: .24, at: .12, wave: "triangle", gain: .045 },
    { frequency: 440, duration: .32, at: .3, gain: .04 },
  ],
  "clear-x": [
    { frequency: 1600, to: 250, duration: .12, wave: "noise", gain: .065 },
    { frequency: 880, to: 1320, duration: .18, at: .05, gain: .055 },
  ],
  "spawn-pause": [
    { frequency: 350, to: 1100, duration: .35, wave: "noise", gain: .045, attack: .1 },
    { frequency: 349, duration: .42, wave: "triangle", gain: .045, attack: .07, cutoff: 700 },
    { frequency: 523, duration: .38, at: .08, gain: .035, attack: .07 },
  ],
  "frost-wave": [
    { frequency: 5000, to: 950, duration: .34, wave: "noise", gain: .055, attack: .03 },
    { frequency: 1760, to: 880, duration: .24, gain: .04 },
    { frequency: 2637, to: 1319, duration: .2, at: .09, gain: .025 },
  ],
  "anchor-tile": [
    { frequency: 110, to: 55, duration: .23, wave: "triangle", gain: .075 },
    { frequency: 2100, to: 800, duration: .035, at: .09, wave: "noise", gain: .065 },
    { frequency: 330, duration: .11, at: .1, wave: "square", gain: .025, cutoff: 700 },
  ],
  "swap-32": [
    { frequency: 330, to: 990, duration: .13, wave: "triangle", gain: .065 },
    { frequency: 990, to: 330, duration: .13, at: .14, wave: "triangle", gain: .065 },
    { frequency: 2200, duration: .03, at: .13, wave: "noise", gain: .04 },
  ],
};

const legendaryMerges: Record<NonNullable<SkinTokens["character"]>, readonly Voice[]> = {
  cat: [
    { frequency: 520, to: 390, duration: .18, wave: "triangle", gain: .07, attack: .025, cutoff: 1200 },
    { frequency: 1040, to: 780, duration: .09, at: .025, gain: .025 },
  ],
  bunny: [
    { frequency: 620, to: 930, duration: .085, gain: .07 },
    { frequency: 1240, to: 1047, duration: .19, at: .115, gain: .05 },
    { frequency: 2900, duration: .04, at: .11, wave: "noise", gain: .025 },
  ],
  sentinel: [
    { frequency: 170, to: 85, duration: .09, wave: "triangle", gain: .075 },
    { frequency: 860, to: 430, duration: .12, at: .02, wave: "square", gain: .03, cutoff: 1800 },
    { frequency: 1290, duration: .18, at: .025, gain: .03 },
    { frequency: 3500, to: 900, duration: .055, wave: "noise", gain: .06 },
  ],
  runeknight: [
    { frequency: 294, duration: .28, wave: "triangle", gain: .06, cutoff: 900 },
    { frequency: 587, duration: .34, at: .045, gain: .04 },
    { frequency: 881, to: 1175, duration: .15, at: .1, wave: "sawtooth", gain: .025, cutoff: 1700 },
  ],
  diamond: [
    { frequency: 1047, duration: .24, gain: .055 },
    { frequency: 1568, duration: .31, at: .028, gain: .035 },
    { frequency: 2093, duration: .37, at: .06, gain: .025 },
    { frequency: 6200, to: 3200, duration: .045, wave: "noise", gain: .03 },
  ],
  crown: [
    { frequency: 392, duration: .28, wave: "sawtooth", gain: .05, attack: .025, cutoff: 950 },
    { frequency: 587, to: 784, duration: .27, at: .055, wave: "triangle", gain: .045, attack: .02 },
    { frequency: 988, to: 1175, duration: .34, at: .12, gain: .035 },
  ],
  arcanist: [
    { frequency: 523, to: 659, duration: .28, gain: .055, attack: .055 },
    { frequency: 784, to: 988, duration: .26, at: .09, wave: "triangle", gain: .035, attack: .045 },
    { frequency: 1568, to: 1319, duration: .27, at: .2, gain: .025, attack: .035 },
    { frequency: 1000, to: 3300, duration: .22, wave: "noise", gain: .025, attack: .07 },
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
    } catch { return false; }
  }

  setSettings(settings: AudioSettings) {
    this.settings = settings;
    if (settings.muted || settings.volume === 0) this.stop();
    if (this.master) this.master.gain.value = settings.muted ? 0 : settings.volume;
  }

  play(sound: GameSound, tokens?: SkinTokens) {
    const context = this.context;
    if (!context || !this.master || context.state !== "running" || document.hidden || this.settings.muted || this.settings.volume === 0) return;
    const now = context.currentTime;
    const repeated = sound === "move" || sound === "merge";
    const result = sound === "win" || sound === "lose" || sound === "draw";
    const notes = sound === "merge" && tokens?.character ? legendaryMerges[tokens.character] : sounds[sound];
    if (repeated && (now - this.lastPlayed < .045 || this.voices.size + notes.length > 12)) return;
    if (result || this.voices.size + notes.length > 12) this.stop();
    this.lastPlayed = now;
    const key = `${sound}:${tokens?.character ?? "default"}`;
    const variant = this.variations.get(key) ?? 0;
    const pitch = sound === "merge" ? [1, 1.125, 1.25, 1.5][variant] : sound === "move" ? [1, .94, 1.06, .98][variant] : 1;
    if (repeated) this.variations.set(key, (variant + 1) % 4);
    for (const note of notes) {
      const start = now + (note.at ?? 0) * (repeated && variant % 2 ? .85 : 1);
      const envelope = context.createGain();
      const filter = context.createBiquadFilter();
      filter.Q.value = .5;
      let source: OscillatorNode | AudioBufferSourceNode;
      if (note.wave === "noise") {
        const noise = context.createBufferSource();
        noise.buffer = this.noise;
        source = noise;
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(note.frequency, start);
        filter.frequency.exponentialRampToValueAtTime(note.to ?? note.frequency, start + note.duration);
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = note.wave ?? "sine";
        oscillator.frequency.setValueAtTime(note.frequency * pitch, start);
        oscillator.frequency.exponentialRampToValueAtTime((note.to ?? note.frequency) * pitch, start + note.duration);
        source = oscillator;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(note.cutoff ?? 6500, start);
      }
      envelope.gain.setValueAtTime(0, start);
      // Twelve voices at <= .08 each keep headroom even at full user volume.
      envelope.gain.linearRampToValueAtTime(note.gain ?? .06, start + (note.attack ?? .004));
      envelope.gain.exponentialRampToValueAtTime(.0001, start + note.duration);
      envelope.gain.linearRampToValueAtTime(0, start + note.duration + .005);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(this.master);
      const cleanup = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); this.voices.delete(source); };
      this.voices.set(source, cleanup);
      source.onended = cleanup;
      source.start(start);
      source.stop(start + note.duration + .01);
    }
  }

  stop() {
    for (const [source, cleanup] of this.voices) { source.stop(); cleanup(); }
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
