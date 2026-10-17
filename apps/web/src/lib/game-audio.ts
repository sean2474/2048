import type { PublicPlayerState, S2C } from "schema/in-game";
import { SKINS, type SkinId, type SkinTokens } from "schema/loadout";

export const AUDIO_STORAGE_KEY = "duo.audio";
export const DEFAULT_AUDIO = { muted: false, volume: 0.45 };
export type AudioSettings = typeof DEFAULT_AUDIO;
export type GameSound = "move" | "merge" | "xblock" | "hardblock" | "incoming" | "impact" | "start" | "win" | "lose" | "draw";

export function parseAudioSettings(raw: string | null): AudioSettings {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value && typeof value.muted === "boolean" && typeof value.volume === "number" && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1) {
      return { muted: value.muted, volume: value.volume };
    }
  } catch { /* Invalid saved settings use the default volume. */ }
  return { ...DEFAULT_AUDIO };
}

type AudioPlayer = Pick<PublicPlayerState, "board" | "score" | "attacksSent">;
export function playerSound(previous: AudioPlayer, next: AudioPlayer): GameSound | null {
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

// Each tuple is [frequency, end frequency, offset, duration].
type Notes = readonly (readonly [number, number, number, number])[];
const sounds: Record<GameSound, Notes> = {
  move: [[180, 110, 0, 0.055]],
  merge: [[440, 660, 0, 0.09], [880, 880, 0.05, 0.1]],
  xblock: [[720, 180, 0, 0.16]],
  hardblock: [[150, 45, 0, 0.2], [75, 40, 0.03, 0.18]],
  incoming: [[330, 330, 0, 0.08], [330, 330, 0.12, 0.08]],
  impact: [[100, 35, 0, 0.18]],
  start: [[392, 392, 0, 0.12], [523, 523, 0.12, 0.2]],
  win: [[523, 523, 0, 0.18], [659, 659, 0.14, 0.18], [784, 784, 0.28, 0.35]],
  lose: [[330, 330, 0, 0.18], [262, 262, 0.16, 0.18], [196, 196, 0.32, 0.3]],
  draw: [[392, 392, 0, 0.15], [392, 392, 0.2, 0.22]],
};

const legendaryMerges: Record<NonNullable<SkinTokens["character"]>, { wave: OscillatorType; notes: Notes }> = {
  fox: { wave: "triangle", notes: [[740, 1109, 0, .07], [1480, 1175, .04, .13]] },
  dragon: { wave: "triangle", notes: [[196, 392, 0, .1], [587, 784, .04, .17], [1175, 1568, .09, .18]] },
  phoenix: { wave: "sine", notes: [[659, 988, 0, .12], [1319, 1760, .06, .17], [1976, 1568, .12, .2]] },
  cat: { wave: "triangle", notes: [[520, 780, 0, .07], [1040, 860, .045, .11]] },
  bunny: { wave: "sine", notes: [[620, 930, 0, .07], [1240, 1047, .055, .13]] },
  sentinel: { wave: "triangle", notes: [[170, 85, 0, .06], [860, 430, .015, .12], [1290, 645, .025, .1]] },
  runeknight: { wave: "triangle", notes: [[294, 294, 0, .1], [587, 587, .035, .16], [881, 1175, .07, .18]] },
  diamond: { wave: "sine", notes: [[1047, 1568, 0, .1], [1568, 2093, .035, .13], [2093, 2637, .07, .17]] },
  crown: { wave: "triangle", notes: [[392, 392, 0, .12], [587, 784, .04, .17], [988, 1175, .08, .2]] },
  arcanist: { wave: "sine", notes: [[523, 659, 0, .12], [784, 988, .05, .17], [1568, 1319, .1, .2]] },
};

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private settings = { ...DEFAULT_AUDIO };
  private lastPlayed = -Infinity;

  async unlock(): Promise<boolean> {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.setSettings(this.settings);
      }
      if (this.context.state !== "running") await this.context.resume();
      return this.context.state === "running";
    } catch { return false; }
  }

  setSettings(settings: AudioSettings) {
    this.settings = settings;
    if (settings.muted || settings.volume === 0) this.stop();
    if (this.master && this.context) this.master.gain.setValueAtTime(settings.muted ? 0 : settings.volume, this.context.currentTime);
  }

  play(sound: GameSound, skinId?: SkinId) {
    const context = this.context;
    if (!context || !this.master || context.state !== "running" || document.hidden || this.settings.muted || this.settings.volume === 0) return;
    const now = context.currentTime;
    const result = sound === "win" || sound === "lose" || sound === "draw";
    if (result) this.stop();
    else if (now - this.lastPlayed < 0.045 || this.voices.size >= 12) return;
    this.lastPlayed = now;
    const tokens: SkinTokens | undefined = sound === "merge" ? SKINS.find(skin => skin.id === skinId)?.tokens : undefined;
    const merge = tokens?.character ? legendaryMerges[tokens.character] : undefined;
    for (const [frequency, endFrequency, offset, duration] of merge?.notes ?? sounds[sound]) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = now + offset;
      oscillator.type = merge?.wave ?? (sound === "xblock" || sound === "hardblock" ? "triangle" : "sine");
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.12, start + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(this.master);
      this.voices.add(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.voices.delete(oscillator); };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    }
  }

  stop() {
    for (const oscillator of this.voices) { oscillator.stop(); oscillator.disconnect(); }
    this.voices.clear();
    this.lastPlayed = -Infinity;
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}
